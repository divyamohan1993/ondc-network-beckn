# Deployment Guide

---

## Requirements

### Hardware

| Spec | Minimum | Recommended |
|------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 10 GB | 50+ GB (logs/data) |
| Network | Public IP | Static IP + domain |

### Software

| Software | Version | Notes |
|----------|---------|-------|
| OS | Ubuntu 22.04+ | Any Linux with Docker works |
| Docker | 24.0+ | With Compose V2 |
| Node.js | 22 LTS | Only for local dev |
| pnpm | 10+ | Only for local dev |

---

## Quick Deploy (Docker Compose)

### Automated

```bash
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn

# Development
sudo bash autoconfig.sh --domain your-domain.com

# Production (persistent volumes, restart policies, memory limits, Prometheus + Grafana)
sudo bash autoconfig.sh --production --domain your-domain.com --admin-email admin@example.com
```

The script:
1. Installs Docker, Node.js 22, pnpm if missing
2. Generates Ed25519 signing key pairs for each service
3. Generates random passwords for PostgreSQL, Redis, RabbitMQ
4. Generates Vault master key, token secret, internal API key, NextAuth secret
5. Creates `.env` with all values
6. Builds all Docker images
7. Initializes PostgreSQL schema, seeds 24 domains + 70+ cities + admin user
8. Starts all services in dependency order
9. Verifies all health endpoints

### autoconfig.sh Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--production` | `false` | Enable persistent volumes, restart policies, memory limits, monitoring |
| `--domain <domain>` | `ondc.dmj.one` | Network domain |
| `--admin-email <email>` | `admin@ondc.dmj.one` | Admin login email |
| `--admin-password <pass>` | Auto-generated | Admin password (printed to stdout if generated) |
| `--no-seed` | `false` | Skip database seeding |
| `--k8s` | -- | Deploy via Kubernetes instead |
| `--gke-project <id>` | -- | GCP project ID for GKE cluster |

### Seed Scripts

After deployment, seed additional data:

```bash
# India pincode database (for address lookup in buyer/seller apps)
pnpm seed:pincodes

# Pramaan certification log export
pnpm export:pramaan
```

---

## Manual Deploy

### 1. Configure

```bash
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn
cp .env.example .env
```

Edit `.env` and fill in all `# AUTO-GENERATED` fields. See the 269-line `.env.example` for the full reference of all configuration variables.

### 2. Generate Secrets

```bash
# Ed25519 key pairs
openssl genpkey -algorithm Ed25519 -outform DER | openssl pkey -outform DER | base64

# Random passwords / tokens
openssl rand -hex 32

# Vault master key
openssl rand -hex 32

# NEXTAUTH_SECRET
openssl rand -hex 64
```

### 3. Build and Start

```bash
docker compose build

# Start infrastructure first
docker compose up -d postgres redis rabbitmq
docker compose exec postgres pg_isready -U ondc_admin -d ondc

# Start vault, then everything else
docker compose up -d vault
docker compose up -d
```

### 4. Verify

```bash
docker compose ps
curl http://localhost:3001/health  # Registry
curl http://localhost:3002/health  # Gateway
curl http://localhost:3004/health  # BAP
curl http://localhost:3005/health  # BPP
curl http://localhost:3006/health  # Vault
```

---

## Production Configuration

### Enable Production Mode

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This adds:
- **Persistent volumes** for PostgreSQL, Redis, RabbitMQ, Prometheus, Grafana
- **Restart policies** (`always`) for all services
- **Memory limits** (1 GB PostgreSQL, 512 MB Redis/RabbitMQ, 256 MB Vault)
- **Prometheus + Grafana** monitoring stack
- **Simulation services disabled**

### Key Environment Variables

```bash
PRODUCTION_MODE=true
DOMAIN=your-domain.com

# Tuning
RATE_LIMIT_MAX=100              # Max requests per subscriber per window
RATE_LIMIT_WINDOW=60            # Rate limit window (seconds)
MAX_RESPONSE_TIME_MS=30000      # SLA timeout
HEALTH_CHECK_INTERVAL_MS=15000  # Health poll frequency
LOG_RETENTION_DAYS=30           # Log retention

# Rotation
PASSWORD_ROTATION_INTERVAL_HOURS=24
SIGNING_KEY_ROTATION_INTERVAL_DAYS=30

# Post-quantum (opt-in)
PQ_CRYPTO_ENABLED=false         # Set true to enable ML-DSA-65 + ML-KEM-768

# External services (require credentials)
RAZORPAY_KEY_ID=                # Payment gateway
RAZORPAY_KEY_SECRET=
SMS_PROVIDER_API_KEY=           # SMS notifications
PUSH_NOTIFICATION_KEY=          # Push notifications
```

Full reference: [.env.example](.env.example) (269 variables).

---

## SSL/TLS Setup

### Option A: Let's Encrypt (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx \
  -d your-domain.com \
  -d registry.your-domain.com \
  -d gateway.your-domain.com \
  -d admin.your-domain.com \
  -d bap.your-domain.com \
  -d bpp.your-domain.com \
  -d shop.your-domain.com \
  -d seller.your-domain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

### Option B: Reverse Proxy (Cloudflare/AWS ALB)

TLS-terminating load balancer in front of Nginx:

```
Client --> Cloudflare/ALB (TLS) --> Nginx :80 --> Services
```

Update `.env`:
```bash
NEXTAUTH_URL=https://admin.your-domain.com
```

