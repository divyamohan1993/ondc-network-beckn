#!/usr/bin/env bash
# =============================================================================
# ONDC Platform — Teardown / Clean Shutdown
# =============================================================================
# Stops all ONDC platform services with various levels of cleanup.
#
# Usage:
#   sudo bash teardown.sh              # Stop containers, preserve data volumes
#   sudo bash teardown.sh --volumes    # Stop containers and remove data volumes
#   sudo bash teardown.sh --full       # Stop, remove volumes, remove Docker images
#
# Flags:
#   --volumes    Remove Docker volumes (PostgreSQL data, Redis data, RabbitMQ data)
#   --full       Remove everything: volumes + Docker images (complete cleanup)
#   -y, --yes    Skip confirmation prompt
#   -h, --help   Show help
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
VOLUMES=false
FULL=false
SKIP_CONFIRM=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --volumes)
      VOLUMES=true
      shift
      ;;
    --full)
      FULL=true
      VOLUMES=true
      shift
      ;;
    -y|--yes)
      SKIP_CONFIRM=true
      shift
      ;;
    -h|--help)
      echo "Usage: sudo bash teardown.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --volumes    Stop containers and remove data volumes (PostgreSQL, Redis, RabbitMQ)"
      echo "  --full       Remove everything: volumes + Docker images (complete cleanup)"
      echo "  -y, --yes    Skip confirmation prompt"
      echo "  -h, --help   Show this help message"
      echo ""
      echo "Examples:"
      echo "  sudo bash teardown.sh              # Graceful stop, data preserved"
      echo "  sudo bash teardown.sh --volumes    # Stop and wipe all data"
      echo "  sudo bash teardown.sh --full -y    # Nuclear option, no confirmation"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
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

# ---------------------------------------------------------------------------
# Confirmation for destructive operations
# ---------------------------------------------------------------------------
if [ "$VOLUMES" = true ] && [ "$SKIP_CONFIRM" = false ]; then
  echo ""
  if [ "$FULL" = true ]; then
    echo -e "${BOLD}${RED}WARNING: Full teardown requested.${NC}"
    echo "This will:"
    echo "  1. Stop all running containers"
    echo "  2. Remove all Docker volumes (PostgreSQL data, Redis data, RabbitMQ data)"
    echo "  3. Remove all Docker images built for this project"
    echo ""
    echo -e "${RED}ALL DATA WILL BE PERMANENTLY LOST.${NC}"
  else
    echo -e "${BOLD}${YELLOW}WARNING: Volume removal requested.${NC}"
    echo "This will:"
    echo "  1. Stop all running containers"
    echo "  2. Remove all Docker volumes (PostgreSQL data, Redis data, RabbitMQ data)"
    echo ""
    echo -e "${YELLOW}ALL DATABASE DATA WILL BE PERMANENTLY LOST.${NC}"
  fi
  echo ""
  read -rp "Are you sure? (y/N) " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# ---------------------------------------------------------------------------
# Teardown
# ---------------------------------------------------------------------------
echo -e "${BLUE}${BOLD}Stopping ONDC Platform...${NC}"
echo ""

# Show current state before stopping
echo -e "${BLUE}Current running services:${NC}"
docker compose --profile simulation ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
echo ""

# Stop and remove containers
if [ "$VOLUMES" = true ]; then
  echo -e "${YELLOW}Stopping containers and removing volumes...${NC}"
  docker compose --profile simulation down -v 2>&1 | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "${GREEN}All containers stopped and volumes removed.${NC}"
else
  echo -e "${BLUE}Stopping containers (preserving data volumes)...${NC}"
  docker compose --profile simulation down 2>&1 | while IFS= read -r line; do
    echo "  $line"
  done
  echo ""
  echo -e "${GREEN}All containers stopped. Data volumes preserved.${NC}"
fi

# Full cleanup: remove Docker images
if [ "$FULL" = true ]; then
  echo ""
  echo -e "${YELLOW}Removing Docker images...${NC}"
  docker compose --profile simulation down --rmi all 2>/dev/null | while IFS= read -r line; do
    echo "  $line"
  done || true

  # Also remove any dangling images from the build
  echo "  Pruning dangling images..."
  docker image prune -f > /dev/null 2>&1 || true

  echo ""
  echo -e "${GREEN}Full cleanup complete. Docker images removed.${NC}"
fi

# Remove cron job if it exists
if crontab -l 2>/dev/null | grep -q "ondc_backup"; then
  echo ""
  echo -e "${BLUE}Removing backup cron job...${NC}"
  (crontab -l 2>/dev/null | grep -v "ondc_backup") | crontab - 2>/dev/null || true
  echo -e "${GREEN}Backup cron job removed.${NC}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Teardown Summary:${NC}"
echo "  Containers:   Stopped and removed"
if [ "$VOLUMES" = true ]; then
  echo "  Volumes:      Removed (all data wiped)"
else
  echo "  Volumes:      Preserved (data intact)"
fi
if [ "$FULL" = true ]; then
  echo "  Images:       Removed"
else
  echo "  Images:       Preserved (faster rebuild)"
fi
echo ""

if [ "$VOLUMES" = false ]; then
  echo -e "${BLUE}To restart:${NC}"
  echo "  docker compose up -d"
  echo ""
  echo -e "${BLUE}To also remove data:${NC}"
  echo "  sudo bash teardown.sh --volumes"
else
  echo -e "${BLUE}To redeploy from scratch:${NC}"
  echo "  sudo bash autoconfig.sh"
fi

echo ""
echo -e "${GREEN}Teardown complete.${NC}"
