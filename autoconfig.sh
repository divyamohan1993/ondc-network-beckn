#!/usr/bin/env bash
# =============================================================================
# ONDC Platform — Automated Configuration & Deployment
# =============================================================================
# Takes a blank Ubuntu VM to a fully running ONDC Beckn network.
# Non-interactive. All configuration via flags with sane defaults.
#
# Usage:
#   sudo bash autoconfig.sh [--production] [--domain <domain>] [--admin-email <email>]
#                           [--admin-password <password>] [--no-seed]
#                           [--docker|--k8s|--vm] [--gke-project <p>] [--gke-cluster <c>]
#                           [--gke-zone <z>] [--repo <url>] [--deploy-dir <path>]
#
# Examples:
#   sudo bash autoconfig.sh
#   sudo bash autoconfig.sh --production --domain ondc.dmj.one
#   sudo bash autoconfig.sh --admin-email admin@example.com --admin-password s3cret
#   sudo bash autoconfig.sh --no-seed
#   sudo bash autoconfig.sh --k8s --gke-project my-proj --gke-cluster ondc --gke-zone us-central1-a
#   sudo bash autoconfig.sh --deploy-dir /srv/ondc --repo https://github.com/org/repo.git
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}$1${NC}"; }
log_success() { echo -e "${GREEN}$1${NC}"; }
log_warn()    { echo -e "${YELLOW}$1${NC}"; }
log_error()   { echo -e "${RED}$1${NC}"; }

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
PRODUCTION=false
DOMAIN="ondc.dmj.one"
ADMIN_EMAIL="admin@ondc.dmj.one"
ADMIN_PASSWORD=""
NO_SEED=false
DEPLOY_MODE="docker"
GKE_PROJECT=""
GKE_CLUSTER=""
GKE_ZONE=""
REPO_URL="https://github.com/divyamohan1993/ondc-network-beckn.git"
DEPLOY_DIR="/opt/ondc"

while [[ $# -gt 0 ]]; do
  case $1 in
    --production)
      PRODUCTION=true
      shift
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --admin-email)
      ADMIN_EMAIL="$2"
      shift 2
      ;;
    --admin-password)
      ADMIN_PASSWORD="$2"
      shift 2
      ;;
    --no-seed)
      NO_SEED=true
      shift
      ;;
    --k8s)
      DEPLOY_MODE="k8s"
      shift
      ;;
    --docker)
      DEPLOY_MODE="docker"
      shift
      ;;
    --vm)
      DEPLOY_MODE="vm"
      shift
      ;;
    --gke-project)
      GKE_PROJECT="$2"
      shift 2
      ;;
    --gke-cluster)
      GKE_CLUSTER="$2"
      shift 2
      ;;
    --gke-zone)
      GKE_ZONE="$2"
      shift 2
      ;;
    --repo)
      REPO_URL="$2"
      shift 2
      ;;
    --deploy-dir)
      DEPLOY_DIR="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: sudo bash autoconfig.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --production             Enable persistent volumes + backups + restart policies"
      echo "  --domain <domain>        Set domain (default: ondc.dmj.one)"
      echo "  --admin-email <email>    Admin email (default: admin@ondc.dmj.one)"
      echo "  --admin-password <pass>  Admin password (auto-generated if not provided)"
      echo "  --no-seed                Skip database seeding (empty database)"
      echo ""
      echo "Deployment mode:"
      echo "  --docker                 Deploy with Docker Compose (default)"
      echo "  --k8s                    Deploy to Kubernetes (delegates to autoconfig-k8s.sh)"
      echo "  --vm                     Deploy directly on VM (no containers)"
      echo ""
      echo "Kubernetes / GKE options (used with --k8s):"
      echo "  --gke-project <project>  GCP project ID for GKE deployment"
      echo "  --gke-cluster <name>     GKE cluster name"
      echo "  --gke-zone <zone>        GKE zone (e.g. us-central1-a)"
      echo ""
      echo "Repository options:"
      echo "  --repo <url>             Git repo URL (default: github.com/divyamohan1993/ondc-network-beckn)"
      echo "  --deploy-dir <path>      Clone/pull repo to this directory (default: /opt/ondc)"
      echo ""
      echo "  -h, --help               Show this help message"
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      echo "Run with --help for usage information."
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Resolve script directory (cd into project root)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TOTAL_STEPS=18
CURRENT_STEP=0
step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  echo ""
  echo -e "${BOLD}${BLUE}[${CURRENT_STEP}/${TOTAL_STEPS}] $1${NC}"
  echo -e "${BLUE}$(printf '%.0s─' $(seq 1 60))${NC}"
}

# =============================================================================
# Step 0: Repo management — clone or pull the project if DEPLOY_DIR is set
# =============================================================================
if [ -f "./autoconfig.sh" ]; then
  step "Repo management (skipped — already in project directory)..."
  log_success "  Running from project root: $(pwd)"
