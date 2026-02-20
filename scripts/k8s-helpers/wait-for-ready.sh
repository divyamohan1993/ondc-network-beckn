#!/usr/bin/env bash
# =============================================================================
# ONDC Network Beckn - Kubernetes Pod Readiness Waiter
# =============================================================================
# Waits for all pods across ondc, ondc-infra, and ondc-simulation namespaces
# to reach the Ready condition.
#
# Usage:
#   bash scripts/k8s-helpers/wait-for-ready.sh              # default 300s timeout
#   bash scripts/k8s-helpers/wait-for-ready.sh --timeout 600
#   bash scripts/k8s-helpers/wait-for-ready.sh -t 120
#   bash scripts/k8s-helpers/wait-for-ready.sh --namespace ondc  # single namespace
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
# Parse arguments
# ---------------------------------------------------------------------------
TIMEOUT=300
NAMESPACES=("ondc-infra" "ondc" "ondc-simulation")
CUSTOM_NS=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -t|--timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    -n|--namespace)
      if [[ "$CUSTOM_NS" == false ]]; then
        NAMESPACES=()
        CUSTOM_NS=true
      fi
      NAMESPACES+=("$2")
      shift 2
      ;;
    -h|--help)
      echo "Usage: bash wait-for-ready.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -t, --timeout <seconds>     Timeout per namespace (default: 300)"
      echo "  -n, --namespace <name>      Namespace to watch (repeatable; default: ondc-infra, ondc, ondc-simulation)"
      echo "  -h, --help                  Show this help message"
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      echo "Run with --help for usage."
      exit 1
      ;;
  esac
done

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
# Wait for pods in each namespace
# ---------------------------------------------------------------------------
TOTAL_NAMESPACES=${#NAMESPACES[@]}
PASSED=0
FAILED=0
SKIPPED=0

echo ""
log_step "Waiting for pods to be ready (timeout: ${TIMEOUT}s per namespace)"
echo -e "  Namespaces: ${CYAN}${NAMESPACES[*]}${NC}"
echo ""

for ns in "${NAMESPACES[@]}"; do
  log_step "Checking namespace: ${ns}"

  # Check if namespace exists
  if ! kubectl get namespace "$ns" &>/dev/null; then
    log_warn "Namespace '${ns}' does not exist. Skipping."
    SKIPPED=$((SKIPPED + 1))
    echo ""
    continue
  fi

  # Get the list of pods in this namespace
  POD_COUNT=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$POD_COUNT" -eq 0 ]]; then
    log_warn "No pods found in namespace '${ns}'. Skipping."
    SKIPPED=$((SKIPPED + 1))
    echo ""
    continue
  fi

  log_info "Found ${POD_COUNT} pod(s) in namespace '${ns}'."

  # Show current pod status before waiting
  echo -e "  ${BLUE}Current status:${NC}"
  kubectl get pods -n "$ns" --no-headers 2>/dev/null | while IFS= read -r line; do
    POD_NAME=$(echo "$line" | awk '{print $1}')
    POD_STATUS=$(echo "$line" | awk '{print $3}')
    POD_READY=$(echo "$line" | awk '{print $2}')

    if [[ "$POD_STATUS" == "Running" ]]; then
      echo -e "    ${GREEN}*${NC} ${POD_NAME}  ${POD_READY}  ${GREEN}${POD_STATUS}${NC}"
    elif [[ "$POD_STATUS" == "Pending" || "$POD_STATUS" == "ContainerCreating" ]]; then
      echo -e "    ${YELLOW}*${NC} ${POD_NAME}  ${POD_READY}  ${YELLOW}${POD_STATUS}${NC}"
    else
      echo -e "    ${RED}*${NC} ${POD_NAME}  ${POD_READY}  ${RED}${POD_STATUS}${NC}"
    fi
  done

  echo ""
  log_info "Waiting up to ${TIMEOUT}s for all pods in '${ns}' to be ready..."

  if kubectl wait --for=condition=ready pod --all \
    --namespace="$ns" \
    --timeout="${TIMEOUT}s" 2>&1; then
    log_success "All pods in namespace '${ns}' are ready."
    PASSED=$((PASSED + 1))
  else
    log_error "Timeout reached waiting for pods in namespace '${ns}'."
    echo ""
    log_error "Pods that are NOT ready:"
    kubectl get pods -n "$ns" --no-headers 2>/dev/null | while IFS= read -r line; do
      POD_STATUS=$(echo "$line" | awk '{print $3}')
      if [[ "$POD_STATUS" != "Running" ]]; then
        POD_NAME=$(echo "$line" | awk '{print $1}')
        echo -e "    ${RED}X${NC} ${POD_NAME}  (${POD_STATUS})"
      fi
    done
    FAILED=$((FAILED + 1))
  fi

  echo ""
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log_step "Readiness check summary"
echo ""
echo -e "  ${GREEN}Passed:${NC}   ${PASSED}/${TOTAL_NAMESPACES} namespaces"
if [[ "$SKIPPED" -gt 0 ]]; then
  echo -e "  ${YELLOW}Skipped:${NC}  ${SKIPPED}/${TOTAL_NAMESPACES} namespaces"
fi
if [[ "$FAILED" -gt 0 ]]; then
  echo -e "  ${RED}Failed:${NC}   ${FAILED}/${TOTAL_NAMESPACES} namespaces"
fi
echo ""

if [[ "$FAILED" -gt 0 ]]; then
  log_error "One or more namespaces have pods that are not ready."
  log_info "Debug with: kubectl get pods -n <namespace> -o wide"
  log_info "Logs with:  kubectl logs -n <namespace> <pod-name>"
  exit 1
fi

log_success "All pods across all namespaces are ready."
exit 0
