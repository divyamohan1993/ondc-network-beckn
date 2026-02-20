# Deployment Guide

Complete guide to deploying the ONDC Beckn Network in production.

---

## Table of Contents

- [Requirements](#requirements)
- [Quick Deploy](#quick-deploy)
- [Manual Deploy](#manual-deploy)
- [Production Configuration](#production-configuration)
- [SSL/TLS Setup](#ssltls-setup)
- [DNS Configuration](#dns-configuration)
- [Scaling](#scaling)
- [Backup & Recovery](#backup--recovery)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Requirements

### Hardware

| Spec | Minimum | Recommended |
|------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 10 GB | 50+ GB (for logs/data) |
| Network | Public IP | Static IP + domain |

### Software

| Software | Version | Notes |
|----------|---------|-------|
| OS | Ubuntu 22.04+ | Any Linux with Docker works |
| Docker | 24.0+ | With Compose V2 |
| Node.js | 22 LTS | Only needed for local dev |
| pnpm | 10+ | Only needed for local dev |
| Git | 2.30+ | For cloning the repo |

---

## Quick Deploy

### Automated (Recommended)

The `autoconfig.sh` script handles everything from a blank Ubuntu VM:

```bash
# Clone
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn

# Deploy with defaults (uses ondc.dmj.one)
sudo bash autoconfig.sh

# Deploy for production
sudo bash autoconfig.sh --production --domain ondc.dmj.one

# Deploy with custom admin credentials
sudo bash autoconfig.sh \
  --production \
  --domain ondc.dmj.one \
  --admin-email admin@dmj.one \
  --admin-password your-secure-password
```

### What `autoconfig.sh` Does (17 steps)

1. Checks system requirements (Ubuntu 22.04+)
2. Installs Docker & Docker Compose
3. Installs Node.js 20 & pnpm
4. Clones/updates repository
5. Generates Ed25519 signing key pairs for each service
6. Generates random passwords for PostgreSQL, Redis, RabbitMQ
7. Generates Vault master key (256-bit) and token secret
8. Generates `INTERNAL_API_KEY` (64-byte random hex)
9. Generates `NEXTAUTH_SECRET` (64-byte random)
10. Creates `.env` file with all values
11. Builds all Docker images
12. Initializes PostgreSQL with schema
13. Seeds database (24 domains, 70+ cities, admin user)
14. Starts infrastructure (PostgreSQL, Redis, RabbitMQ)
15. Starts Vault, then core Beckn services
16. Starts admin panel and agent services
17. Verifies all health endpoints

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--production` | `false` | Enable persistent volumes, restart policies, memory limits |
| `--domain <domain>` | `ondc.dmj.one` | Set the network domain |
| `--admin-email <email>` | `admin@ondc.dmj.one` | Admin login email |
| `--admin-password <pass>` | Auto-generated | Admin password |
| `--no-seed` | `false` | Skip database seeding |
| `--k8s` | — | Deploy via Kubernetes instead of Docker Compose |
| `--docker` | — | Deploy via Docker Compose (default) |
| `--vm` | — | Deploy directly on the VM (no containers) |
| `--gke-project <id>` | — | GCP project ID (creates GKE cluster) |
| `--gke-cluster <name>` | `ondc-cluster` | GKE cluster name |
| `--gke-zone <zone>` | `us-central1-a` | GKE zone |
| `--repo <url>` | GitHub repo | Override repository URL |
| `--deploy-dir <path>` | `/opt/ondc` | Override deployment directory |
| `-h, --help` | — | Show help |

---

## Kubernetes Deployment

### Quick Deploy to GKE

```bash
# One-command deployment on a Google Cloud VM
sudo bash autoconfig.sh \
  --k8s \
  --production \
  --domain ondc.dmj.one \
  --gke-project my-gcp-project \
  --gke-zone us-central1-a
```

This will:
1. Install kubectl, Helm, and gcloud CLI
2. Create a GKE cluster (3 nodes, e2-standard-4, autoscaling 2-10)
3. Install nginx-ingress-controller and cert-manager
4. Deploy all 16 services with proper sequencing
5. Initialize database, seed vault secrets, and verify health

### Standalone K8s Script

If you already have secrets generated (e.g., from a previous `autoconfig.sh` run):

```bash
# Export secrets from .env
set -a && source .env && set +a

# Run K8s deployment directly
bash autoconfig-k8s.sh --gke-project my-project --gke-zone us-central1-a
```

### Local Development (minikube/kind)

```bash
# Start a local cluster
kind create cluster --name ondc

# Deploy in dev mode (lower resources, simulation services included)
sudo bash autoconfig.sh --k8s --dev
```

### K8s Architecture

```
Namespace: ondc-infra         Namespace: ondc                Namespace: ondc-simulation
┌──────────────────┐          ┌──────────────────────┐       ┌─────────────────────┐
│ PostgreSQL (SS)  │◄────────►│ vault (Deploy)       │       │ simulation-engine   │
│ Redis (SS)       │◄────────►│ registry (Deploy x2) │       │ mock-server         │
│ RabbitMQ (SS)    │◄────────►│ gateway (Deploy x2)  │       └─────────────────────┘
└──────────────────┘          │ bap (Deploy x2)      │             (dev only)
                              │ bpp (Deploy x2)      │
                              │ admin (Deploy)       │
                              │ docs (Deploy)        │
                              │ orchestrator (Deploy)│
                              │ health-monitor       │
                              │ log-aggregator       │
                              └──────────────────────┘
                                       ▲
                              ┌────────┴────────┐
                              │  nginx-ingress  │
                              │  cert-manager   │
                              └─────────────────┘
```

**Key differences from Docker Compose:**
- Infrastructure runs as **StatefulSets** with PVCs
- Application services run as **Deployments** with HPA (auto-scaling)
- The orchestrator uses **K8s API** (ServiceAccount + RBAC) instead of Docker socket
- Ingress replaces nginx reverse proxy
- cert-manager handles TLS instead of manual Certbot

### K8s Manifest Structure

```
k8s/
├── base/                    # Base manifests (shared)
│   ├── infra/              # StatefulSets: postgres, redis, rabbitmq
│   ├── core/               # Deployments: vault, registry, gateway, bap, bpp, admin, docs
│   ├── agents/             # Deployments: orchestrator (+ RBAC), health-monitor, log-aggregator
│   ├── config/             # ConfigMaps: platform-config, service-urls
│   ├── secrets/            # Secret templates (values injected by generate-secrets.sh)
│   ├── jobs/               # db-init, db-seed, vault-seed Jobs
│   ├── ingress/            # Ingress rules + cert-manager issuer
│   ├── network-policies/   # Default deny + allow rules
│   └── hpa/                # HPA for registry, gateway, bap, bpp
└── overlays/
    ├── dev/                # Development: 1 replica, lower resources, simulation services
    └── prod/               # Production: higher replicas, PDBs, larger PVCs
```

### K8s Rolling Updates

```bash
# Update all services to a specific image tag
bash scripts/deploy.sh k8s --tag v1.2.3

# Or use kubectl directly
kubectl set image deployment/registry registry=ghcr.io/divyamohan1993/ondc-registry:v1.2.3 -n ondc
kubectl rollout status deployment/registry -n ondc
```

### K8s Teardown

```bash
# Soft: scale deployments to 0 (keep data)
bash scripts/k8s-helpers/teardown-k8s.sh soft

# Hard: delete all deployments and statefulsets
bash scripts/k8s-helpers/teardown-k8s.sh hard

# Full: delete all namespaces (DESTROYS EVERYTHING)
bash scripts/k8s-helpers/teardown-k8s.sh full -y

# Reset: wipe DB, re-run init.sql, restart services
bash scripts/k8s-helpers/teardown-k8s.sh reset
```

### CI/CD for K8s

The `.github/workflows/k8s-deploy.yml` workflow supports manual dispatch:

```bash
# Via GitHub CLI
gh workflow run k8s-deploy.yml -f environment=staging -f image_tag=latest
gh workflow run k8s-deploy.yml -f environment=production -f image_tag=v1.2.3
```

Required GitHub secrets: `GKE_SA_KEY` (GCP service account JSON key)
Required GitHub vars: `GKE_CLUSTER_NAME`, `GKE_ZONE`

---

## Manual Deploy

If you prefer manual control:

### 1. Clone and Configure

```bash
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn

# Copy environment template
cp .env.example .env
```

### 2. Generate Secrets

```bash
# Generate Ed25519 key pairs (for each service)
openssl genpkey -algorithm Ed25519 -outform DER | openssl pkey -outform DER | base64

# Generate random passwords
openssl rand -hex 32

# Generate Vault master key
openssl rand -hex 32

# Generate NEXTAUTH_SECRET
openssl rand -hex 64
```

Edit `.env` and fill in all `# AUTO-GENERATED` fields.

### 3. Build and Start

```bash
# Build all images
docker compose build

# Start infrastructure first
docker compose up -d postgres redis rabbitmq

# Wait for health checks
docker compose exec postgres pg_isready -U ondc_admin -d ondc

# Start vault (depends on infra)
docker compose up -d vault

# Start everything else
docker compose up -d
```

### 4. Verify

```bash
# Check all services
docker compose ps

# Check health endpoints
curl http://localhost:3001/health  # Registry
curl http://localhost:3002/health  # Gateway
curl http://localhost:3003         # Admin
curl http://localhost:3004/health  # BAP
curl http://localhost:3005/health  # BPP
curl http://localhost:3006/health  # Vault
```

---

## Production Configuration

### Enable Production Mode

Use the production overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This enables:
- **Persistent volumes** for PostgreSQL, Redis, and RabbitMQ
- **Restart policies** (`always`) for all services
- **Memory limits** (1GB Postgres, 512MB Redis/RabbitMQ, 256MB Vault)
- **Simulation services disabled**

### Environment Variables

Set in `.env`:

```bash
PRODUCTION_MODE=true
DOMAIN=ondc.dmj.one

# Tune for your workload
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60
MAX_RESPONSE_TIME_MS=30000
HEALTH_CHECK_INTERVAL_MS=15000
LOG_RETENTION_DAYS=30

# Rotation schedules
PASSWORD_ROTATION_INTERVAL_HOURS=24
SIGNING_KEY_ROTATION_INTERVAL_DAYS=30
```

---

## SSL/TLS Setup

The included Nginx config listens on port 80. For production, add SSL:

### Option A: Certbot (Let's Encrypt)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificates for all subdomains
sudo certbot --nginx \
  -d ondc.dmj.one \
  -d registry.ondc.dmj.one \
  -d gateway.ondc.dmj.one \
  -d admin.ondc.dmj.one \
  -d bap.ondc.dmj.one \
  -d bpp.ondc.dmj.one

# Auto-renewal
sudo certbot renew --dry-run
```

### Option B: Reverse Proxy (Cloudflare/AWS ALB)

Place a TLS-terminating load balancer in front of Nginx:

```
Client → Cloudflare/ALB (TLS) → Nginx :80 → Services
```

Update `NEXTAUTH_URL` in `.env` to use `https://`:
```bash
NEXTAUTH_URL=https://admin.ondc.dmj.one
```

---

## DNS Configuration

Point these subdomains to your server's IP:

| Record | Type | Value |
|--------|------|-------|
| `ondc.dmj.one` | A | `<server-ip>` |
| `registry.ondc.dmj.one` | A | `<server-ip>` |
| `gateway.ondc.dmj.one` | A | `<server-ip>` |
| `admin.ondc.dmj.one` | A | `<server-ip>` |
| `bap.ondc.dmj.one` | A | `<server-ip>` |
| `bpp.ondc.dmj.one` | A | `<server-ip>` |

Or use a wildcard:

| Record | Type | Value |
|--------|------|-------|
| `ondc.dmj.one` | A | `<server-ip>` |
| `*.ondc.dmj.one` | A | `<server-ip>` |

Then update `nginx/nginx.conf` — replace all instances of `ondc.dmj.one` with your domain.

---

## Scaling

### Horizontal Scaling

For high-traffic deployments, run multiple instances behind a load balancer:

```bash
# Scale specific services
docker compose up -d --scale bap=3 --scale bpp=3 --scale gateway=2
```

Update the Nginx upstream blocks:

```nginx
upstream bap {
    server bap-1:3004;
    server bap-2:3004;
    server bap-3:3004;
}
```

### Database Scaling

- **Read replicas:** Add PostgreSQL streaming replicas for read-heavy workloads
- **Connection pooling:** Use PgBouncer between services and PostgreSQL
- **Redis Cluster:** For high-throughput rate limiting and caching

---

## Backup & Recovery

### Database Backup

```bash
# Manual backup
docker compose exec postgres pg_dump -U ondc_admin ondc > backup-$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U ondc_admin ondc < backup-20240101.sql
```

### Automated Backups

Add a cron job:

```bash
# Daily backups at 2 AM, keep 30 days
0 2 * * * docker compose -f /path/to/docker-compose.yml exec -T postgres pg_dump -U ondc_admin ondc | gzip > /backups/ondc-$(date +\%Y\%m\%d).sql.gz && find /backups -name "ondc-*.sql.gz" -mtime +30 -delete
```

### Volume Backup

```bash
# Stop services, backup volumes
docker compose stop
docker run --rm -v ondc-network-beckn_pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata.tar.gz -C /data .
docker compose start
```

---

## Monitoring

### Built-in Health Monitor

The Health Monitor service checks all services every 15 seconds and generates alerts:

- **INFO** — Service healthy
- **WARNING** — Response time > 5 seconds
- **CRITICAL** — Service unreachable

View alerts in the Admin Dashboard → Alerts page.

### Log Explorer

The Log Aggregator collects structured logs from all services:

- View in Admin Dashboard → Logs Explorer
- Filter by service, level, timestamp
- Retention: 30 days (configurable via `LOG_RETENTION_DAYS`)

### External Monitoring (Optional)

Export health data to external systems:

```bash
# Prometheus-style health check
curl -s http://localhost:3008/status | jq .

# Individual service health
curl -s http://localhost:3001/health  # Registry
curl -s http://localhost:3002/health  # Gateway
curl -s http://localhost:3004/health  # BAP
curl -s http://localhost:3005/health  # BPP
```

---

## CI/CD Pipeline

### Automatic Builds (GitHub Actions)

Every push to `main` triggers two workflows:

1. **CI** (`.github/workflows/ci.yml`) — Installs dependencies, builds all packages, runs tests
2. **Docker Build & Push** (`.github/workflows/docker.yml`) — Builds Docker images for changed services and pushes to GitHub Container Registry (GHCR)

Only services with actual code changes are rebuilt, thanks to smart change detection via `dorny/paths-filter`. Changes to the shared package trigger rebuilds for all dependent services.

Images are tagged with: commit SHA, branch name, semver (for tags), and `:latest` (for main branch).

### Automatic Deployment (Watchtower)

Servers provisioned with `setup-server.sh` include [Watchtower](https://containrrr.dev/watchtower/), which:

- Polls GHCR every 5 minutes for new `:latest` images
- Pulls updated images and restarts containers with rolling restart
- Scoped to only manage ONDC containers (via `com.centurylinklabs.watchtower.scope: ondc`)
- Cleans up old images automatically

**The complete deployment flow:**

```
git push → GitHub Actions builds images → pushes to GHCR → Watchtower detects new images → pulls & restarts
```

No SSH keys, no deployment secrets, no manual intervention needed.

### Server Provisioning

Set up any fresh Ubuntu server with one command:

```bash
# Option A: Pipe from GitHub
curl -fsSL https://raw.githubusercontent.com/divyamohan1993/ondc-network-beckn/main/scripts/setup-server.sh | sudo bash

# Option B: After cloning
sudo bash scripts/setup-server.sh --domain ondc.dmj.one --production
```

The `setup-server.sh` script:
1. Installs Docker Engine + Compose plugin
2. Clones the repository to `/opt/ondc`
3. Runs `autoconfig.sh` to generate `.env` with all secrets
4. Logs into GHCR (optional, for private images)
5. Pulls pre-built images and starts all services
6. Sets up Watchtower for automatic image updates
7. Installs a systemd timer that syncs config from git every 10 minutes

### Manual Deploy Script

For immediate deployments (instead of waiting for Watchtower):

```bash
cd /opt/ondc && bash scripts/deploy.sh [--tag <image-tag>]
```

This pulls the latest compose/nginx/DB config from git, pulls new images, restarts services, waits for health checks, and prunes old images.

---

## Troubleshooting

### Services Won't Start

```bash
# Check which services are running
docker compose ps

# Check service logs
docker compose logs <service-name>
docker compose logs --tail 50 registry

# Check if dependencies are healthy
docker compose exec postgres pg_isready -U ondc_admin -d ondc
docker compose exec redis redis-cli -a $REDIS_PASSWORD ping
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker compose logs postgres

# Verify the database exists
docker compose exec postgres psql -U ondc_admin -d ondc -c "SELECT 1"

# Re-run init script
docker compose exec -T postgres psql -U ondc_admin -d ondc < db/init.sql
```

### Port Conflicts

If ports are already in use:

```bash
# Find what's using a port
sudo lsof -i :3001

# Change ports in .env
REGISTRY_PORT=3101
```

### Reset Everything

```bash
# Nuclear option — stops everything, removes data
sudo bash teardown.sh --full -y

# Redeploy
sudo bash autoconfig.sh
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED` | Service not ready | Wait for health checks, check `depends_on` |
| `FATAL: password authentication failed` | Wrong DB password | Check `.env` matches `docker-compose.yml` |
| `NACK` responses | Signature verification failed | Regenerate keys, ensure clock sync |
| Admin login fails | Wrong credentials | Check `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` |
| Vault errors | Master key mismatch | Ensure `VAULT_MASTER_KEY` hasn't changed between deploys |

---

---

<p align="center">
  <sub>Part of the <a href="https://dmj.one">dmj.one</a> ONDC Network initiative.</sub>
</p>

*For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md). For the full configuration reference, see [.env.example](.env.example).*