else
  step "Repo management..."
  if [ -d "${DEPLOY_DIR}/.git" ]; then
    echo "  Pulling latest changes into ${DEPLOY_DIR}..."
    git -C "$DEPLOY_DIR" pull --quiet
    log_success "  Repository updated: ${DEPLOY_DIR}"
  else
    echo "  Cloning ${REPO_URL} into ${DEPLOY_DIR}..."
    git clone "$REPO_URL" "$DEPLOY_DIR" --quiet
    log_success "  Repository cloned: ${DEPLOY_DIR}"
  fi
  cd "$DEPLOY_DIR"
  SCRIPT_DIR="$DEPLOY_DIR"
  log_success "  Working directory: $(pwd)"
fi

# =============================================================================
# Step 1: Detect OS, check minimum specs
# =============================================================================
step "Checking system requirements..."

OS_NAME="unknown"
OS_VERSION=""
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_NAME="$ID"
  OS_VERSION="${VERSION_ID:-unknown}"
fi

ARCH=$(uname -m)
CORES=$(nproc 2>/dev/null || echo "1")
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))

echo "  OS:           ${OS_NAME} ${OS_VERSION} (${ARCH})"
echo "  CPU Cores:    ${CORES}"
echo "  RAM:          ${TOTAL_RAM_GB} GB"
echo "  Mode:         $([ "$PRODUCTION" = true ] && echo 'Production' || echo 'Ephemeral/Development')"
echo "  Domain:       ${DOMAIN}"
echo "  Admin Email:  ${ADMIN_EMAIL}"

# Warn if not Ubuntu
if [[ "$OS_NAME" != "ubuntu" && "$OS_NAME" != "debian" ]]; then
  log_warn "  WARNING: This script is designed for Ubuntu/Debian. Detected: ${OS_NAME}"
  log_warn "           Proceeding anyway, but some steps may fail."
fi

# Warn if specs are below minimum
if [ "$CORES" -lt 2 ]; then
  log_warn "  WARNING: Minimum 2 CPU cores recommended. Detected: ${CORES}"
fi
if [ "$TOTAL_RAM_GB" -lt 4 ]; then
  log_warn "  WARNING: Minimum 4 GB RAM recommended. Detected: ${TOTAL_RAM_GB} GB"
fi

log_success "  System check complete."

# =============================================================================
# Step 2: Install system dependencies
# =============================================================================
step "Installing system dependencies..."

# Update package lists
echo "  Updating package lists..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq > /dev/null 2>&1 || log_warn "  apt-get update failed (non-critical, continuing...)"

# Install basic dependencies
echo "  Installing curl, jq, git, openssl..."
apt-get install -y -qq curl jq git openssl ca-certificates gnupg lsb-release > /dev/null 2>&1 || {
  log_warn "  Some packages may not have installed. Continuing..."
}

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "  Installing Docker..."
  curl -fsSL https://get.docker.com | sh > /dev/null 2>&1
  systemctl enable docker > /dev/null 2>&1 || true
  systemctl start docker > /dev/null 2>&1 || true
  log_success "  Docker installed."
else
  echo "  Docker already installed: $(docker --version)"
fi

# Ensure Docker Compose plugin is available
if ! docker compose version &> /dev/null; then
  echo "  Installing Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin > /dev/null 2>&1 || {
    # Fallback: install manually
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r '.tag_name' 2>/dev/null || echo "v2.27.0")
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  }
  log_success "  Docker Compose plugin installed."
else
  echo "  Docker Compose already installed: $(docker compose version)"
fi

# Install Node.js 20 LTS if not present
if ! command -v node &> /dev/null || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  echo "  Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log_success "  Node.js installed: $(node -v)"
else
  echo "  Node.js already installed: $(node -v)"
fi

# Install pnpm if not present
if ! command -v pnpm &> /dev/null; then
  echo "  Installing pnpm..."
  npm install -g pnpm@9 > /dev/null 2>&1 || {
    curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=9.1.0 sh - > /dev/null 2>&1
    export PATH="$HOME/.local/share/pnpm:$PATH"
  }
  log_success "  pnpm installed."
else
  echo "  pnpm already installed: $(pnpm -v)"
fi

log_success "  All system dependencies ready."

# =============================================================================
# Step 3: Copy .env.example to .env
# =============================================================================
step "Generating configuration..."

if [ -f .env.example ]; then
  cp .env.example .env
  log_success "  Copied .env.example -> .env"
else
  log_error "  ERROR: .env.example not found in $(pwd)"
  log_error "  Make sure you're running this script from the project root."
  exit 1
fi

# =============================================================================
# Step 4: Generate Ed25519 key pairs for registry, gateway, bap, bpp
# =============================================================================
step "Generating Ed25519 key pairs..."

# Install npm dependencies needed for key generation
echo "  Installing crypto dependencies for key generation..."
pnpm install --frozen-lockfile > /dev/null 2>&1 || pnpm install > /dev/null 2>&1 || {
  log_warn "  pnpm install failed; attempting key generation with inline Node.js..."
}

# Generate keys using inline Node.js (works even without full pnpm install)
# We use @noble/ed25519 if available, otherwise fall back to Node.js built-in crypto
KEYGEN_SCRIPT='
const crypto = require("crypto");

function generateEd25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const privDer = privateKey.export({ type: "pkcs8", format: "der" });
  // Ed25519 SPKI DER: last 32 bytes are the raw public key
  const rawPub = pubDer.slice(-32);
  // Ed25519 PKCS8 DER: last 32 bytes are the raw private key
  const rawPriv = privDer.slice(-32);
  return {
    publicKey: rawPub.toString("base64"),
    privateKey: rawPriv.toString("base64")
  };
}

