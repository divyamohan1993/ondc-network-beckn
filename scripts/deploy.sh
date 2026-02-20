#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# ONDC Network Beckn — Production Deployment Script
# ──────────────────────────────────────────────────────────────
# Usage:
#   deploy.sh [docker|k8s|vm] [--tag <tag>] [--dir <path>]
#
# Modes:
#   docker  - Docker Compose rolling deploy (default, existing behavior)
#   k8s     - Kubernetes rolling update via kustomize
#   vm      - Direct VM deployment via PM2/systemd
#
# Prerequisites:
#   docker  - Server set up via: sudo bash scripts/setup-server.sh
#   k8s     - kubectl configured, kustomize available, ondc namespace exists
#   vm      - Node.js, pnpm, PM2 or systemd configured
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ── Detect deployment mode ──
MODE="${1:-docker}"
case "$MODE" in
  docker|k8s|vm) shift ;;
  --*) MODE="docker" ;;
esac

# ── Defaults ──
DEPLOY_DIR="${DEPLOY_DIR:-/opt/ondc}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml"
HEALTHCHECK_TIMEOUT=120
HEALTHCHECK_INTERVAL=5

# Application services (excludes infra: postgres, redis, rabbitmq, nginx)
APP_SERVICES=(
  registry
  gateway
  bap
  bpp
  admin
  docs
  vault
  orchestrator
  health-monitor
  log-aggregator
  simulation-engine
  mock-server
)

# Service ports for VM health checks
declare -A SERVICE_PORTS=(
  [registry]=3001
  [gateway]=3002
  [admin]=3003
  [bap]=3004
  [bpp]=3005
  [vault]=3006
  [orchestrator]=3007
  [health-monitor]=3008
  [log-aggregator]=3009
  [mock-server]=3010
  [simulation-engine]=3011
  [docs]=3000
)

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    --dir) DEPLOY_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

export IMAGE_TAG

log() { echo "[deploy:$MODE] $(date '+%H:%M:%S') $*"; }

# ══════════════════════════════════════════════════════════════
# Docker Compose Mode
# ══════════════════════════════════════════════════════════════
deploy_docker() {
  cd "$DEPLOY_DIR"

  # ── 1. Pull latest compose files from repo ──
  if [ -d .git ]; then
    log "Pulling latest configuration from git..."
    git fetch origin main --quiet
    git checkout origin/main -- docker-compose.yml docker-compose.prod.yml docker-compose.deploy.yml nginx/nginx.conf db/init.sql
  fi

  # ── 2. Pull new images ──
  log "Pulling images (tag: $IMAGE_TAG)..."
  docker compose $COMPOSE_FILES pull

  # ── 3. Rolling deploy — infrastructure stays up, app services restart ──
  log "Restarting application services..."
  docker compose $COMPOSE_FILES up -d --no-build --remove-orphans

  # ── 4. Wait for health checks ──
  log "Waiting for services to become healthy (timeout: ${HEALTHCHECK_TIMEOUT}s)..."
  SERVICES=$(docker compose $COMPOSE_FILES ps --format '{{.Name}}' 2>/dev/null || true)
  ELAPSED=0

  all_healthy() {
    for svc in $SERVICES; do
      STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "none")
      if [ "$STATUS" = "starting" ]; then
        return 1
      fi
      if [ "$STATUS" = "unhealthy" ]; then
        log "WARNING: $svc is unhealthy"
        return 1
      fi
    done
    return 0
  }

  while [ $ELAPSED -lt $HEALTHCHECK_TIMEOUT ]; do
    if all_healthy; then
      log "All services healthy!"
      break
    fi
    sleep $HEALTHCHECK_INTERVAL
    ELAPSED=$((ELAPSED + HEALTHCHECK_INTERVAL))
  done

  if [ $ELAPSED -ge $HEALTHCHECK_TIMEOUT ]; then
    log "WARNING: Some services did not become healthy within ${HEALTHCHECK_TIMEOUT}s"
    docker compose $COMPOSE_FILES ps
    exit 1
  fi

  # ── 5. Cleanup old images ──
  log "Pruning dangling images..."
  docker image prune -f --filter "until=24h" > /dev/null 2>&1 || true

  # ── Done ──
  log "Deployment complete (tag: $IMAGE_TAG)"
  docker compose $COMPOSE_FILES ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
}

