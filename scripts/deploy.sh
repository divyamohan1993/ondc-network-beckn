#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# ONDC Network Beckn — Production Deployment Script
# ──────────────────────────────────────────────────────────────
# Called by the GitHub Actions deploy job via SSH, or manually:
#   ./scripts/deploy.sh [--tag <image-tag>]
#
# Prerequisites on the deploy server:
#   - Docker Engine 24+ with Compose plugin
#   - GHCR login: docker login ghcr.io -u <user> --password-stdin
#   - .env file at $DEPLOY_DIR with all required secrets
# ──────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/ondc}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml"
HEALTHCHECK_TIMEOUT=120
HEALTHCHECK_INTERVAL=5

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    --dir) DEPLOY_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

export IMAGE_TAG

log() { echo "[deploy] $(date '+%H:%M:%S') $*"; }

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