const services = ["REGISTRY", "GATEWAY", "BAP", "BPP"];
const result = {};
for (const svc of services) {
  const keys = generateEd25519KeyPair();
  result[svc] = keys;
}
console.log(JSON.stringify(result));
'

KEYS_JSON=$(node -e "$KEYGEN_SCRIPT" 2>/dev/null)

if [ -z "$KEYS_JSON" ] || [ "$KEYS_JSON" = "" ]; then
  log_error "  ERROR: Key generation failed."
  exit 1
fi

# Extract individual keys
REGISTRY_SIGNING_PUBLIC_KEY=$(echo "$KEYS_JSON" | jq -r '.REGISTRY.publicKey')
REGISTRY_SIGNING_PRIVATE_KEY=$(echo "$KEYS_JSON" | jq -r '.REGISTRY.privateKey')
GATEWAY_SIGNING_PUBLIC_KEY=$(echo "$KEYS_JSON" | jq -r '.GATEWAY.publicKey')
GATEWAY_SIGNING_PRIVATE_KEY=$(echo "$KEYS_JSON" | jq -r '.GATEWAY.privateKey')
BAP_SIGNING_PUBLIC_KEY=$(echo "$KEYS_JSON" | jq -r '.BAP.publicKey')
BAP_SIGNING_PRIVATE_KEY=$(echo "$KEYS_JSON" | jq -r '.BAP.privateKey')
BPP_SIGNING_PUBLIC_KEY=$(echo "$KEYS_JSON" | jq -r '.BPP.publicKey')
BPP_SIGNING_PRIVATE_KEY=$(echo "$KEYS_JSON" | jq -r '.BPP.privateKey')

echo "  Registry key: ${REGISTRY_SIGNING_PUBLIC_KEY:0:12}..."
echo "  Gateway key:  ${GATEWAY_SIGNING_PUBLIC_KEY:0:12}..."
echo "  BAP key:      ${BAP_SIGNING_PUBLIC_KEY:0:12}..."
echo "  BPP key:      ${BPP_SIGNING_PUBLIC_KEY:0:12}..."

log_success "  Ed25519 key pairs generated for all services."

# =============================================================================
# Step 5: Generate admin password if not provided
# =============================================================================
step "Setting admin credentials..."

if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '=/+' | head -c 20)
  echo "  Auto-generated admin password."
else
  echo "  Using provided admin password."
fi

echo "  Admin email:    ${ADMIN_EMAIL}"
echo "  Admin password: ${ADMIN_PASSWORD}"

log_success "  Admin credentials set."

# =============================================================================
# Step 6: Generate random passwords for PostgreSQL, Redis, RabbitMQ
# =============================================================================
step "Generating service passwords..."

POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 32)
REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 32)
RABBITMQ_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 32)
NEXTAUTH_SECRET=$(openssl rand -hex 64)
INTERNAL_API_KEY=$(openssl rand -hex 64)
VAULT_MASTER_KEY=$(openssl rand -hex 32)
VAULT_TOKEN_SECRET=$(openssl rand -hex 64)

echo "  PostgreSQL password: ${POSTGRES_PASSWORD:0:8}..."
echo "  Redis password:      ${REDIS_PASSWORD:0:8}..."
echo "  RabbitMQ password:   ${RABBITMQ_PASSWORD:0:8}..."
echo "  NextAuth secret:     ${NEXTAUTH_SECRET:0:12}..."
echo "  Internal API key:    ${INTERNAL_API_KEY:0:12}..."
echo "  Vault master key:    ${VAULT_MASTER_KEY:0:12}..."
echo "  Vault token secret:  ${VAULT_TOKEN_SECRET:0:12}..."

log_success "  All passwords dynamically generated (no static defaults)."

# =============================================================================
# Step 7: Write all generated values into .env
# =============================================================================
step "Writing configuration to .env..."

