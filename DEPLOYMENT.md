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
| OS | Ubuntu 22.04+ | Tested on 24.04 LTS |
| Node.js | 22 LTS | Required |
| pnpm | 10+ | Required |
| PM2 | latest | Process manager (recommended) |
| PostgreSQL | 16 | Native install via apt |
| Redis | 7 | Native install via apt |
| RabbitMQ | 3.13 | Native install via apt |
| nginx | latest | Reverse proxy |
| Docker | 24.0+ | Optional (alternative to PM2) |

---

## Direct VM Deployment (Recommended)

The production instance at ondc.dmj.one runs natively on a GCloud VM with PM2. No Docker.

### Prerequisites

- Ubuntu 22.04+ (tested on 24.04 LTS)
- 4 vCPU, 16GB RAM minimum (GCloud e2-standard-4)
- 50GB disk
- Domain with DNS pointing to the VM

### 1. Create the VM (GCloud)

```bash
gcloud compute instances create ondc-demo \
  --zone=asia-south1-b \
  --machine-type=e2-standard-4 \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --tags=http-server,https-server
```

Allow HTTP/HTTPS traffic:

```bash
gcloud compute firewall-rules create allow-http --allow tcp:80 --target-tags http-server
gcloud compute firewall-rules create allow-https --allow tcp:443 --target-tags https-server
```

### 2. Install System Dependencies

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL, Redis, RabbitMQ, nginx
sudo apt-get install -y postgresql redis-server rabbitmq-server nginx

# pnpm and PM2
sudo npm install -g pnpm@10.30.1 pm2
```

### 3. Clone and Configure

```bash
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn
./autoconfig.sh --domain your-domain.com
```

The script generates all Ed25519 key pairs, random passwords, vault master key, and writes `.env`.

### 4. Setup PostgreSQL

```bash
sudo -u postgres createuser -s ondc_admin
sudo -u postgres createdb ondc -O ondc_admin
sudo -u postgres psql -d ondc -f db/init.sql
```

### 5. Setup RabbitMQ

```bash
sudo rabbitmqctl add_user ondc "$(grep RABBITMQ_PASSWORD .env | cut -d= -f2)"
sudo rabbitmqctl set_permissions -p / ondc ".*" ".*" ".*"
sudo rabbitmqctl set_user_tags ondc administrator
```

### 6. Install, Build, Start

```bash
pnpm install
pnpm turbo build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### 7. Configure nginx

