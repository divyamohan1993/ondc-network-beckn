#!/usr/bin/env bash
# =============================================================================
# ONDC Network Beckn - Kubernetes Service Health Checker
# =============================================================================
# Port-forwards each service and curls /health to verify they are responding.
#
# Usage:
#   bash scripts/k8s-helpers/health-check.sh
#   bash scripts/k8s-helpers/health-check.sh --namespace ondc
#   bash scripts/k8s-helpers/health-check.sh --timeout 10
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
# Service definitions: name:port:namespace
# ---------------------------------------------------------------------------
SERVICES=(
  "registry:3001:ondc"
  "gateway:3002:ondc"
  "admin:3003:ondc"
  "bap:3004:ondc"
  "bpp:3005:ondc"
  "vault:3006:ondc"
  "orchestrator:3007:ondc"
  "health-monitor:3008:ondc"
  "log-aggregator:3009:ondc"
)

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
CURL_TIMEOUT=5
NAMESPACE_OVERRIDE=""
PORT_FORWARD_WAIT=3

while [[ $# -gt 0 ]]; do
  case $1 in
    -n|--namespace)
      NAMESPACE_OVERRIDE="$2"
      shift 2
      ;;
    -t|--timeout)
      CURL_TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: bash health-check.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -n, --namespace <name>    Override namespace for all services (default: per-service)"
      echo "  -t, --timeout <seconds>   Curl timeout per service (default: 5)"
      echo "  -h, --help                Show this help message"
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

if ! command -v curl &>/dev/null; then
  log_error "curl is not installed or not in PATH."
  exit 1
fi

if ! kubectl cluster-info &>/dev/null; then
  log_error "Cannot reach Kubernetes cluster. Check your kubeconfig."
  exit 1
fi

# ---------------------------------------------------------------------------
# Cleanup handler: kill any leftover port-forward processes
# ---------------------------------------------------------------------------
PF_PIDS=()

cleanup() {
  for pid in "${PF_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Health check function
# ---------------------------------------------------------------------------
check_service_health() {
  local svc_name="$1"
  local svc_port="$2"
  local svc_ns="$3"
  local local_port

  # Use a local port offset to avoid collisions (base 10000 + service port)
  local_port=$((10000 + svc_port))

  # Check if the service exists in the namespace
  if ! kubectl get svc "$svc_name" -n "$svc_ns" &>/dev/null; then
    echo -e "  ${RED}X${NC}  ${svc_name}:${svc_port} (${svc_ns}) - ${RED}Service not found${NC}"
    return 1
  fi

  # Start port-forward in background
  kubectl port-forward "svc/${svc_name}" "${local_port}:${svc_port}" \
    -n "$svc_ns" &>/dev/null &
  local pf_pid=$!
  PF_PIDS+=("$pf_pid")

  # Wait for port-forward to establish
  local waited=0
  while [[ $waited -lt $PORT_FORWARD_WAIT ]]; do
    if ! kill -0 "$pf_pid" 2>/dev/null; then
      echo -e "  ${RED}X${NC}  ${svc_name}:${svc_port} (${svc_ns}) - ${RED}Port-forward failed to start${NC}"
      return 1
    fi
    # Check if port is listening
    if curl -sf --max-time 1 "http://localhost:${local_port}/health" &>/dev/null; then
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done

  # Perform health check
  local http_code
  local response_body

  response_body=$(curl -sf --max-time "$CURL_TIMEOUT" \
    "http://localhost:${local_port}/health" 2>/dev/null) || true
  http_code=$(curl -sf --max-time "$CURL_TIMEOUT" -o /dev/null -w "%{http_code}" \
    "http://localhost:${local_port}/health" 2>/dev/null) || http_code="000"

  # Kill the port-forward
  if kill -0 "$pf_pid" 2>/dev/null; then
    kill "$pf_pid" 2>/dev/null || true
    wait "$pf_pid" 2>/dev/null || true
  fi

  # Evaluate result
  if [[ "$http_code" == "200" ]]; then
    echo -e "  ${GREEN}V${NC}  ${svc_name}:${svc_port} (${svc_ns}) - ${GREEN}HTTP ${http_code} - Healthy${NC}"
    if [[ -n "$response_body" ]]; then
      # Try to extract status from JSON response
      local status
      status=$(echo "$response_body" | grep -o '"status":"[^"]*"' | head -1 || true)
      if [[ -n "$status" ]]; then
        echo -e "      ${BLUE}${status}${NC}"
      fi
    fi
    return 0
  else
    echo -e "  ${RED}X${NC}  ${svc_name}:${svc_port} (${svc_ns}) - ${RED}HTTP ${http_code} - Unhealthy${NC}"
    if [[ -n "$response_body" ]]; then
      echo -e "      ${YELLOW}Response: ${response_body:0:200}${NC}"
    fi
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Run health checks
# ---------------------------------------------------------------------------
echo ""
log_step "ONDC Network Beckn - Kubernetes Health Check"
echo -e "  Curl timeout: ${CYAN}${CURL_TIMEOUT}s${NC} per service"
echo -e "  Services:     ${CYAN}${#SERVICES[@]}${NC}"
echo ""

HEALTHY=0
UNHEALTHY=0
TOTAL=${#SERVICES[@]}

for svc_entry in "${SERVICES[@]}"; do
  IFS=':' read -r svc_name svc_port svc_ns <<< "$svc_entry"

  # Apply namespace override if set
  if [[ -n "$NAMESPACE_OVERRIDE" ]]; then
    svc_ns="$NAMESPACE_OVERRIDE"
  fi

  if check_service_health "$svc_name" "$svc_port" "$svc_ns"; then
    HEALTHY=$((HEALTHY + 1))
  else
    UNHEALTHY=$((UNHEALTHY + 1))
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}$(printf '%.0s-' {1..60})${NC}"
log_step "Health Check Summary"
echo ""
echo -e "  ${GREEN}Healthy:${NC}    ${HEALTHY}/${TOTAL}"
if [[ "$UNHEALTHY" -gt 0 ]]; then
  echo -e "  ${RED}Unhealthy:${NC}  ${UNHEALTHY}/${TOTAL}"
fi
echo ""

if [[ "$UNHEALTHY" -gt 0 ]]; then
  log_error "${UNHEALTHY} service(s) failed health check."
  echo ""
  log_info "Debug tips:"
  log_info "  kubectl logs -n ondc <pod-name>"
  log_info "  kubectl describe pod -n ondc <pod-name>"
  log_info "  kubectl get events -n ondc --sort-by=.metadata.creationTimestamp"
  exit 1
fi

log_success "All ${TOTAL} services are healthy."
exit 0