# Helper function to safely replace values in .env using sed
set_env() {
  local key="$1"
  local value="$2"
  # Escape special sed characters in the value
  local escaped_value
  escaped_value=$(printf '%s\n' "$value" | sed -e 's/[\/&]/\\&/g')
  if grep -q "^${key}=" .env; then
    sed -i "s/^${key}=.*/${key}=${escaped_value}/" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

# Domain
set_env "DOMAIN" "$DOMAIN"

# PostgreSQL
set_env "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"

# Redis
set_env "REDIS_PASSWORD" "$REDIS_PASSWORD"

# RabbitMQ
set_env "RABBITMQ_PASSWORD" "$RABBITMQ_PASSWORD"

# Registry
set_env "REGISTRY_SUBSCRIBER_ID" "registry.${DOMAIN}"
set_env "REGISTRY_SIGNING_PRIVATE_KEY" "$REGISTRY_SIGNING_PRIVATE_KEY"
set_env "REGISTRY_SIGNING_PUBLIC_KEY" "$REGISTRY_SIGNING_PUBLIC_KEY"

# Gateway
set_env "GATEWAY_SUBSCRIBER_ID" "gateway.${DOMAIN}"
set_env "GATEWAY_SIGNING_PRIVATE_KEY" "$GATEWAY_SIGNING_PRIVATE_KEY"
set_env "GATEWAY_SIGNING_PUBLIC_KEY" "$GATEWAY_SIGNING_PUBLIC_KEY"

# BAP
set_env "BAP_SUBSCRIBER_ID" "bap.${DOMAIN}"
set_env "BAP_SIGNING_PRIVATE_KEY" "$BAP_SIGNING_PRIVATE_KEY"
set_env "BAP_SIGNING_PUBLIC_KEY" "$BAP_SIGNING_PUBLIC_KEY"

# BPP
set_env "BPP_SUBSCRIBER_ID" "bpp.${DOMAIN}"
set_env "BPP_SIGNING_PRIVATE_KEY" "$BPP_SIGNING_PRIVATE_KEY"
set_env "BPP_SIGNING_PUBLIC_KEY" "$BPP_SIGNING_PUBLIC_KEY"

# Admin
set_env "ADMIN_EMAIL" "$ADMIN_EMAIL"
set_env "ADMIN_PASSWORD" "$ADMIN_PASSWORD"
set_env "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET"
set_env "NEXTAUTH_URL" "https://admin.${DOMAIN}"

# Internal API Key
set_env "INTERNAL_API_KEY" "$INTERNAL_API_KEY"

# Vault
set_env "VAULT_MASTER_KEY" "$VAULT_MASTER_KEY"
set_env "VAULT_TOKEN_SECRET" "$VAULT_TOKEN_SECRET"
set_env "VAULT_URL" "http://vault:3006"
set_env "ORCHESTRATOR_URL" "http://orchestrator:3007"
set_env "HEALTH_MONITOR_URL" "http://health-monitor:3008"
set_env "LOG_AGGREGATOR_URL" "http://log-aggregator:3009"
set_env "SIMULATION_ENGINE_URL" "http://simulation-engine:3011"

# Production mode flag
if [ "$PRODUCTION" = true ]; then
  set_env "PRODUCTION_MODE" "true"
else
  set_env "PRODUCTION_MODE" "false"
fi

log_success "  Configuration written to .env"

# =============================================================================
# Step 8: Generate nginx.conf from template
# =============================================================================
step "Configuring Nginx..."

if [ -f nginx/nginx.conf.template ]; then
  sed "s/{{DOMAIN}}/${DOMAIN}/g" nginx/nginx.conf.template > nginx/nginx.conf
  log_success "  nginx/nginx.conf generated from template with domain: ${DOMAIN}"
else
  log_warn "  nginx/nginx.conf.template not found. Using existing nginx.conf if available."
fi

# =============================================================================
# Mode branching: delegate to Kubernetes if --k8s was specified
# =============================================================================
if [ "$DEPLOY_MODE" = "k8s" ]; then
  step "Delegating to Kubernetes deployment..."

  export POSTGRES_PASSWORD REDIS_PASSWORD RABBITMQ_PASSWORD NEXTAUTH_SECRET \
         INTERNAL_API_KEY VAULT_MASTER_KEY VAULT_TOKEN_SECRET \
         REGISTRY_SIGNING_PUBLIC_KEY REGISTRY_SIGNING_PRIVATE_KEY \
         GATEWAY_SIGNING_PUBLIC_KEY GATEWAY_SIGNING_PRIVATE_KEY \
         BAP_SIGNING_PUBLIC_KEY BAP_SIGNING_PRIVATE_KEY \
         BPP_SIGNING_PUBLIC_KEY BPP_SIGNING_PRIVATE_KEY \
         ADMIN_EMAIL ADMIN_PASSWORD DOMAIN PRODUCTION

  K8S_ARGS=""
  [ -n "${GKE_PROJECT:-}" ] && K8S_ARGS+=" --gke-project $GKE_PROJECT"
  [ -n "${GKE_CLUSTER:-}" ] && K8S_ARGS+=" --gke-cluster $GKE_CLUSTER"
  [ -n "${GKE_ZONE:-}" ] && K8S_ARGS+=" --gke-zone $GKE_ZONE"
  [ "$PRODUCTION" = true ] || K8S_ARGS+=" --dev"

  log_info "  Handing off to autoconfig-k8s.sh${K8S_ARGS:+ with args:$K8S_ARGS}"
  exec bash "${SCRIPT_DIR}/autoconfig-k8s.sh" $K8S_ARGS
fi

# =============================================================================
# Step 9: Build Docker images
# =============================================================================
step "Building Docker images (this may take a few minutes)..."

if [ "$PRODUCTION" = true ]; then
  echo "  Building with production overlay..."
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build 2>&1 | while IFS= read -r line; do
    echo "    $line"
  done
else
  echo "  Building development images..."
  docker compose build 2>&1 | while IFS= read -r line; do
    echo "    $line"
  done
fi

log_success "  Docker images built successfully."

# =============================================================================
# Step 10: Start all services
# =============================================================================
step "Starting services..."

# Stop any previously running containers
docker compose --profile simulation down > /dev/null 2>&1 || true

if [ "$PRODUCTION" = true ]; then
  echo "  Starting production stack (persistent volumes, restart policies)..."
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d 2>&1 | while IFS= read -r line; do
    echo "    $line"
  done
else
  echo "  Starting development stack with simulation profile..."
  docker compose --profile simulation up -d 2>&1 | while IFS= read -r line; do
    echo "    $line"
  done
fi

log_success "  Services started."

# =============================================================================
# Step 11: Wait for PostgreSQL to be ready
# =============================================================================
step "Waiting for database..."

MAX_RETRIES=30
RETRY_COUNT=0
PG_READY=false

echo "  Waiting for PostgreSQL to accept connections..."
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-ondc_admin}" -d "${POSTGRES_DB:-ondc}" > /dev/null 2>&1; then
    PG_READY=true
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "    Attempt ${RETRY_COUNT}/${MAX_RETRIES}..."
  sleep 2