# ══════════════════════════════════════════════════════════════
# Kubernetes Mode
# ══════════════════════════════════════════════════════════════
deploy_k8s() {
  local K8S_NAMESPACE="ondc"
  local ROLLOUT_TIMEOUT="120s"
  local IMAGE_REGISTRY="ghcr.io/divyamohan1993"

  cd "$DEPLOY_DIR"

  # ── 1. Pull latest K8s manifests from git ──
  if [ -d .git ]; then
    log "Pulling latest Kubernetes manifests from git..."
    git fetch origin main --quiet
    git reset --hard origin/main --quiet 2>/dev/null || git checkout origin/main -- .
  fi

  # ── 2. Update image tags for each service ──
  log "Updating image tags to $IMAGE_TAG..."
  for svc in "${APP_SERVICES[@]}"; do
    log "  Setting $svc image to ${IMAGE_REGISTRY}/ondc-${svc}:${IMAGE_TAG}"
    kubectl set image "deployment/${svc}" \
      "${svc}=${IMAGE_REGISTRY}/ondc-${svc}:${IMAGE_TAG}" \
      -n "$K8S_NAMESPACE" 2>/dev/null || {
        log "WARNING: deployment/${svc} not found in namespace ${K8S_NAMESPACE}, skipping"
        continue
      }
  done

  # ── 3. Wait for rollouts to complete ──
  log "Waiting for rollouts to complete (timeout: ${ROLLOUT_TIMEOUT})..."
  local FAILED=0
  for svc in "${APP_SERVICES[@]}"; do
    if kubectl get "deployment/${svc}" -n "$K8S_NAMESPACE" &>/dev/null; then
      log "  Waiting for deployment/${svc}..."
      if ! kubectl rollout status "deployment/${svc}" \
        -n "$K8S_NAMESPACE" \
        --timeout="$ROLLOUT_TIMEOUT"; then
        log "WARNING: deployment/${svc} did not complete rollout within ${ROLLOUT_TIMEOUT}"
        FAILED=$((FAILED + 1))
      fi
    fi
  done

  if [ $FAILED -gt 0 ]; then
    log "ERROR: $FAILED deployment(s) failed to roll out"
    kubectl get pods -n "$K8S_NAMESPACE"
    exit 1
  fi

  # ── 4. Run k8s health check script ──
  log "Running Kubernetes health checks..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "${SCRIPT_DIR}/k8s-helpers/health-check.sh" ]; then
    bash "${SCRIPT_DIR}/k8s-helpers/health-check.sh" --namespace "$K8S_NAMESPACE"
  else
    log "WARNING: k8s-helpers/health-check.sh not found, skipping health checks"
  fi

  # ── 5. Summary ──
  log "Deployment complete (tag: $IMAGE_TAG)"
  echo ""
  kubectl get pods -n "$K8S_NAMESPACE" -o wide
}

