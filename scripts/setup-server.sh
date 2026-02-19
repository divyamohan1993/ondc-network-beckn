#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# ONDC Network — One-Command Server Setup
# ──────────────────────────────────────────────────────────────
# Run on any fresh Ubuntu/Debian server:
#   curl -fsSL https://raw.githubusercontent.com/divyamohan1993/ondc-network-beckn/main/scripts/setup-server.sh | sudo bash
#
# Or after cloning:
#   sudo bash scripts/setup-server.sh [--dir /opt/ondc] [--ghcr-user <user>] [--ghcr-token <pat>]
#
# What this does:
#   1. Installs Docker Engine + Compose plugin (if missing)
#   2. Clones the repo (if not already cloned)
#   3. Runs autoconfig.sh to generate .env with all secrets
#   4. Logs into GHCR to pull private images
#   5. Sets COMPOSE_FILE for the deploy overlay
#   6. Starts all services (images pulled from GHCR)
#   7. Sets up Watchtower for automatic future updates
#   8. Installs a systemd timer that syncs config (compose files, nginx, db schema) every 10 minutes
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──
DEPLOY_DIR="/opt/ondc"
REPO_URL="https://github.com/divyamohan1993/ondc-network-beckn.git"
GHCR_USER=""
GHCR_TOKEN=""
DOMAIN=""
ADMIN_EMAIL=""
PRODUCTION=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
log()     { echo -e "${BLUE}[setup]${NC} $*"; }
success() { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $*"; }
fail()    { echo -e "${RED}[setup]${NC} $*"; exit 1; }

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)         DEPLOY_DIR="$2"; shift 2 ;;
    --ghcr-user)   GHCR_USER="$2"; shift 2 ;;
    --ghcr-token)  GHCR_TOKEN="$2"; shift 2 ;;
    --domain)      DOMAIN="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --production)  PRODUCTION=true; shift ;;
    --repo)        REPO_URL="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Root check ──
if [[ $EUID -ne 0 ]]; then
  fail "This script must be run as root (sudo)"
fi

echo ""
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  ONDC Network — Server Setup${NC}"
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Install Docker
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
  success "Docker + Compose already installed"
else
  log "Installing Docker Engine..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release > /dev/null

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin > /dev/null
  systemctl enable docker --now
  success "Docker installed"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Clone repo
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ -d "$DEPLOY_DIR/.git" ]]; then
  log "Repo already cloned at $DEPLOY_DIR, pulling latest..."
  git -C "$DEPLOY_DIR" pull --quiet
else
  log "Cloning repo to $DEPLOY_DIR..."
  git clone "$REPO_URL" "$DEPLOY_DIR" --quiet
fi

cd "$DEPLOY_DIR"
success "Repo ready at $DEPLOY_DIR"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Generate .env via autoconfig.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ ! -f .env ]]; then
  log "Running autoconfig.sh to generate .env..."
  AUTOCONFIG_ARGS=""
  [[ "$PRODUCTION" == "true" ]] && AUTOCONFIG_ARGS+=" --production"
  [[ -n "$DOMAIN" ]] && AUTOCONFIG_ARGS+=" --domain $DOMAIN"
  [[ -n "$ADMIN_EMAIL" ]] && AUTOCONFIG_ARGS+=" --admin-email $ADMIN_EMAIL"
  bash autoconfig.sh $AUTOCONFIG_ARGS
  success ".env generated with all secrets"
else
  success ".env already exists, skipping autoconfig"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: GHCR login
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ -n "$GHCR_USER" && -n "$GHCR_TOKEN" ]]; then
  log "Logging into GHCR..."
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
  success "GHCR login successful"
elif docker pull ghcr.io/divyamohan1993/ondc-docs:latest > /dev/null 2>&1; then
  success "GHCR already accessible (images are public or previously logged in)"
else
  warn "GHCR login skipped. If images are private, re-run with:"
  warn "  --ghcr-user <github-username> --ghcr-token <personal-access-token>"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 5: Set COMPOSE_FILE and add deploy vars to .env
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPOSE_FILE_VALUE="docker-compose.yml:docker-compose.prod.yml:docker-compose.deploy.yml"

if ! grep -q "^COMPOSE_FILE=" .env 2>/dev/null; then
  echo "" >> .env
  echo "# ── Deployment ──" >> .env
  echo "COMPOSE_FILE=$COMPOSE_FILE_VALUE" >> .env
  echo "IMAGE_TAG=latest" >> .env
  echo "WATCHTOWER_POLL_INTERVAL=300" >> .env
  success "Deploy config added to .env"
fi

export COMPOSE_FILE="$COMPOSE_FILE_VALUE"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 6: Pull images and start services
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log "Pulling images from GHCR..."
docker compose pull || warn "Some images failed to pull (may not be published yet)"

log "Starting all services..."
docker compose up -d --no-build --remove-orphans

success "Services started"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 7: Config sync timer (git pull compose/nginx/db changes)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log "Setting up config sync timer..."

cat > /etc/systemd/system/ondc-config-sync.service << UNIT
[Unit]
Description=ONDC config sync — pull latest compose, nginx, and DB schema from git
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/bin/bash -c 'git fetch origin main --quiet && git checkout origin/main -- docker-compose.yml docker-compose.prod.yml docker-compose.deploy.yml nginx/nginx.conf db/init.sql scripts/ 2>/dev/null && docker compose up -d --no-build --remove-orphans 2>/dev/null'
UNIT

cat > /etc/systemd/system/ondc-config-sync.timer << UNIT
[Unit]
Description=Sync ONDC config every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now ondc-config-sync.timer
success "Config sync timer active (every 10 minutes)"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Done
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Auto-update:${NC}  Watchtower polls GHCR every 5 min"
echo -e "  ${BOLD}Config sync:${NC}  systemd timer pulls config every 10 min"
echo -e "  ${BOLD}Deploy dir:${NC}   $DEPLOY_DIR"
echo ""
echo -e "  ${BOLD}View status:${NC}  cd $DEPLOY_DIR && docker compose ps"
echo -e "  ${BOLD}View logs:${NC}    cd $DEPLOY_DIR && docker compose logs -f"
echo -e "  ${BOLD}Manual pull:${NC}  cd $DEPLOY_DIR && docker compose pull && docker compose up -d --no-build"
echo ""

docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