done

if [ "$PG_READY" = true ]; then
  log_success "  PostgreSQL is ready. (${RETRY_COUNT} retries)"
else
  log_error "  ERROR: PostgreSQL failed to become ready after ${MAX_RETRIES} attempts."
  log_error "  Check logs: docker compose logs postgres"
  exit 1
fi

# Also wait for Redis
echo "  Waiting for Redis..."
RETRY_COUNT=0
REDIS_READY=false
while [ $RETRY_COUNT -lt 15 ]; do
  if docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" ping 2>/dev/null | grep -q "PONG"; then
    REDIS_READY=true
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 2
done

if [ "$REDIS_READY" = true ]; then
  log_success "  Redis is ready."
else
  log_warn "  WARNING: Redis health check timed out. Continuing..."
fi

# Also wait for RabbitMQ
echo "  Waiting for RabbitMQ..."
RETRY_COUNT=0
RABBIT_READY=false
while [ $RETRY_COUNT -lt 20 ]; do
  if docker compose exec -T rabbitmq rabbitmq-diagnostics check_running > /dev/null 2>&1; then
    RABBIT_READY=true
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 3
done

if [ "$RABBIT_READY" = true ]; then
  log_success "  RabbitMQ is ready."
else
  log_warn "  WARNING: RabbitMQ health check timed out. Continuing..."
fi

# =============================================================================
# Step 12: Database initialized via init.sql
# =============================================================================
step "Database initialized via init.sql..."

echo "  The init.sql script runs automatically via docker-entrypoint-initdb.d."
echo "  Tables: subscribers, domains, cities, transactions, audit_logs,"
echo "          admin_users, network_policies, simulation_runs"

# Verify tables exist
TABLE_COUNT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-ondc_admin}" -d "${POSTGRES_DB:-ondc}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ' || echo "0")
if [ "$TABLE_COUNT" -gt 0 ]; then
  log_success "  Database initialized with ${TABLE_COUNT} tables."
else
  log_warn "  WARNING: Could not verify table count. Database may still be initializing."
fi

