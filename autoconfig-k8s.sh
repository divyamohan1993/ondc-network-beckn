#!/usr/bin/env bash
# =============================================================================
# ONDC Platform — Kubernetes Deployment Automation
# =============================================================================
# Called by autoconfig.sh AFTER all env vars have been generated and written
# to .env. Deploys the full ONDC Beckn network to a Kubernetes cluster.
#
# Supports GKE (auto-provisioning), minikube/kind (--local), or any existing
# cluster with a valid kubeconfig.
#
# Usage:
#   bash autoconfig-k8s.sh [OPTIONS]
#
# Examples:
#   bash autoconfig-k8s.sh --local                              # minikube/kind
#   bash autoconfig-k8s.sh --gke-project my-project --dev       # GKE + dev overlay
#   bash autoconfig-k8s.sh --skip-infra-install                 # tools pre-installed
#
# Environment vars expected (exported by autoconfig.sh):
#   POSTGRES_PASSWORD, REDIS_PASSWORD, RABBITMQ_PASSWORD, INTERNAL_API_KEY,
#   VAULT_MASTER_KEY, VAULT_TOKEN_SECRET, NEXTAUTH_SECRET, ADMIN_PASSWORD,
#   ADMIN_EMAIL, DOMAIN, and all 4 signing key pairs (REGISTRY_SIGNING_*,
#   GATEWAY_SIGNING_*, BAP_SIGNING_*, BPP_SIGNING_*)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output (matches autoconfig.sh)
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
# Resolve script directory (project root)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
GKE_PROJECT=""
GKE_CLUSTER="ondc-cluster"
GKE_ZONE="us-central1-a"
DEV_MODE=false
LOCAL_MODE=false
SKIP_INFRA_INSTALL=false

while [[ $# -gt 0 ]]; do
  case $1 in
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
    --dev)
      DEV_MODE=true
      shift
      ;;
    --local)
      LOCAL_MODE=true
      shift
      ;;
    --skip-infra-install)
      SKIP_INFRA_INSTALL=true
      shift
      ;;
    -h|--help)
      echo "Usage: bash autoconfig-k8s.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --gke-project <project>   GCP project ID (triggers GKE provisioning)"
      echo "  --gke-cluster <name>      GKE cluster name (default: ondc-cluster)"
      echo "  --gke-zone <zone>         GKE zone (default: us-central1-a)"
      echo "  --dev                     Use dev overlay (simulation services, lower resources)"
      echo "  --local                   Local cluster mode (minikube/kind); skip GKE + ingress-controller"
      echo "  --skip-infra-install      Skip kubectl/helm/gcloud installation (assume pre-installed)"
      echo "  -h, --help                Show this help message"
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
# Step counter (matches autoconfig.sh style)
# ---------------------------------------------------------------------------
TOTAL_STEPS=20
CURRENT_STEP=0
step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  echo ""
  echo -e "${BOLD}${BLUE}[${CURRENT_STEP}/${TOTAL_STEPS}] $1${NC}"
  echo -e "${BLUE}$(printf '%.0s─' $(seq 1 60))${NC}"
}

# ---------------------------------------------------------------------------
# Detect GCP environment (metadata server or --gke-project flag)
# ---------------------------------------------------------------------------
IS_GCP=false
if [[ -n "$GKE_PROJECT" ]]; then
  IS_GCP=true
elif curl -sf -m 2 -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/project/project-id" > /dev/null 2>&1; then
  IS_GCP=true
  if [[ -z "$GKE_PROJECT" ]]; then
    GKE_PROJECT=$(curl -sf -m 2 -H "Metadata-Flavor: Google" \
      "http://metadata.google.internal/computeMetadata/v1/project/project-id" 2>/dev/null || echo "")
  fi
fi

# ---------------------------------------------------------------------------
# Cleanup handler: remove temporary files, print diagnostics on failure
# ---------------------------------------------------------------------------
CLEANUP_FILES=()

