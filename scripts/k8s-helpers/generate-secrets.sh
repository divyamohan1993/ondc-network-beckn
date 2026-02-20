#!/usr/bin/env bash
# =============================================================================
# ONDC Network Beckn - Kubernetes Secret Generator
# =============================================================================
# Reads environment variables (set by autoconfig.sh or .env) and creates
# Kubernetes secrets using dry-run + apply for idempotent operations.
#
# Usage:
#   source .env && bash scripts/k8s-helpers/generate-secrets.sh
#   POSTGRES_PASSWORD=xxx REDIS_PASSWORD=yyy ... bash scripts/k8s-helpers/generate-secrets.sh
#
# Creates:
#   - infra-secrets   in ondc-infra namespace
#   - app-secrets     in ondc namespace
#   - admin-secrets   in ondc namespace
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

log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "${BOLD}${CYAN}==> $1${NC}"; }

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
if ! command -v kubectl &>/dev/null; then
  log_error "kubectl is not installed or not in PATH."
  exit 1
fi

if ! kubectl cluster-info &>/dev/null; then
  log_error "Cannot reach Kubernetes cluster. Check your kubeconfig."
  exit 1
fi

# ---------------------------------------------------------------------------
# Validate that all required environment variables are set
# ---------------------------------------------------------------------------
MISSING=0

require_var() {
  local var_name="$1"
  local group="$2"
  if [[ -z "${!var_name:-}" ]]; then
    log_error "Missing required environment variable: ${var_name} (needed for ${group})"
    MISSING=1
  fi
}

log_step "Validating environment variables..."

# infra-secrets
require_var POSTGRES_PASSWORD   "infra-secrets"
require_var REDIS_PASSWORD      "infra-secrets"
require_var RABBITMQ_PASSWORD   "infra-secrets"

# app-secrets
require_var INTERNAL_API_KEY             "app-secrets"
require_var VAULT_MASTER_KEY             "app-secrets"
require_var VAULT_TOKEN_SECRET           "app-secrets"
require_var REGISTRY_SIGNING_PRIVATE_KEY "app-secrets"
require_var GATEWAY_SIGNING_PRIVATE_KEY  "app-secrets"
require_var BAP_SIGNING_PRIVATE_KEY      "app-secrets"
require_var BPP_SIGNING_PRIVATE_KEY      "app-secrets"

# admin-secrets
require_var ADMIN_PASSWORD  "admin-secrets"
require_var NEXTAUTH_SECRET "admin-secrets"

if [[ "$MISSING" -ne 0 ]]; then
  echo ""
  log_error "One or more required environment variables are missing."
  log_error "Ensure autoconfig.sh has been sourced or variables are exported."
  exit 1
fi

log_success "All required environment variables are present."
echo ""

# ---------------------------------------------------------------------------
# Ensure namespaces exist
# ---------------------------------------------------------------------------
log_step "Ensuring namespaces exist..."

for ns in ondc-infra ondc ondc-simulation; do
  if kubectl get namespace "$ns" &>/dev/null; then
    log_info "Namespace '${ns}' already exists."
  else
    kubectl create namespace "$ns"
    log_success "Created namespace '${ns}'."
  fi
done

echo ""

# ---------------------------------------------------------------------------
# Helper: create or update a secret via dry-run + apply
# ---------------------------------------------------------------------------
apply_secret() {
  local secret_name="$1"
  local namespace="$2"
  shift 2
  # Remaining args are --from-literal=KEY=VALUE pairs

  log_info "Applying secret '${secret_name}' in namespace '${namespace}'..."

  if kubectl create secret generic "$secret_name" \
    --namespace="$namespace" \
    "$@" \
    --dry-run=client -o yaml | kubectl apply -f -; then
    log_success "Secret '${secret_name}' applied in namespace '${namespace}'."
  else
    log_error "Failed to apply secret '${secret_name}' in namespace '${namespace}'."
    return 1
  fi
}

# ---------------------------------------------------------------------------
# 1. infra-secrets (ondc-infra namespace)
# ---------------------------------------------------------------------------
log_step "Creating infra-secrets in ondc-infra namespace..."

apply_secret "infra-secrets" "ondc-infra" \
  --from-literal="POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
  --from-literal="REDIS_PASSWORD=${REDIS_PASSWORD}" \
  --from-literal="RABBITMQ_PASSWORD=${RABBITMQ_PASSWORD}"

echo ""

# ---------------------------------------------------------------------------
# 2. app-secrets (ondc namespace)
# ---------------------------------------------------------------------------
log_step "Creating app-secrets in ondc namespace..."

apply_secret "app-secrets" "ondc" \
  --from-literal="INTERNAL_API_KEY=${INTERNAL_API_KEY}" \
  --from-literal="VAULT_MASTER_KEY=${VAULT_MASTER_KEY}" \
  --from-literal="VAULT_TOKEN_SECRET=${VAULT_TOKEN_SECRET}" \
  --from-literal="REGISTRY_SIGNING_PRIVATE_KEY=${REGISTRY_SIGNING_PRIVATE_KEY}" \
  --from-literal="GATEWAY_SIGNING_PRIVATE_KEY=${GATEWAY_SIGNING_PRIVATE_KEY}" \
  --from-literal="BAP_SIGNING_PRIVATE_KEY=${BAP_SIGNING_PRIVATE_KEY}" \
  --from-literal="BPP_SIGNING_PRIVATE_KEY=${BPP_SIGNING_PRIVATE_KEY}"

echo ""

# ---------------------------------------------------------------------------
# 3. admin-secrets (ondc namespace)
# ---------------------------------------------------------------------------
log_step "Creating admin-secrets in ondc namespace..."

apply_secret "admin-secrets" "ondc" \
  --from-literal="ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  --from-literal="NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log_step "Secret generation complete!"
echo ""
echo -e "  ${GREEN}infra-secrets${NC}  -> ondc-infra   (POSTGRES_PASSWORD, REDIS_PASSWORD, RABBITMQ_PASSWORD)"
echo -e "  ${GREEN}app-secrets${NC}    -> ondc          (INTERNAL_API_KEY, VAULT_MASTER_KEY, VAULT_TOKEN_SECRET,"
echo -e "                                   REGISTRY_SIGNING_PRIVATE_KEY, GATEWAY_SIGNING_PRIVATE_KEY,"
echo -e "                                   BAP_SIGNING_PRIVATE_KEY, BPP_SIGNING_PRIVATE_KEY)"
echo -e "  ${GREEN}admin-secrets${NC}  -> ondc          (ADMIN_PASSWORD, NEXTAUTH_SECRET)"
echo ""
log_success "All secrets have been created/updated successfully."