### Kubernetes

cert-manager handles TLS automatically. Configured in `k8s/base/ingress/`.

---

## DNS Configuration

Point subdomains to your server IP:

| Record | Type | Value |
|--------|------|-------|
| `your-domain.com` | A | `<server-ip>` |
| `*.your-domain.com` | A | `<server-ip>` |

Or individual A records for: `registry.`, `gateway.`, `admin.`, `bap.`, `bpp.`, `shop.`, `seller.`

---

## Monitoring Setup

### Built-in (Always Active)

- **Health Monitor** -- polls all services every 15 seconds, generates INFO/WARNING/CRITICAL alerts
- **Log Aggregator** -- collects structured logs, 30-day retention, filterable in Admin Dashboard
- **Metrics Collector** -- in-memory per-action latency percentiles (p50/p95/p99), error rates, SLA compliance

### Prometheus + Grafana (Production)

Included in `docker-compose.prod.yml`. Configuration files:

- `monitoring/prometheus.yml` -- scrape targets and intervals
- `monitoring/alerts.yml` -- alerting rules

```bash
# Start with monitoring
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Access
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3100 (default admin/admin)
```

Services expose metrics at `/metrics` in Prometheus text format via `MetricsCollector.toPrometheus()`.

### Health Check Endpoints

Every service exposes `GET /health`:

```json
{
  "status": "healthy",
  "service": "registry",
  "uptime": 86400,
  "version": "1.0.0",
  "checks": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

## Backup & Recovery

### Database

```bash
# Backup
docker compose exec postgres pg_dump -U ondc_admin ondc > backup-$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U ondc_admin ondc < backup-20260101.sql
```

### Automated Backups

```bash
# Cron: daily at 2 AM, keep 30 days
0 2 * * * docker compose -f /path/to/docker-compose.yml exec -T postgres pg_dump -U ondc_admin ondc | gzip > /backups/ondc-$(date +\%Y\%m\%d).sql.gz && find /backups -name "ondc-*.sql.gz" -mtime +30 -delete
```

### Volume Backup

```bash
docker compose stop
docker run --rm -v ondc-network-beckn_pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata.tar.gz -C /data .
docker compose start
```

---

## Kubernetes Deployment

### GKE Quick Deploy

```bash
sudo bash autoconfig.sh \
  --k8s \
  --production \
  --domain your-domain.com \
  --gke-project my-gcp-project \
  --gke-zone asia-south1-a
```

Creates a 3-node GKE cluster with nginx-ingress, cert-manager, and all services.

### Architecture

- Infrastructure: StatefulSets with PVCs (PostgreSQL, Redis, RabbitMQ)
- Applications: Deployments with HPA (auto-scaling)
- Orchestrator: uses K8s API via ServiceAccount + RBAC (no Docker socket)
- TLS: cert-manager (not Certbot)

### Manifest Structure

```
k8s/
+-- base/                    # Shared manifests
|   +-- infra/              # StatefulSets
|   +-- core/               # Deployments
|   +-- agents/             # Deployments + RBAC
|   +-- config/             # ConfigMaps
|   +-- secrets/            # Secret templates
|   +-- jobs/               # db-init, db-seed, vault-seed
|   +-- ingress/            # Ingress rules + cert-manager
|   +-- network-policies/   # Default deny + allow
|   +-- hpa/                # HPA for registry, gateway, bap, bpp
+-- overlays/
    +-- dev/                # 1 replica, simulation services
    +-- prod/               # Higher replicas, PDBs, larger PVCs
```

### K8s Teardown

```bash
bash scripts/k8s-helpers/teardown-k8s.sh soft   # Scale to 0, keep data
bash scripts/k8s-helpers/teardown-k8s.sh hard   # Delete deployments
bash scripts/k8s-helpers/teardown-k8s.sh full -y # Delete everything
bash scripts/k8s-helpers/teardown-k8s.sh reset  # Wipe DB, re-init
```

---

## CI/CD Pipeline

### Automatic Builds

Every push to `main`:

1. **CI** -- build + test (GitHub Actions)
2. **Docker Build** -- changed services built in parallel, pushed to GHCR

### Auto-Deploy (Watchtower)

Servers provisioned with `setup-server.sh` include Watchtower:

- Polls GHCR every 5 minutes
- Pulls new `:latest` images, rolling restart
- Scoped to ONDC containers only

```
git push --> GitHub Actions --> GHCR --> Watchtower --> running containers
```

### Server Provisioning

```bash
# One-command setup on fresh Ubuntu
curl -fsSL https://raw.githubusercontent.com/divyamohan1993/ondc-network-beckn/main/scripts/setup-server.sh | sudo bash
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED` | Service not ready | Wait for health checks, check `depends_on` |
| `FATAL: password authentication failed` | Wrong DB password | Verify `.env` matches compose |
| `NACK` responses | Signature verification failed | Regenerate keys, check clock sync |
| Admin login fails | Wrong credentials | Check `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` |
| Vault errors | Master key mismatch | `VAULT_MASTER_KEY` must not change between deploys |

```bash
# Check service logs
docker compose logs --tail 50 <service-name>

# Check database
docker compose exec postgres pg_isready -U ondc_admin -d ondc

# Full reset
sudo bash teardown.sh --full -y
sudo bash autoconfig.sh
```

---

*For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md). For the full configuration reference, see [.env.example](.env.example).*
