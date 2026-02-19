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
| Node.js | 20 LTS | Only needed for local dev |
| pnpm | 9.1.0+ | Only needed for local dev |
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
| `-h, --help` | — | Show help |

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