cleanup() {
  local exit_code=$?
  for f in "${CLEANUP_FILES[@]}"; do
    rm -f "$f" 2>/dev/null || true
  done
  if [[ $exit_code -ne 0 ]]; then
    echo ""
    log_error "Deployment failed at step ${CURRENT_STEP}/${TOTAL_STEPS}."
    log_error "Debug with:"
    log_error "  kubectl get pods -A"
    log_error "  kubectl get events -A --sort-by=.metadata.creationTimestamp"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Validate required environment variables
# ---------------------------------------------------------------------------
REQUIRED_VARS=(
  POSTGRES_PASSWORD REDIS_PASSWORD RABBITMQ_PASSWORD INTERNAL_API_KEY
  VAULT_MASTER_KEY VAULT_TOKEN_SECRET NEXTAUTH_SECRET ADMIN_PASSWORD
  ADMIN_EMAIL DOMAIN
  REGISTRY_SIGNING_PUBLIC_KEY REGISTRY_SIGNING_PRIVATE_KEY
  GATEWAY_SIGNING_PUBLIC_KEY GATEWAY_SIGNING_PRIVATE_KEY
  BAP_SIGNING_PUBLIC_KEY BAP_SIGNING_PRIVATE_KEY
  BPP_SIGNING_PUBLIC_KEY BPP_SIGNING_PRIVATE_KEY
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    log_error "Missing required environment variable: ${var}"
    MISSING=1
  fi
done

if [[ "$MISSING" -ne 0 ]]; then
  log_error "This script is called by autoconfig.sh after .env generation."
  log_error "Ensure all env vars are exported before running."
  exit 1
fi

echo ""
echo -e "${BOLD}${CYAN}ONDC Platform - Kubernetes Deployment${NC}"
echo -e "${CYAN}$(printf '%.0s=' $(seq 1 60))${NC}"
echo "  Domain:        ${DOMAIN}"
echo "  GKE Project:   ${GKE_PROJECT:-N/A (not GKE)}"
echo "  Cluster:       ${GKE_CLUSTER}"
echo "  Dev mode:      ${DEV_MODE}"
echo "  Local mode:    ${LOCAL_MODE}"

# =============================================================================
# Step 1: Install kubectl
# =============================================================================
step "Installing kubectl..."

if [[ "$SKIP_INFRA_INSTALL" == true ]]; then
  echo "  Skipped (--skip-infra-install)"
elif command -v kubectl &>/dev/null; then
  echo "  kubectl already installed: $(kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1)"
else
  echo "  Downloading latest stable kubectl..."
  KUBECTL_VERSION=$(curl -sL https://dl.k8s.io/release/stable.txt)
  curl -fsSLo /usr/local/bin/kubectl \
    "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
  chmod +x /usr/local/bin/kubectl
  log_success "  kubectl ${KUBECTL_VERSION} installed."
fi

# =============================================================================
# Step 2: Install Helm
# =============================================================================
step "Installing Helm..."

if [[ "$SKIP_INFRA_INSTALL" == true ]]; then
  echo "  Skipped (--skip-infra-install)"
elif command -v helm &>/dev/null; then
  echo "  Helm already installed: $(helm version --short 2>/dev/null)"
else
  echo "  Installing Helm via get.helm.sh..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  log_success "  Helm installed: $(helm version --short 2>/dev/null)"
fi

# =============================================================================
# Step 3: Detect GCP environment and provision GKE cluster
# =============================================================================
step "Configuring Kubernetes cluster..."

if [[ "$IS_GCP" == true && "$LOCAL_MODE" == false ]]; then
  echo "  GCP environment detected. Project: ${GKE_PROJECT}"

  # Install gcloud CLI if missing
  if [[ "$SKIP_INFRA_INSTALL" == false ]] && ! command -v gcloud &>/dev/null; then
    echo "  Installing Google Cloud CLI..."
    curl -fsSL https://sdk.cloud.google.com | bash -s -- --disable-prompts > /dev/null 2>&1
    export PATH="$HOME/google-cloud-sdk/bin:$PATH"
    log_success "  gcloud CLI installed."
  fi

  # Authenticate — prefer service account, fall back to application default
  if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
    echo "  Authenticating with service account..."
    gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS" --quiet
  else
    echo "  Using application default credentials..."
    gcloud auth application-default print-access-token > /dev/null 2>&1 || {
      log_warn "  No default credentials found. Attempting metadata-based auth..."
    }
  fi

  gcloud config set project "$GKE_PROJECT" --quiet

  # Create or connect to GKE cluster
  if gcloud container clusters describe "$GKE_CLUSTER" \
    --project "$GKE_PROJECT" --zone "$GKE_ZONE" &>/dev/null; then
    echo "  Cluster '${GKE_CLUSTER}' already exists. Fetching credentials..."
    gcloud container clusters get-credentials "$GKE_CLUSTER" \
      --project "$GKE_PROJECT" --zone "$GKE_ZONE" --quiet
  else
    echo "  Creating GKE cluster '${GKE_CLUSTER}'..."
    gcloud container clusters create "$GKE_CLUSTER" \
      --project "$GKE_PROJECT" --zone "$GKE_ZONE" \
      --num-nodes 3 --machine-type e2-standard-4 \
      --enable-autoscaling --min-nodes 2 --max-nodes 10 \
      --enable-network-policy --release-channel regular \
      --quiet
    gcloud container clusters get-credentials "$GKE_CLUSTER" \
      --project "$GKE_PROJECT" --zone "$GKE_ZONE" --quiet
    log_success "  GKE cluster '${GKE_CLUSTER}' created."
  fi
elif [[ "$LOCAL_MODE" == true ]]; then
  echo "  Local mode: expecting minikube/kind cluster with valid kubeconfig."
  if ! kubectl cluster-info &>/dev/null; then
    log_error "  Cannot reach local Kubernetes cluster. Start minikube/kind first."
    exit 1
  fi
  echo "  Connected to local cluster."
else
  echo "  Using existing kubeconfig context."
  if ! kubectl cluster-info &>/dev/null; then
    log_error "  Cannot reach Kubernetes cluster. Check your kubeconfig."
    exit 1
  fi
fi

kubectl cluster-info 2>/dev/null | head -2 | while IFS= read -r line; do
  echo "  $line"
done
log_success "  Kubernetes cluster is reachable."

# =============================================================================
# Step 4: Install nginx-ingress-controller via Helm
# =============================================================================
step "Installing NGINX Ingress Controller..."

if [[ "$LOCAL_MODE" == true ]]; then
  echo "  Skipped in local mode (minikube/kind provides its own ingress)."
else
  if helm list -n ingress-nginx 2>/dev/null | grep -q ingress-nginx; then
    echo "  ingress-nginx already installed."
  else
    echo "  Adding ingress-nginx Helm repo..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx --force-update > /dev/null 2>&1
    helm repo update > /dev/null 2>&1
    echo "  Installing ingress-nginx chart..."
    helm install ingress-nginx ingress-nginx/ingress-nginx \
      --namespace ingress-nginx --create-namespace \
      --set controller.replicaCount=2 \
      --set controller.service.type=LoadBalancer \
      --wait --timeout 120s
    log_success "  NGINX Ingress Controller installed."
  fi
fi

# =============================================================================
# Step 5: Install cert-manager via Helm
# =============================================================================
step "Installing cert-manager..."

if helm list -n cert-manager 2>/dev/null | grep -q cert-manager; then
  echo "  cert-manager already installed."
else
  echo "  Adding jetstack Helm repo..."
  helm repo add jetstack https://charts.jetstack.io --force-update > /dev/null 2>&1
  helm repo update > /dev/null 2>&1
  echo "  Installing cert-manager chart..."
  helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager --create-namespace \
    --set crds.enabled=true \
    --wait --timeout 120s
  log_success "  cert-manager installed."
fi

# =============================================================================
# Step 6: Create namespaces
# =============================================================================
step "Creating namespaces..."

kubectl apply -f "${SCRIPT_DIR}/k8s/base/namespaces.yaml"
log_success "  Namespaces ondc-infra, ondc, ondc-simulation created."

# =============================================================================
# Step 7: Generate and apply Kubernetes Secrets
# =============================================================================
step "Generating and applying Kubernetes Secrets..."

bash "${SCRIPT_DIR}/scripts/k8s-helpers/generate-secrets.sh"
log_success "  Secrets generated and applied (infra-secrets, app-secrets, admin-secrets)."

# =============================================================================
# Step 8: Apply ConfigMaps
# =============================================================================
step "Applying ConfigMaps..."

kubectl apply -f "${SCRIPT_DIR}/k8s/base/config/"
log_success "  ConfigMaps applied (platform-config, service-urls)."

# =============================================================================
# Step 9: Apply infrastructure StatefulSets (postgres, redis, rabbitmq)
# =============================================================================
step "Deploying infrastructure (postgres, redis, rabbitmq)..."

echo "  Applying PostgreSQL..."
kubectl apply -f "${SCRIPT_DIR}/k8s/base/infra/postgres-configmap.yaml"
kubectl apply -f "${SCRIPT_DIR}/k8s/base/infra/postgres-statefulset.yaml"
kubectl apply -f "${SCRIPT_DIR}/k8s/base/infra/postgres-service.yaml"

echo "  Applying Redis..."
kubectl apply -f "${SCRIPT_DIR}/k8s/base/infra/redis-statefulset.yaml"
kubectl apply -f "${SCRIPT_DIR}/k8s/base/infra/redis-service.yaml"

echo "  Applying RabbitMQ..."
kubectl apply -f "${SCRIPT_DIR}/k8s/base/infra/rabbitmq-statefulset.yaml"
kubectl apply -f "${SCRIPT_DIR}/k8s/base/infra/rabbitmq-service.yaml"

echo "  Waiting for infrastructure pods to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n ondc-infra --timeout=180s 2>&1 || {
  log_warn "  PostgreSQL pod not ready within 180s. Continuing..."
}
kubectl wait --for=condition=ready pod -l app=redis -n ondc-infra --timeout=120s 2>&1 || {
  log_warn "  Redis pod not ready within 120s. Continuing..."
}
kubectl wait --for=condition=ready pod -l app=rabbitmq -n ondc-infra --timeout=120s 2>&1 || {
  log_warn "  RabbitMQ pod not ready within 120s. Continuing..."
}

log_success "  Infrastructure StatefulSets deployed and ready."

# =============================================================================
# Step 10: Run db-init Job
# =============================================================================
step "Running database initialization job..."

kubectl apply -f "${SCRIPT_DIR}/k8s/base/jobs/db-init-job.yaml"

echo "  Waiting for db-init job to complete..."
kubectl wait --for=condition=complete job/db-init -n ondc-infra --timeout=120s 2>&1 || {
  log_warn "  db-init job did not complete within 120s."
  log_warn "  Checking job status..."
  kubectl describe job/db-init -n ondc-infra 2>/dev/null | tail -5
}

log_success "  Database initialization complete."

# =============================================================================
# Step 11: Apply vault deployment
# =============================================================================
step "Deploying vault service..."

kubectl apply -f "${SCRIPT_DIR}/k8s/base/core/vault-deployment.yaml"
kubectl apply -f "${SCRIPT_DIR}/k8s/base/core/vault-service.yaml"

echo "  Waiting for vault to be ready..."
kubectl wait --for=condition=ready pod -l app=vault -n ondc --timeout=120s 2>&1 || {
  log_warn "  Vault pod not ready within 120s. Continuing..."
}

log_success "  Vault service deployed and ready."

# =============================================================================
# Step 12: Run vault-seed Job
# =============================================================================
step "Running vault seed job..."

kubectl apply -f "${SCRIPT_DIR}/k8s/base/jobs/vault-seed-job.yaml"

echo "  Waiting for vault-seed job to complete..."
kubectl wait --for=condition=complete job/vault-seed -n ondc --timeout=120s 2>&1 || {
  log_warn "  vault-seed job did not complete within 120s."
  kubectl logs job/vault-seed -n ondc 2>/dev/null | tail -5 || true
}

log_success "  Vault secrets seeded."

# =============================================================================
# Step 13: Apply core services
# =============================================================================
step "Deploying core services (registry, gateway, bap, bpp, admin, docs)..."

CORE_SERVICES=(registry gateway bap bpp admin docs)
for svc in "${CORE_SERVICES[@]}"; do
  echo "  Applying ${svc}..."
  kubectl apply -f "${SCRIPT_DIR}/k8s/base/core/${svc}-deployment.yaml"
  kubectl apply -f "${SCRIPT_DIR}/k8s/base/core/${svc}-service.yaml"
done

echo "  Waiting for core service pods..."
for svc in "${CORE_SERVICES[@]}"; do
  kubectl wait --for=condition=ready pod -l "app=${svc}" -n ondc --timeout=120s 2>&1 || {
    log_warn "  ${svc} pod not ready within 120s."
  }
done

log_success "  Core services deployed."

# =============================================================================
# Step 14: Run db-seed Job
# =============================================================================
step "Running database seed job..."

kubectl apply -f "${SCRIPT_DIR}/k8s/base/jobs/db-seed-job.yaml"

echo "  Waiting for db-seed job to complete..."
kubectl wait --for=condition=complete job/db-seed -n ondc --timeout=120s 2>&1 || {
  log_warn "  db-seed job did not complete within 120s."
  kubectl logs job/db-seed -n ondc 2>/dev/null | tail -5 || true
}

log_success "  Database seeded (admin user, domains, cities, subscribers)."

# =============================================================================
# Step 15: Apply agent services
# =============================================================================
step "Deploying agent services (orchestrator, health-monitor, log-aggregator)..."

# Orchestrator needs RBAC first
echo "  Applying orchestrator RBAC..."
kubectl apply -f "${SCRIPT_DIR}/k8s/base/agents/orchestrator-rbac.yaml"

AGENT_SERVICES=(orchestrator health-monitor log-aggregator)
for svc in "${AGENT_SERVICES[@]}"; do
  echo "  Applying ${svc}..."
  kubectl apply -f "${SCRIPT_DIR}/k8s/base/agents/${svc}-deployment.yaml"
  kubectl apply -f "${SCRIPT_DIR}/k8s/base/agents/${svc}-service.yaml"
done

echo "  Waiting for agent pods..."
for svc in "${AGENT_SERVICES[@]}"; do
  kubectl wait --for=condition=ready pod -l "app=${svc}" -n ondc --timeout=120s 2>&1 || {
    log_warn "  ${svc} pod not ready within 120s."
  }
done

log_success "  Agent services deployed."

# =============================================================================
# Step 16: Apply Ingress, Network Policies, and HPAs
# =============================================================================
step "Applying Ingress, Network Policies, and HPAs..."

echo "  Applying Ingress resources..."
kubectl apply -f "${SCRIPT_DIR}/k8s/base/ingress/cert-issuer.yaml"
kubectl apply -f "${SCRIPT_DIR}/k8s/base/ingress/ingress.yaml"

echo "  Applying Network Policies..."
kubectl apply -f "${SCRIPT_DIR}/k8s/base/network-policies/"

echo "  Applying Horizontal Pod Autoscalers..."
kubectl apply -f "${SCRIPT_DIR}/k8s/base/hpa/"

log_success "  Ingress, Network Policies, and HPAs applied."

# =============================================================================
# Step 17: Dev mode — apply simulation services
# =============================================================================
step "Applying dev/simulation overlay..."

if [[ "$DEV_MODE" == true ]]; then
  echo "  Dev mode enabled. Deploying simulation services..."
  kubectl apply -f "${SCRIPT_DIR}/k8s/overlays/dev/simulation/"

  echo "  Waiting for simulation pods..."
  kubectl wait --for=condition=ready pod -l app=simulation-engine -n ondc-simulation --timeout=120s 2>&1 || {
    log_warn "  simulation-engine pod not ready within 120s."
  }
  kubectl wait --for=condition=ready pod -l app=mock-server -n ondc-simulation --timeout=120s 2>&1 || {
    log_warn "  mock-server pod not ready within 120s."
  }

  log_success "  Simulation services deployed (simulation-engine, mock-server)."
else
  echo "  Skipped (not in dev mode). Use --dev to include simulation services."
fi

# =============================================================================
# Step 18: Wait for all pods ready
# =============================================================================
step "Waiting for all pods to be ready..."

bash "${SCRIPT_DIR}/scripts/k8s-helpers/wait-for-ready.sh" --timeout 300 || {
  log_warn "  Some pods are not ready. Deployment may still be converging."
  log_warn "  Check with: kubectl get pods -A"
}

log_success "  Pod readiness check complete."

# =============================================================================
# Step 19: Health check
# =============================================================================
step "Running service health checks..."

bash "${SCRIPT_DIR}/scripts/k8s-helpers/health-check.sh" || {
  log_warn "  Some services failed health checks."
  log_warn "  Services may still be initializing. Retry in a few seconds."
}

log_success "  Health checks complete."

# =============================================================================
# Step 20: Print summary
# =============================================================================
step "Kubernetes deployment complete!"

echo ""
echo "  Cluster resources:"
echo ""
kubectl get all -n ondc-infra 2>/dev/null | while IFS= read -r line; do
  echo "    $line"
done
echo ""
kubectl get all -n ondc 2>/dev/null | while IFS= read -r line; do
  echo "    $line"
done

if [[ "$DEV_MODE" == true ]]; then
  echo ""
  kubectl get all -n ondc-simulation 2>/dev/null | while IFS= read -r line; do
    echo "    $line"
  done
fi

echo ""
echo -e "${BOLD}${CYAN}"
echo "  +-----------------------------------------------------------------+"
echo "  |                                                                 |"
echo "  |   ONDC Platform - Kubernetes Deployment Complete                |"
echo "  |                                                                 |"
echo "  |   Namespaces:                                                   |"
echo "  |     ondc-infra       : postgres, redis, rabbitmq                |"
echo "  |     ondc             : vault, registry, gateway, bap, bpp,      |"
echo "  |                        admin, docs, orchestrator,               |"
echo "  |                        health-monitor, log-aggregator           |"
if [[ "$DEV_MODE" == true ]]; then
echo "  |     ondc-simulation  : simulation-engine, mock-server           |"
fi
echo "  |                                                                 |"
echo "  |   Domain:   ${DOMAIN}$(printf '%*s' $((46 - ${#DOMAIN})) '')  |"
echo "  |   Cluster:  ${GKE_CLUSTER}$(printf '%*s' $((46 - ${#GKE_CLUSTER})) '')  |"
echo "  |                                                                 |"
echo "  |   Useful commands:                                              |"
echo "  |     kubectl get pods -A                                         |"
echo "  |     kubectl logs -n ondc <pod>                                  |"
echo "  |     bash scripts/k8s-helpers/health-check.sh                    |"
echo "  |     bash scripts/k8s-helpers/teardown-k8s.sh                    |"
echo "  |                                                                 |"
echo "  +-----------------------------------------------------------------+"
echo -e "${NC}"

log_success "ONDC Kubernetes deployment complete. Happy building!"
