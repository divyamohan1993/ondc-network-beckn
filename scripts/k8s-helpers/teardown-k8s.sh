#!/usr/bin/env bash
# =============================================================================
# ONDC Network Beckn - Kubernetes Teardown
# =============================================================================
# Supports multiple teardown modes for the ONDC Beckn Kubernetes deployment.
#
# Usage:
#   bash scripts/k8s-helpers/teardown-k8s.sh <mode>
#
# Modes:
#   soft   - Scale all deployments to 0 replicas in ondc namespace (preserves state)
#   hard   - Delete all deployments, statefulsets, and jobs (requires confirmation)
#   full   - Delete all 3 namespaces entirely (requires confirmation)
#   reset  - Scale to 0, recreate db-init job, scale back up
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
# Namespaces
# ---------------------------------------------------------------------------
NAMESPACES=("ondc-infra" "ondc" "ondc-simulation")

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
MODE=""
FORCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    soft|hard|full|reset)
      MODE="$1"
      shift
      ;;
    -y|--yes)
      FORCE=true
      shift
      ;;
    -h|--help)
      echo "Usage: bash teardown-k8s.sh <mode> [OPTIONS]"
      echo ""
      echo "Modes:"
      echo "  soft   Scale all deployments to 0 replicas (preserves resources)"
      echo "  hard   Delete all deployments, statefulsets, and jobs"
      echo "  full   Delete all namespaces (ondc-infra, ondc, ondc-simulation)"
      echo "  reset  Scale down, recreate db-init job, scale back up"
      echo ""
      echo "Options:"
      echo "  -y, --yes    Skip confirmation prompts"
      echo "  -h, --help   Show this help message"
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      echo "Run with --help for usage."
      exit 1
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  log_error "No mode specified."
  echo ""
  echo "Usage: bash teardown-k8s.sh <mode>"
  echo "Modes: soft | hard | full | reset"
  echo "Run with --help for details."
  exit 1
fi

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
# Confirmation prompt for destructive modes
# ---------------------------------------------------------------------------
confirm_action() {
  local action_desc="$1"

  if [[ "$FORCE" == true ]]; then
    return 0
  fi

  echo ""
  echo -e "  ${RED}${BOLD}WARNING: This action is destructive and cannot be undone.${NC}"
  echo -e "  ${YELLOW}${action_desc}${NC}"
  echo ""
  read -rp "  Type 'yes' to confirm: " confirm
  echo ""

  if [[ "$confirm" != "yes" ]]; then
    log_info "Aborted by user."
    exit 0
  fi
}

# ---------------------------------------------------------------------------
# Helper: scale all deployments in a namespace
# ---------------------------------------------------------------------------
scale_namespace() {
  local ns="$1"
  local replicas="$2"

  if ! kubectl get namespace "$ns" &>/dev/null; then
    log_warn "Namespace '${ns}' does not exist. Skipping."
    return 0
  fi

  local deployments
  deployments=$(kubectl get deployments -n "$ns" --no-headers -o custom-columns=":metadata.name" 2>/dev/null || true)

  if [[ -z "$deployments" ]]; then
    log_info "No deployments in namespace '${ns}'."
    return 0
  fi

  while IFS= read -r deploy; do
    [[ -z "$deploy" ]] && continue
    log_info "Scaling deployment '${deploy}' in '${ns}' to ${replicas} replicas..."
    kubectl scale deployment "$deploy" -n "$ns" --replicas="$replicas"
  done <<< "$deployments"

  log_success "All deployments in '${ns}' scaled to ${replicas} replicas."
}

# ---------------------------------------------------------------------------
# Helper: save current replica counts for a namespace (for reset mode)
# ---------------------------------------------------------------------------
declare -A SAVED_REPLICAS

save_replica_counts() {
  local ns="$1"

  if ! kubectl get namespace "$ns" &>/dev/null; then
    return 0
  fi

  local deploy_info
  deploy_info=$(kubectl get deployments -n "$ns" --no-headers \
    -o custom-columns=":metadata.name,:spec.replicas" 2>/dev/null || true)

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local name count
    name=$(echo "$line" | awk '{print $1}')
    count=$(echo "$line" | awk '{print $2}')
    SAVED_REPLICAS["${ns}/${name}"]="${count:-1}"
  done <<< "$deploy_info"
}

