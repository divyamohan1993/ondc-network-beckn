#!/usr/bin/env bash
# =============================================================================
# ONDC Platform — Simulation Wrapper
# =============================================================================
# Wrapper script that ensures the mock-server is running and then invokes
# the simulation TypeScript script (scripts/src/simulate.ts).
#
# Usage:
#   sudo bash simulate.sh [OPTIONS]
#
# Options are passed through to scripts/src/simulate.ts:
#   --baps <number>       Number of simulated BAPs to create (default: 3)
#   --bpps <number>       Number of simulated BPPs to create (default: 10)
#   --orders <number>     Number of order flows to simulate (default: 100)
#   --domains <list>      Comma-separated: water,food,agriculture,logistics
#   --cities <list>       Comma-separated city codes: std:011,std:080,...
#   --live                Run continuously generating 1 order/second
#   --reset               Delete all simulated data before running
#
# Examples:
#   sudo bash simulate.sh --baps 5 --bpps 20 --orders 500
#   sudo bash simulate.sh --domains water,food --cities std:011,std:022
#   sudo bash simulate.sh --live
#   sudo bash simulate.sh --reset --bpps 50 --orders 2000
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Resolve script directory (cd into project root)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Load environment variables if .env exists
# ---------------------------------------------------------------------------
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# ---------------------------------------------------------------------------
# Ensure Docker Compose services are running
# ---------------------------------------------------------------------------
echo -e "${BLUE}Checking service status...${NC}"

# Check if core services (postgres, registry, gateway, bap, bpp) are running
CORE_RUNNING=true
for SERVICE in postgres registry gateway bap bpp; do
  if ! docker compose ps "$SERVICE" --format json 2>/dev/null | grep -q "running"; then
    CORE_RUNNING=false
    break
  fi
done

if [ "$CORE_RUNNING" = false ]; then
  echo -e "${YELLOW}Core services are not running. Starting the platform...${NC}"
  docker compose --profile simulation up -d
  echo -e "${BLUE}Waiting 15 seconds for services to initialize...${NC}"
  sleep 15
fi

# ---------------------------------------------------------------------------
# Ensure mock-server is running (simulation profile)
# ---------------------------------------------------------------------------
MOCK_RUNNING=false
if docker compose ps mock-server --format json 2>/dev/null | grep -q "running"; then
  MOCK_RUNNING=true
fi

if [ "$MOCK_RUNNING" = false ]; then
  echo -e "${YELLOW}Starting mock server (simulation profile)...${NC}"
  docker compose --profile simulation up -d mock-server
  echo -e "${BLUE}Waiting 5 seconds for mock server to initialize...${NC}"
  sleep 5

  # Verify mock server is responding
  RETRIES=0
  MAX_RETRIES=10
  while [ $RETRIES -lt $MAX_RETRIES ]; do
    if curl -sf "http://localhost:${MOCK_SERVER_PORT:-3010}/health" > /dev/null 2>&1; then
      echo -e "${GREEN}Mock server is ready.${NC}"
      break
    fi
    RETRIES=$((RETRIES + 1))
    echo "  Waiting for mock server... (attempt ${RETRIES}/${MAX_RETRIES})"
    sleep 2
  done

  if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo -e "${YELLOW}WARNING: Mock server health check timed out. Simulation may still work.${NC}"
  fi
else
  echo -e "${GREEN}Mock server is already running.${NC}"
fi

# ---------------------------------------------------------------------------
# Run simulation
# ---------------------------------------------------------------------------
echo ""
echo -e "${BLUE}=== Starting ONDC Network Simulation ===${NC}"
echo ""

# Check if pnpm is available and project dependencies are installed
if command -v pnpm &> /dev/null && [ -d node_modules ] || [ -d scripts/node_modules ]; then
  echo -e "${BLUE}Running simulation via pnpm...${NC}"
  echo ""

  # Build DATABASE_URL for local connection (scripts run on host, not in container)
  export DATABASE_URL="postgresql://${POSTGRES_USER:-ondc_admin}:${POSTGRES_PASSWORD:-changeme}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-ondc}"
  export REGISTRY_URL="http://localhost:${REGISTRY_PORT:-3001}"
  export MOCK_SERVER_URL="http://localhost:${MOCK_SERVER_PORT:-3010}"
  export BAP_ADAPTER_URL="http://localhost:${BAP_PORT:-3004}"
  export BPP_ADAPTER_URL="http://localhost:${BPP_PORT:-3005}"

  pnpm --filter @ondc/scripts simulate -- "$@"
else
  echo -e "${BLUE}Running simulation via Docker container...${NC}"
  echo ""

  # Run inside the registry container which has Node.js and access to the DB
  docker compose exec -T \
    -e DATABASE_URL="postgresql://${POSTGRES_USER:-ondc_admin}:${POSTGRES_PASSWORD:-changeme}@postgres:5432/${POSTGRES_DB:-ondc}" \
    -e REGISTRY_URL="http://registry:${REGISTRY_PORT:-3001}" \
    -e MOCK_SERVER_URL="http://mock-server:${MOCK_SERVER_PORT:-3010}" \
    -e BAP_ADAPTER_URL="http://bap:${BAP_PORT:-3004}" \
    -e BPP_ADAPTER_URL="http://bpp:${BPP_PORT:-3005}" \
    registry npx tsx /app/scripts/src/simulate.ts "$@"
fi

echo ""
echo -e "${GREEN}Simulation finished.${NC}"
echo ""
echo "View results:"
echo "  Admin Dashboard:  https://admin.${DOMAIN:-ondc.dmj.one}"
echo "  Transactions:     https://admin.${DOMAIN:-ondc.dmj.one}/transactions"
echo "  Analytics:        https://admin.${DOMAIN:-ondc.dmj.one}/analytics"
echo "  Health check:     curl http://localhost:${REGISTRY_PORT:-3001}/health"