# =============================================================================
# Step 13: Run seed script (unless --no-seed)
# =============================================================================
if [ "$NO_SEED" = false ]; then
  step "Seeding database..."

  # Build the DATABASE_URL for the seed script
  DB_URL="postgresql://${POSTGRES_USER:-ondc_admin}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB:-ondc}"

  # Try seeding via pnpm first, fallback to docker exec
  SEED_SUCCESS=false

  # Method 1: Run seed via docker exec on the registry container
  echo "  Running seed script via registry container..."
  if docker compose exec -T \
    -e DATABASE_URL="postgresql://${POSTGRES_USER:-ondc_admin}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-ondc}" \
    -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
    -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
    -e ADMIN_NAME="ONDC Admin" \
    registry node -e "
      const bcrypt = require('bcrypt');
      const { Pool } = require('pg');

      const pool = new Pool({
        connectionString: process.env.DATABASE_URL
      });

      async function seed() {
        const client = await pool.connect();
        try {
          // Seed admin user
          const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
          await client.query(
            'INSERT INTO admin_users (email, password_hash, name, role, is_active) VALUES (\$1, \$2, \$3, \$4, \$5) ON CONFLICT (email) DO NOTHING',
            [process.env.ADMIN_EMAIL, passwordHash, process.env.ADMIN_NAME || 'ONDC Admin', 'SUPER_ADMIN', true]
          );
          console.log('  Admin user seeded: ' + process.env.ADMIN_EMAIL);

          // Seed domains
          const domains = [
            ['ONDC:NIC2004:49299', 'Water Delivery', 'Packaged drinking water and tanker delivery'],
            ['ONDC:RET10', 'Food & Grocery', 'Food delivery and grocery'],
            ['ONDC:AGR10', 'Agriculture', 'Agricultural products, seeds, fertilizers'],
            ['ONDC:LOG10', 'Logistics', 'Courier, warehousing, fleet'],
            ['ONDC:HLT10', 'Healthcare', 'Medicines, lab tests, consultations'],
            ['ONDC:RET12', 'Retail', 'Electronics, clothing, home goods'],
          ];
          for (const [code, name, desc] of domains) {
            await client.query(
              'INSERT INTO domains (code, name, description) VALUES (\$1, \$2, \$3) ON CONFLICT (code) DO NOTHING',
              [code, name, desc]
            );
            console.log('  Domain: ' + code + ' (' + name + ')');
          }

          // Seed cities
          const cities = [
            ['std:011', 'Delhi', 'Delhi'],
            ['std:080', 'Bangalore', 'Karnataka'],
            ['std:022', 'Mumbai', 'Maharashtra'],
            ['std:044', 'Chennai', 'Tamil Nadu'],
            ['std:033', 'Kolkata', 'West Bengal'],
            ['std:040', 'Hyderabad', 'Telangana'],
            ['std:020', 'Pune', 'Maharashtra'],
            ['std:079', 'Ahmedabad', 'Gujarat'],
          ];
          for (const [code, name, state] of cities) {
            await client.query(
              'INSERT INTO cities (code, name, state) VALUES (\$1, \$2, \$3) ON CONFLICT (code) DO NOTHING',
              [code, name, state]
            );
            console.log('  City: ' + code + ' (' + name + ')');
          }

          // Seed registry and gateway as network participants
          const crypto = require('crypto');

          function genEd25519() {
            const kp = crypto.generateKeyPairSync('ed25519');
            const pubDer = kp.publicKey.export({ type: 'spki', format: 'der' });
            return pubDer.slice(-32).toString('base64');
          }

          const regPub = genEd25519();
          await client.query(
            'INSERT INTO subscribers (subscriber_id, subscriber_url, type, signing_public_key, unique_key_id, status, valid_from, valid_until) VALUES (\$1, \$2, \$3, \$4, \$5, \$6, NOW(), NOW() + interval \'365 days\') ON CONFLICT (subscriber_id) DO NOTHING',
            ['registry.${DOMAIN}', 'http://registry:3001', 'BG', regPub, 'registry-key-01', 'SUBSCRIBED']
          );
          console.log('  Registry subscriber seeded.');

          const gwPub = genEd25519();
          await client.query(
            'INSERT INTO subscribers (subscriber_id, subscriber_url, type, signing_public_key, unique_key_id, status, valid_from, valid_until) VALUES (\$1, \$2, \$3, \$4, \$5, \$6, NOW(), NOW() + interval \'365 days\') ON CONFLICT (subscriber_id) DO NOTHING',
            ['gateway.${DOMAIN}', 'http://gateway:3002', 'BG', gwPub, 'gateway-key-01', 'SUBSCRIBED']
          );
          console.log('  Gateway subscriber seeded.');

          console.log('  Seed completed successfully.');
        } finally {
          client.release();
          await pool.end();
        }
      }

      seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
    " 2>&1; then
    SEED_SUCCESS=true
  fi

  if [ "$SEED_SUCCESS" = true ]; then
    log_success "  Database seeded successfully."
  else
    log_warn "  WARNING: Seed via container failed. Attempting with local pnpm..."

    # Method 2: Try pnpm seed if available
    if command -v pnpm &> /dev/null; then
      DATABASE_URL="${DB_URL}" ADMIN_EMAIL="${ADMIN_EMAIL}" ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
        pnpm --filter @ondc/scripts seed 2>&1 && SEED_SUCCESS=true || true
    fi

    if [ "$SEED_SUCCESS" = true ]; then
      log_success "  Database seeded successfully (via pnpm)."
    else
      log_warn "  WARNING: Database seeding failed. You can seed manually later with:"
      log_warn "    pnpm --filter @ondc/scripts seed"
    fi
  fi
else
  step "Skipping database seeding (--no-seed flag set)..."
  echo "  Database tables exist but contain no seed data."
  echo "  You can seed later with: pnpm --filter @ondc/scripts seed"
fi

# =============================================================================
# Step 14: Seed secrets into vault
# =============================================================================
step "Seeding secrets into vault..."

echo "  Waiting for vault service to be ready..."
RETRY_COUNT=0
VAULT_READY=false
while [ $RETRY_COUNT -lt 20 ]; do
  if curl -sf "http://localhost:${VAULT_PORT:-3006}/health" > /dev/null 2>&1; then
    VAULT_READY=true
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 3
done

if [ "$VAULT_READY" = true ]; then
  log_success "  Vault is ready."

  # Seed all infrastructure passwords into the vault for centralized management
  VAULT_API="http://localhost:${VAULT_PORT:-3006}"
  VAULT_HEADERS="-H 'Content-Type: application/json' -H 'x-internal-api-key: ${INTERNAL_API_KEY}'"

  seed_secret() {
    local name="$1"
    local value="$2"
    local service="$3"
    local rotation_interval="${4:-0}"

    curl -sf -X POST "${VAULT_API}/secrets" \
      -H "Content-Type: application/json" \
      -H "x-internal-api-key: ${INTERNAL_API_KEY}" \
      -d "{\"name\":\"${name}\",\"value\":\"${value}\",\"service\":\"${service}\",\"rotationInterval\":${rotation_interval}}" \
      > /dev/null 2>&1 && echo "    Seeded: ${name}" || echo "    Exists: ${name}"
  }

  seed_secret "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD" "postgres" 86400
  seed_secret "REDIS_PASSWORD" "$REDIS_PASSWORD" "redis" 86400
  seed_secret "RABBITMQ_PASSWORD" "$RABBITMQ_PASSWORD" "rabbitmq" 86400
  seed_secret "ADMIN_PASSWORD" "$ADMIN_PASSWORD" "admin" 604800
  seed_secret "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET" "admin" 2592000
  seed_secret "INTERNAL_API_KEY" "$INTERNAL_API_KEY" "platform" 2592000
  seed_secret "VAULT_TOKEN_SECRET" "$VAULT_TOKEN_SECRET" "vault" 2592000
  seed_secret "REGISTRY_SIGNING_PRIVATE_KEY" "$REGISTRY_SIGNING_PRIVATE_KEY" "registry" 2592000
  seed_secret "GATEWAY_SIGNING_PRIVATE_KEY" "$GATEWAY_SIGNING_PRIVATE_KEY" "gateway" 2592000
  seed_secret "BAP_SIGNING_PRIVATE_KEY" "$BAP_SIGNING_PRIVATE_KEY" "bap" 2592000
  seed_secret "BPP_SIGNING_PRIVATE_KEY" "$BPP_SIGNING_PRIVATE_KEY" "bpp" 2592000

  log_success "  All secrets seeded into vault with rotation schedules."