restore_replica_counts() {
  local ns="$1"

  if ! kubectl get namespace "$ns" &>/dev/null; then
    return 0
  fi

  local deployments
  deployments=$(kubectl get deployments -n "$ns" --no-headers -o custom-columns=":metadata.name" 2>/dev/null || true)

  while IFS= read -r deploy; do
    [[ -z "$deploy" ]] && continue
    local saved="${SAVED_REPLICAS["${ns}/${deploy}"]:-1}"
    log_info "Restoring deployment '${deploy}' in '${ns}' to ${saved} replicas..."
    kubectl scale deployment "$deploy" -n "$ns" --replicas="$saved"
  done <<< "$deployments"

  log_success "All deployments in '${ns}' restored to previous replica counts."
}

# ===========================================================================
# Mode: soft
# ===========================================================================
do_soft() {
  log_step "Teardown mode: SOFT"
  log_info "Scaling all deployments to 0 replicas (state preserved)."
  echo ""

  for ns in "${NAMESPACES[@]}"; do
    log_step "Scaling down namespace: ${ns}"
    scale_namespace "$ns" 0
    echo ""
  done

  log_success "Soft teardown complete. All deployments scaled to 0."
  log_info "To restore, manually scale deployments back up or run 'reset' mode."
}

# ===========================================================================
# Mode: hard
# ===========================================================================
do_hard() {
  log_step "Teardown mode: HARD"
  log_warn "This will DELETE all deployments, statefulsets, and jobs across all ONDC namespaces."

  confirm_action "All deployments, statefulsets, and jobs in ${NAMESPACES[*]} will be deleted."

  for ns in "${NAMESPACES[@]}"; do
    if ! kubectl get namespace "$ns" &>/dev/null; then
      log_warn "Namespace '${ns}' does not exist. Skipping."
      echo ""
      continue
    fi

    log_step "Deleting resources in namespace: ${ns}"

    # Deployments
    local deploy_count
    deploy_count=$(kubectl get deployments -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$deploy_count" -gt 0 ]]; then
      log_info "Deleting ${deploy_count} deployment(s)..."
      kubectl delete deployments --all -n "$ns" --grace-period=30
      log_success "Deployments deleted in '${ns}'."
    else
      log_info "No deployments in '${ns}'."
    fi

    # StatefulSets
    local sts_count
    sts_count=$(kubectl get statefulsets -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$sts_count" -gt 0 ]]; then
      log_info "Deleting ${sts_count} statefulset(s)..."
      kubectl delete statefulsets --all -n "$ns" --grace-period=30
      log_success "StatefulSets deleted in '${ns}'."
    else
      log_info "No statefulsets in '${ns}'."
    fi

    # Jobs
    local job_count
    job_count=$(kubectl get jobs -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$job_count" -gt 0 ]]; then
      log_info "Deleting ${job_count} job(s)..."
      kubectl delete jobs --all -n "$ns"
      log_success "Jobs deleted in '${ns}'."
    else
      log_info "No jobs in '${ns}'."
    fi

    echo ""
  done

  log_success "Hard teardown complete. All workloads deleted."
  log_info "Namespaces, secrets, configmaps, and PVCs are preserved."
}

# ===========================================================================
# Mode: full
# ===========================================================================
do_full() {
  log_step "Teardown mode: FULL"
  echo -e "  ${RED}${BOLD}This will DELETE ALL namespaces and EVERYTHING inside them:${NC}"
  for ns in "${NAMESPACES[@]}"; do
    echo -e "    ${RED}- ${ns}${NC}"
  done
  echo -e "  ${RED}This includes: pods, deployments, services, secrets, configmaps, PVCs, etc.${NC}"

  confirm_action "ALL resources in namespaces ${NAMESPACES[*]} will be permanently deleted."

  for ns in "${NAMESPACES[@]}"; do
    if ! kubectl get namespace "$ns" &>/dev/null; then
      log_warn "Namespace '${ns}' does not exist. Skipping."
      continue
    fi

    log_step "Deleting namespace: ${ns}"
    kubectl delete namespace "$ns" --grace-period=60 &
  done

  log_info "Waiting for all namespace deletions to complete..."
  wait

  # Verify namespaces are gone
  echo ""
  for ns in "${NAMESPACES[@]}"; do
    if kubectl get namespace "$ns" &>/dev/null; then
      log_warn "Namespace '${ns}' still exists (may be terminating)."
      log_info "Check with: kubectl get namespace ${ns} -o yaml"
    else
      log_success "Namespace '${ns}' deleted."
    fi
  done

  echo ""
  log_success "Full teardown complete."
  log_info "Re-deploy with: bash scripts/k8s-helpers/generate-secrets.sh && kubectl apply -f k8s/"
}

# ===========================================================================
# Mode: reset
# ===========================================================================
do_reset() {
  log_step "Teardown mode: RESET"
  log_info "This will scale down, recreate the db-init job, then scale back up."
  echo ""

  # Save current replica counts
  log_step "Saving current replica counts..."
  for ns in "${NAMESPACES[@]}"; do
    save_replica_counts "$ns"
  done
  log_success "Replica counts saved."
  echo ""

  # Scale everything down
  log_step "Scaling all deployments to 0..."
  for ns in "${NAMESPACES[@]}"; do
    scale_namespace "$ns" 0
  done
  echo ""

  # Wait for pods to terminate
  log_step "Waiting for pods to terminate..."
  for ns in "${NAMESPACES[@]}"; do
    if ! kubectl get namespace "$ns" &>/dev/null; then
      continue
    fi

    local pod_count
    pod_count=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')

    if [[ "$pod_count" -gt 0 ]]; then
      log_info "Waiting for pods in '${ns}' to terminate..."
      kubectl wait --for=delete pod --all -n "$ns" --timeout=120s 2>/dev/null || {
        log_warn "Some pods in '${ns}' may still be terminating."
      }
    fi
  done
  echo ""

  # Delete and recreate db-init job
  log_step "Recreating db-init job..."
  DB_INIT_NS="ondc-infra"

  if kubectl get job db-init -n "$DB_INIT_NS" &>/dev/null; then
    log_info "Deleting existing db-init job..."
    kubectl delete job db-init -n "$DB_INIT_NS" --grace-period=0
    log_success "Old db-init job deleted."
  else
    log_info "No existing db-init job found."
  fi

  # Re-apply the db-init job from the manifests
  DB_INIT_MANIFEST=""
  for candidate in \
    "k8s/infra/db-init-job.yaml" \
    "k8s/jobs/db-init.yaml" \
    "k8s/db-init-job.yaml" \
    "k8s/infra/db-init.yaml"; do
    if [[ -f "$candidate" ]]; then
      DB_INIT_MANIFEST="$candidate"
      break
    fi
  done

  if [[ -n "$DB_INIT_MANIFEST" ]]; then
    log_info "Applying db-init job from '${DB_INIT_MANIFEST}'..."
    kubectl apply -f "$DB_INIT_MANIFEST"
    log_success "db-init job created."

    # Wait for the job to complete
    log_info "Waiting for db-init job to complete (timeout: 120s)..."
    if kubectl wait --for=condition=complete job/db-init \
      -n "$DB_INIT_NS" --timeout=120s 2>/dev/null; then
      log_success "db-init job completed successfully."
    else
      log_error "db-init job did not complete within 120s."
      log_info "Check with: kubectl logs -n ${DB_INIT_NS} job/db-init"
      log_warn "Continuing with scale-up anyway..."
    fi
  else
    log_warn "No db-init job manifest found. Skipping db-init recreation."
    log_info "Looked in: k8s/infra/db-init-job.yaml, k8s/jobs/db-init.yaml, k8s/db-init-job.yaml, k8s/infra/db-init.yaml"
  fi
  echo ""

  # Scale everything back up
  log_step "Restoring deployments to previous replica counts..."
  for ns in "${NAMESPACES[@]}"; do
    restore_replica_counts "$ns"
  done
  echo ""

  log_success "Reset complete. Services are scaling back up."
  log_info "Monitor readiness with: bash scripts/k8s-helpers/wait-for-ready.sh"
}

# ===========================================================================
# Main dispatch
# ===========================================================================
echo ""
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "${BOLD}${CYAN}  ONDC Network Beckn - Kubernetes Teardown (${MODE})${NC}"
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo ""

case "$MODE" in
  soft)  do_soft  ;;
  hard)  do_hard  ;;
  full)  do_full  ;;
  reset) do_reset ;;
  *)
    log_error "Invalid mode: ${MODE}"
    exit 1
    ;;
esac

echo ""