# ══════════════════════════════════════════════════════════════
# VM Mode (PM2 / systemd)
# ══════════════════════════════════════════════════════════════
deploy_vm() {
  cd "$DEPLOY_DIR"

  # ── 1. Pull latest code from git ──
  if [ -d .git ]; then
    log "Pulling latest code from git..."
    git fetch origin main --quiet
    git reset --hard origin/main --quiet 2>/dev/null || git checkout origin/main -- .
  fi

  # ── 2. Install dependencies ──
  log "Installing dependencies..."
  pnpm install --frozen-lockfile

  # ── 3. Build all packages ──
  log "Building all packages..."
  pnpm build

  # ── 4. Restart services ──
  if [ -f ecosystem.config.js ] || [ -f ecosystem.config.cjs ]; then
    # PM2 mode
    local ECOSYSTEM_FILE
    if [ -f ecosystem.config.js ]; then
      ECOSYSTEM_FILE="ecosystem.config.js"
    else
      ECOSYSTEM_FILE="ecosystem.config.cjs"
    fi

    log "Restarting services via PM2 (${ECOSYSTEM_FILE})..."
    if pm2 list 2>/dev/null | grep -q "ondc"; then
      pm2 restart "$ECOSYSTEM_FILE" --update-env
    else
      pm2 start "$ECOSYSTEM_FILE"
    fi
    pm2 save
  elif systemctl list-units --type=service 2>/dev/null | grep -q "ondc-"; then
    # systemd mode
    log "Restarting services via systemd..."
    for svc in "${APP_SERVICES[@]}"; do
      local UNIT="ondc-${svc}.service"
      if systemctl is-enabled "$UNIT" &>/dev/null; then
        log "  Restarting $UNIT..."
        sudo systemctl restart "$UNIT"
      else
        log "  WARNING: $UNIT not found or not enabled, skipping"
      fi
    done
  else
    log "ERROR: Neither PM2 ecosystem config nor systemd ondc-* units found"
    log "  Create ecosystem.config.js for PM2 or install systemd units"
    exit 1
  fi

  # ── 5. Health check by curling localhost ports ──
  log "Waiting for services to start (${HEALTHCHECK_TIMEOUT}s timeout)..."
  sleep 5  # Give services a moment to bind ports

  local HEALTHY=0
  local UNHEALTHY=0
  local TOTAL=0

  for svc in "${APP_SERVICES[@]}"; do
    local PORT="${SERVICE_PORTS[$svc]:-}"
    if [ -z "$PORT" ]; then
      continue
    fi

    TOTAL=$((TOTAL + 1))
    local ELAPSED=0
    local SVC_HEALTHY=false

    while [ $ELAPSED -lt $HEALTHCHECK_TIMEOUT ]; do
      HTTP_CODE=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" \
        "http://localhost:${PORT}/health" 2>/dev/null) || HTTP_CODE="000"

      if [ "$HTTP_CODE" = "200" ]; then
        SVC_HEALTHY=true
        break
      fi

      sleep $HEALTHCHECK_INTERVAL
      ELAPSED=$((ELAPSED + HEALTHCHECK_INTERVAL))
    done

    if $SVC_HEALTHY; then
      log "  OK    $svc :$PORT"
      HEALTHY=$((HEALTHY + 1))
    else
      log "  FAIL  $svc :$PORT (HTTP $HTTP_CODE)"
      UNHEALTHY=$((UNHEALTHY + 1))
    fi
  done

  # ── Summary ──
  echo ""
  log "Health check results: ${HEALTHY}/${TOTAL} healthy, ${UNHEALTHY}/${TOTAL} unhealthy"

  if [ $UNHEALTHY -gt 0 ]; then
    log "WARNING: $UNHEALTHY service(s) failed health check"
    if command -v pm2 &>/dev/null; then
      pm2 status
    fi
    exit 1
  fi

  log "Deployment complete"
  if command -v pm2 &>/dev/null; then
    pm2 status
  fi
}

# ══════════════════════════════════════════════════════════════
# Main — dispatch to the selected mode
# ══════════════════════════════════════════════════════════════
log "Starting deployment (mode: $MODE, tag: $IMAGE_TAG, dir: $DEPLOY_DIR)"

case "$MODE" in
  docker) deploy_docker ;;
  k8s)    deploy_k8s ;;
  vm)     deploy_vm ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Usage: deploy.sh [docker|k8s|vm] [--tag <tag>] [--dir <path>]"
    exit 1
    ;;
esac