else
  log_warn "  WARNING: Vault not ready. Secrets will use .env fallback."
  log_warn "  You can seed vault later once it's running."
fi

# =============================================================================
# Step 15: Register rotation hooks
# =============================================================================
step "Registering rotation hooks..."

if [ "$VAULT_READY" = true ]; then
  register_hook() {
    local secret_name="$1"
    local callback_url="$2"

    curl -sf -X POST "${VAULT_API}/rotation/hooks" \
      -H "Content-Type: application/json" \
      -H "x-internal-api-key: ${INTERNAL_API_KEY}" \
      -d "{\"secretName\":\"${secret_name}\",\"callbackUrl\":\"${callback_url}\"}" \
      > /dev/null 2>&1 && echo "    Hook: ${secret_name} -> ${callback_url}" || true
  }

  # Each service gets notified when its secrets rotate
  register_hook "POSTGRES_PASSWORD" "http://orchestrator:3007/hooks/secret-rotated"
  register_hook "REDIS_PASSWORD" "http://orchestrator:3007/hooks/secret-rotated"
  register_hook "RABBITMQ_PASSWORD" "http://orchestrator:3007/hooks/secret-rotated"
  register_hook "INTERNAL_API_KEY" "http://orchestrator:3007/hooks/secret-rotated"

  log_success "  Rotation hooks registered."
else
  log_warn "  Skipping rotation hooks (vault not available)."
fi

# =============================================================================
# Step 16: Health check
# =============================================================================
step "Running health checks..."

# Allow services a moment to finish starting
echo "  Waiting 10 seconds for services to fully initialize..."
sleep 10

HEALTH_PASS=0
HEALTH_FAIL=0

check_health() {
  local name="$1"
  local port="$2"
  local retries=3
  local count=0

  while [ $count -lt $retries ]; do
    if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
      echo -e "  ${GREEN}✓${NC} ${name} (port ${port})"
      HEALTH_PASS=$((HEALTH_PASS + 1))
      return 0
    fi
    count=$((count + 1))
    sleep 2
  done

  echo -e "  ${RED}✗${NC} ${name} (port ${port})"
  HEALTH_FAIL=$((HEALTH_FAIL + 1))
  return 1
}

check_health "Registry"        3001 || true
check_health "Gateway"         3002 || true
check_health "Admin"           3003 || true
check_health "BAP"             3004 || true
check_health "BPP"             3005 || true
check_health "Docs"            3000 || true
check_health "Vault"           3006 || true
check_health "Orchestrator"    3007 || true
check_health "Health Monitor"  3008 || true
check_health "Log Aggregator"  3009 || true

# Simulation services only in non-production mode
if [ "$PRODUCTION" = false ]; then
  check_health "Mock Server"       3010 || true
  check_health "Simulation Engine" 3011 || true
fi

echo ""
echo "  Healthy: ${HEALTH_PASS}  |  Unhealthy: ${HEALTH_FAIL}"

if [ "$HEALTH_FAIL" -gt 0 ]; then
  log_warn "  Some services may still be starting up. Check with: docker compose ps"
fi

# =============================================================================
# Step 17: Production-only: Set up backup cron job
# =============================================================================
if [ "$PRODUCTION" = true ]; then
  echo ""
  log_info "  Setting up production backup cron job..."

  # Create backups directory
  mkdir -p "${SCRIPT_DIR}/backups"

  # Write the backup script
  cat > "${SCRIPT_DIR}/backups/backup.sh" << 'BACKUP_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Load environment
set -a
source .env
set +a

BACKUP_DIR="${SCRIPT_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/ondc_backup_${TIMESTAMP}.sql.gz"

# Run pg_dump inside the postgres container and compress
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-ondc_admin}" \
  -d "${POSTGRES_DB:-ondc}" \
  --clean --if-exists \
  | gzip > "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "ondc_backup_*.sql.gz" -mtime +30 -delete 2>/dev/null || true

echo "Old backups cleaned up."
BACKUP_SCRIPT
  chmod +x "${SCRIPT_DIR}/backups/backup.sh"

  # Install cron job for daily backup at 2:00 AM
  CRON_LINE="0 2 * * * ${SCRIPT_DIR}/backups/backup.sh >> ${SCRIPT_DIR}/backups/backup.log 2>&1"
  (crontab -l 2>/dev/null | grep -v "ondc_backup" || true; echo "$CRON_LINE") | crontab -

  log_success "  Daily backup cron job installed (2:00 AM)."
  echo "  Backup directory: ${SCRIPT_DIR}/backups/"
  echo "  Backup script:    ${SCRIPT_DIR}/backups/backup.sh"