Create `/etc/nginx/sites-available/ondc`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3012;  # buyer-app
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /seller {
        proxy_pass http://127.0.0.1:3013;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /admin {
        proxy_pass http://127.0.0.1:3014;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /pitch {
        proxy_pass http://127.0.0.1:3015/pitch;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /docs {
        proxy_pass http://127.0.0.1:3015/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /registry/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /gateway/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/bap/ {
        proxy_pass http://127.0.0.1:3003/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/bpp/ {
        proxy_pass http://127.0.0.1:3004/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/ondc /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 8. Cloudflare DNS Setup

1. Add an **A record** for `your-domain.com` pointing to the VM's external IP
2. Set proxy status to **Proxied** (orange cloud) for free SSL termination
3. In SSL/TLS settings, set mode to **Full** (not Full Strict, since the origin uses HTTP)
4. Wildcard subdomains require a paid plan. Use path-based routing instead (already configured above)

If not using Cloudflare, use Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 9. Seed Pincode Database

```bash
pnpm seed:pincodes
```

### 10. Enable PM2 Auto-Start on Reboot

```bash
pm2 save
pm2 startup
# Run the command PM2 prints (it needs sudo)
```

### Port Mapping

| Service | Port | Path |
|---------|------|------|
| Buyer App | 3012 | `/` |
| Seller App | 3013 | `/seller` |
| Admin | 3014 | `/admin` |
| Docs/Pitch | 3015 | `/docs`, `/pitch` |
| Registry | 3001 | `/registry/` |
| Gateway | 3002 | `/gateway/` |
| BAP | 3003 | `/api/bap/` |
| BPP | 3004 | `/api/bpp/` |
| Vault | 3006 | (internal) |
| Health Monitor | 3007 | (internal) |

### PM2 Monitoring

```bash
pm2 status          # Service status
pm2 logs            # All logs
pm2 logs bap        # Service-specific logs
pm2 monit           # Real-time dashboard
pm2 reload all      # Zero-downtime restart
```

### Backup (Native PostgreSQL)

```bash
# Backup
sudo -u postgres pg_dump ondc > backup-$(date +%Y%m%d).sql

# Restore
sudo -u postgres psql ondc < backup-20260101.sql
```

### Troubleshooting (PM2)

| Issue | Fix |
|-------|-----|
| Service crashed | `pm2 logs <name>` to check, `pm2 restart <name>` to recover |
| All services down | `pm2 resurrect` (restores saved process list) |
| Port conflict | `ss -tlnp \| grep <port>` to find the conflicting process |
| DB connection refused | `sudo systemctl status postgresql` |
| Redis down | `sudo systemctl status redis-server` |
| RabbitMQ down | `sudo systemctl status rabbitmq-server` |

---

## Docker Compose Deploy

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

### Option A: Cloudflare (Recommended, used in production)

The production deployment uses Cloudflare's free plan for SSL termination:

```
Client --> Cloudflare (TLS termination) --> nginx :80 --> PM2 services
```

1. Add your domain to Cloudflare (free plan)
2. Set an A record pointing to your VM's IP with proxy status **Proxied** (orange cloud)
3. In SSL/TLS settings, set encryption mode to **Full**
4. All services share one domain with path-based routing (no subdomains needed)

Update `.env`:
```bash
NEXTAUTH_URL=https://your-domain.com/admin
```

### Option B: Let's Encrypt (Certbot)

For direct SSL without Cloudflare:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

### Kubernetes

cert-manager handles TLS automatically. Configured in `k8s/base/ingress/`.

---

## DNS Configuration

### Path-Based Routing (Recommended, Cloudflare Free Plan)

With path-based routing via nginx, you only need one DNS record:

| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| `your-domain.com` | A | `<server-ip>` | Proxied (orange cloud) |

All services are accessed via paths (`/seller`, `/admin`, `/registry/`, etc.) on a single domain. This works with Cloudflare's free plan since wildcard DNS proxying requires a paid plan.

### Subdomain Routing (Alternative, requires Cloudflare paid plan or direct SSL)

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

### Database (Native PostgreSQL)

```bash
# Backup
sudo -u postgres pg_dump ondc > backup-$(date +%Y%m%d).sql

# Restore
sudo -u postgres psql ondc < backup-20260101.sql
```

### Automated Backups

```bash
# Cron: daily at 2 AM, keep 30 days
0 2 * * * sudo -u postgres pg_dump ondc | gzip > /backups/ondc-$(date +\%Y\%m\%d).sql.gz && find /backups -name "ondc-*.sql.gz" -mtime +30 -delete
```

### Database (Docker, if using Docker Compose)

```bash
docker compose exec postgres pg_dump -U ondc_admin ondc > backup-$(date +%Y%m%d).sql
docker compose exec -T postgres psql -U ondc_admin ondc < backup-20260101.sql
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

### Deploy with PM2 (Production)

```
git push --> GitHub Actions (CI) --> SSH to VM --> git pull && pnpm turbo build && pm2 reload all
```

Or manually on the VM:

```bash
cd /path/to/ondc-network-beckn
git pull
pnpm install
pnpm turbo build
pm2 reload all
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
| `ECONNREFUSED` | Service not ready | `pm2 status` to check, `pm2 restart <name>` to recover |
| `FATAL: password authentication failed` | Wrong DB password | Verify `.env` matches PostgreSQL config |
| `NACK` responses | Signature verification failed | Regenerate keys, check clock sync |
| Admin login fails | Wrong credentials | Check `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` |
| Vault errors | Master key mismatch | `VAULT_MASTER_KEY` must not change between deploys |
| Service keeps crashing | Check crash logs | `pm2 logs <name>` for details |

### PM2 Deployment

```bash
# Check service status
pm2 status

# Check service logs
pm2 logs --lines 50 <service-name>

# Check infrastructure
sudo systemctl status postgresql
sudo systemctl status redis-server
sudo systemctl status rabbitmq-server

# Full reset
pm2 delete all
sudo -u postgres dropdb ondc
sudo -u postgres createdb ondc -O ondc_admin
sudo -u postgres psql -d ondc -f db/init.sql
pm2 start ecosystem.config.cjs
```

### Docker Deployment

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