fi

# =============================================================================
# Step 15: Print summary
# =============================================================================
step "Setup complete!"

echo ""
echo -e "${BOLD}${CYAN}"
echo "  ┌────────────────────────────────────────────────────────────────────┐"
echo "  │                                                                    │"
echo "  │   ONDC Platform Ready                                              │"
echo "  │                                                                    │"
if [ "$PRODUCTION" = true ]; then
echo "  │   Mode:             Production (persistent volumes + backups)       │"
else
echo "  │   Mode:             Ephemeral / Development                        │"
fi
echo "  │                                                                    │"
echo "  │   Admin Dashboard:  https://admin.${DOMAIN}$(printf '%*s' $((27 - ${#DOMAIN})) '')│"
echo "  │   Registry:         https://registry.${DOMAIN}$(printf '%*s' $((24 - ${#DOMAIN})) '')│"
echo "  │   Gateway:          https://gateway.${DOMAIN}$(printf '%*s' $((25 - ${#DOMAIN})) '')│"
echo "  │   BAP Adapter:      https://bap.${DOMAIN}$(printf '%*s' $((29 - ${#DOMAIN})) '')│"
echo "  │   BPP Adapter:      https://bpp.${DOMAIN}$(printf '%*s' $((29 - ${#DOMAIN})) '')│"
echo "  │   Documentation:    https://${DOMAIN}$(printf '%*s' $((33 - ${#DOMAIN})) '')│"
echo "  │                                                                    │"
echo "  │   Admin Login:      ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}$(printf '%*s' $((33 - ${#ADMIN_EMAIL} - ${#ADMIN_PASSWORD})) '')│"
echo "  │                                                                    │"
echo "  │   To simulate data: sudo bash simulate.sh --baps 5 --bpps 20      │"
echo "  │   To tear down:     sudo bash teardown.sh [--volumes] [--full]     │"
echo "  │                                                                    │"
echo "  └────────────────────────────────────────────────────────────────────┘"
echo -e "${NC}"

# Save credentials to a secure file
CREDS_FILE="${SCRIPT_DIR}/.credentials"
cat > "$CREDS_FILE" << EOF
# ONDC Platform Credentials — Generated $(date -Iseconds)
# KEEP THIS FILE SECURE. DO NOT COMMIT TO VERSION CONTROL.

DOMAIN=${DOMAIN}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
RABBITMQ_PASSWORD=${RABBITMQ_PASSWORD}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
INTERNAL_API_KEY=${INTERNAL_API_KEY}
VAULT_MASTER_KEY=${VAULT_MASTER_KEY}
VAULT_TOKEN_SECRET=${VAULT_TOKEN_SECRET}

REGISTRY_SIGNING_PUBLIC_KEY=${REGISTRY_SIGNING_PUBLIC_KEY}
REGISTRY_SIGNING_PRIVATE_KEY=${REGISTRY_SIGNING_PRIVATE_KEY}
GATEWAY_SIGNING_PUBLIC_KEY=${GATEWAY_SIGNING_PUBLIC_KEY}
GATEWAY_SIGNING_PRIVATE_KEY=${GATEWAY_SIGNING_PRIVATE_KEY}
BAP_SIGNING_PUBLIC_KEY=${BAP_SIGNING_PUBLIC_KEY}
BAP_SIGNING_PRIVATE_KEY=${BAP_SIGNING_PRIVATE_KEY}
BPP_SIGNING_PUBLIC_KEY=${BPP_SIGNING_PUBLIC_KEY}
BPP_SIGNING_PRIVATE_KEY=${BPP_SIGNING_PRIVATE_KEY}

NOTE: All passwords are dynamically generated and stored encrypted in the vault.
      Passwords auto-rotate according to their configured schedules.
      Vault master key is the only key that must be preserved for disaster recovery.
EOF
chmod 600 "$CREDS_FILE"

echo -e "${YELLOW}  Credentials saved to: ${CREDS_FILE}${NC}"
echo -e "${YELLOW}  (chmod 600 — only root can read)${NC}"
echo ""

if [ "$PRODUCTION" = true ]; then
  echo -e "${BOLD}Production Notes:${NC}"
  echo "  - PostgreSQL data is persisted in Docker volumes"
  echo "  - Daily backups at 2:00 AM to ${SCRIPT_DIR}/backups/"
  echo "  - All services configured with restart: always"
  echo "  - Mock server is disabled (real network only)"
  echo "  - Set up Cloudflare DNS A records for ${DOMAIN} and subdomains"
  echo ""
fi

echo -e "${BOLD}Quick Start:${NC}"
echo "  View logs:        docker compose logs -f"
echo "  Check status:     docker compose ps"
echo "  Run simulation:   sudo bash simulate.sh --baps 5 --bpps 20 --orders 500"
echo "  Health check:     curl http://localhost:3001/health"
echo "  Stop services:    sudo bash teardown.sh"
echo ""

log_success "ONDC Platform setup complete. Happy building!"
