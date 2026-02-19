# ONDC Platform — Self-Hosted Beckn Network

A complete, production-grade private Beckn network that is protocol-identical to India's government ONDC. Any application (water delivery, food, agriculture, logistics) can connect by changing env vars — zero code changes.

---

## Quick Start

```bash
# Clone and deploy (blank Ubuntu VM)
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-platform
sudo bash autoconfig.sh

# Populate with realistic test data
sudo bash simulate.sh --baps 5 --bpps 20 --orders 500
```

That's it. You now have a fully running Beckn network.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Two Deployment Modes](#two-deployment-modes)
- [Services & URLs](#services--urls)
- [Controlling the Platform](#controlling-the-platform)
- [Simulation](#simulation)
- [Connecting Your App](#connecting-your-app)
- [Admin Dashboard](#admin-dashboard)
- [Configuration Reference](#configuration-reference)
- [Shell Scripts Reference](#shell-scripts-reference)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Switching to Government ONDC](#switching-to-government-ondc)

---

## Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| OS | Ubuntu 22.04 / 24.04 | Ubuntu 24.04 LTS |
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB |
| Ports | 80, 3000-3010, 5432, 5672, 6379 | Same |

The `autoconfig.sh` script installs everything else: Docker, Node.js, pnpm.

---

## Installation

### Option A: Automated (Recommended)

```bash
sudo bash autoconfig.sh
```

This runs 15 steps non-interactively:
1. Checks system requirements
2. Installs Docker, Node.js 20, pnpm
3. Generates `.env` from `.env.example`
4. Generates Ed25519 key pairs for all services
5. Generates random passwords for PostgreSQL, Redis, RabbitMQ
6. Generates admin credentials
7. Writes everything to `.env`
8. Configures Nginx subdomain routing
9. Builds all Docker images
10. Starts all containers
11. Waits for database to be ready
12. Runs database migrations (via `init.sql`)
13. Seeds database (admin user, domains, cities)
14. Health-checks all services
15. Prints summary with URLs and credentials

### Option B: Manual

```bash
# 1. Copy env file and fill in values
cp .env.example .env
# Edit .env with your values (see Configuration Reference below)

# 2. Build and start
docker compose build
docker compose up -d

# 3. Seed the database
pnpm install
pnpm --filter @ondc/scripts seed
```

---

## Two Deployment Modes

### Ephemeral (Development / Testing / Demos)

```bash
sudo bash autoconfig.sh
```

- No persistent volumes — destroy the VM when done, nothing to clean up
- Mock server enabled for simulation
- Perfect for: testing apps, hackathons, load testing, CI/CD

### Production

```bash
sudo bash autoconfig.sh --production --domain ondc.dmj.one
```

- PostgreSQL data persisted to Docker volume
- Daily automated backups at 2 AM to `/backups/`
- Redis and RabbitMQ data persisted
- `restart: always` on all containers
- Mock server disabled
- Stricter rate limits

**The only difference is the `--production` flag.** All code, APIs, and signing are identical.

---

## Services & URLs

After setup, these services are running:

| Service | Port | URL (default domain) | Purpose |
|---------|------|----------------------|---------|
| Docs Portal | 3000 | `http://ondc.dmj.one` | Landing page + developer documentation |
| Registry | 3001 | `http://registry.ondc.dmj.one` | Participant registration, key lookup |
| Gateway | 3002 | `http://gateway.ondc.dmj.one` | Search discovery fan-out |
| Admin Dashboard | 3003 | `http://admin.ondc.dmj.one` | Network governance UI |
| BAP Adapter | 3004 | `http://bap.ondc.dmj.one` | Buyer-side protocol adapter |
| BPP Adapter | 3005 | `http://bpp.ondc.dmj.one` | Seller-side protocol adapter |
| Mock Server | 3010 | (internal only) | Simulation backend |
| Nginx | 80 | Routes all subdomains | Reverse proxy |
| PostgreSQL | 5432 | (internal) | Database |
| Redis | 6379 | (internal) | Cache + pub/sub |
| RabbitMQ | 5672 | (internal) | Message queue |

> If you're running locally without DNS, access services directly via `http://localhost:<port>`.

---

## Controlling the Platform

### Start everything

```bash
# Development mode (with mock server for simulation)
docker compose --profile simulation up -d

# Production mode
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Stop everything

```bash
# Stop containers (keep data)
sudo bash teardown.sh

# Stop and delete all data
sudo bash teardown.sh --volumes

# Stop, delete data, and remove Docker images
sudo bash teardown.sh --full
```

### Restart a single service

```bash
docker compose restart registry    # Restart just the registry
docker compose restart gateway     # Restart just the gateway
docker compose restart admin       # Restart just the admin dashboard
```

### View logs

```bash
# All services
docker compose logs -f

# Single service
docker compose logs -f registry
docker compose logs -f gateway
docker compose logs -f admin

# Last 100 lines
docker compose logs --tail 100 registry
```

### Check service status

```bash
# See which containers are running
docker compose ps

# Health check all services
pnpm --filter @ondc/scripts health-check

# Or manually
curl http://localhost:3001/health   # Registry
curl http://localhost:3002/health   # Gateway
curl http://localhost:3003/health   # Admin (Next.js, no /health)
curl http://localhost:3004/health   # BAP
curl http://localhost:3005/health   # BPP
curl http://localhost:3000/health   # Docs
curl http://localhost:3010/health   # Mock Server
```

### Rebuild after code changes

```bash
docker compose build                 # Rebuild all images
docker compose up -d                 # Restart with new images
# Nginx keeps serving while containers restart — near-zero downtime
```

### Update from git

```bash
git pull
docker compose build
docker compose up -d
```

---

## Simulation

The simulation system generates fake-but-realistic Beckn traffic that is **indistinguishable from real traffic** at the protocol level.

### Generate test data

```bash
# Basic: 3 BAPs, 10 BPPs, 100 orders
sudo bash simulate.sh

# Custom: 5 BAPs, 20 BPPs, 500 orders
sudo bash simulate.sh --baps 5 --bpps 20 --orders 500

# Specific domains only
sudo bash simulate.sh --domains water,food --bpps 10 --orders 200

# Specific cities only
sudo bash simulate.sh --cities std:011,std:080 --orders 300
```

### Simulation flags

| Flag | Default | Description |
|------|---------|-------------|
| `--baps N` | 3 | Number of simulated buyer platforms |
| `--bpps N` | 10 | Number of simulated seller platforms |
| `--orders N` | 100 | Number of complete order flows |
| `--domains <list>` | all | Comma-separated: `water,food,agriculture,logistics` |
| `--cities <list>` | all | Comma-separated city codes: `std:011,std:080,std:022` |
| `--live` | false | Continuous mode — generates 1 order/second until stopped |
| `--reset` | false | Wipe all simulated data first |

### Live simulation (continuous traffic)

```bash
# Start continuous traffic generation
sudo bash simulate.sh --live

# Stop with Ctrl+C
```

### Reset simulated data

```bash
# Delete all simulated participants and transactions
sudo bash simulate.sh --reset

# Reset and repopulate
sudo bash simulate.sh --reset --bpps 50 --orders 2000
```

### What simulation creates

For each **BAP**: real Ed25519 key pair, registered in registry, realistic name like "FreshKart Delhi"

For each **BPP**: real key pair, registered in registry, catalog with 5-50 items per domain:
- Water: "20L Bisleri Can INR 80", "500L Tanker INR 1200"
- Food: "Chicken Biryani INR 250", "Masala Dosa INR 120"
- Agriculture: "Basmati Rice 25kg INR 1800", "Urea 50kg INR 600"
- Logistics: "Same-day Courier 5kg INR 150"

For each **order**: complete signed transaction chain (search -> select -> init -> confirm -> status -> track)

---

## Connecting Your App

### Step 1: Generate keys

```bash
pnpm --filter @ondc/scripts keygen -- --subscriber-id myapp.example.com --unique-key-id key-001
```

This outputs your signing and encryption key pairs.

### Step 2: Register with the network

```bash
curl -X POST https://registry.ondc.dmj.one/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "subscriber_id": "myapp.example.com",
    "subscriber_url": "https://myapp.example.com/beckn",
    "type": "BAP",
    "domain": "ONDC:NIC2004:49299",
    "city": "std:011",
    "signing_public_key": "<your-signing-public-key>",
    "encr_public_key": "<your-encr-public-key>",
    "unique_key_id": "key-001"
  }'
```

You'll receive an encrypted challenge. Decrypt it with your encryption private key.

### Step 3: Complete the challenge

```bash
curl -X POST https://registry.ondc.dmj.one/on_subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "subscriber_id": "myapp.example.com",
    "answer": "<decrypted-challenge>"
  }'
```

### Step 4: Set your app's env vars

```env
BECKN_REGISTRY_URL=https://registry.ondc.dmj.one
BECKN_GATEWAY_URL=https://gateway.ondc.dmj.one
BECKN_SUBSCRIBER_ID=myapp.example.com
BECKN_SUBSCRIBER_URL=https://myapp.example.com/beckn
BECKN_UNIQUE_KEY_ID=key-001
BECKN_SIGNING_PRIVATE_KEY=<your-signing-private-key>
BECKN_SIGNING_PUBLIC_KEY=<your-signing-public-key>
```

### Step 5: Start making API calls

Use the simplified BAP client API:

```bash
# Search for water delivery in Delhi
curl -X POST http://bap.ondc.dmj.one/api/search \
  -H "Content-Type: application/json" \
  -d '{ "domain": "ONDC:NIC2004:49299", "city": "std:011", "query": "water" }'
```

Or use the full Beckn protocol endpoints directly — the signing, packet structure, and flow are identical to government ONDC.

### Step 6 (optional): Register a webhook

```bash
curl -X POST http://bap.ondc.dmj.one/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://myapp.example.com/callbacks", "events": ["*"] }'
```

---

## Admin Dashboard

Access at `http://admin.ondc.dmj.one` (or `http://localhost:3003`).

Default credentials are printed by `autoconfig.sh` and saved to `.credentials`.

### Pages

| Page | What you can do |
|------|----------------|
| **Dashboard** | Network overview: BAP/BPP counts, transaction volume charts, recent transactions |
| **Participants** | List/filter/approve/suspend/revoke BAPs and BPPs |
| **Domains** | Create and manage network domains (water, food, agriculture, etc.) |
| **Transactions** | Search and inspect all Beckn transactions with full request/response JSON |
| **Analytics** | Charts: transactions by domain, conversion funnel, latency, top participants |
| **Health** | Live status of all services (auto-refreshes every 30s) |
| **Audit** | Immutable log of all registry lookups, approvals, key operations |
| **Keys** | View participant key IDs (keys are masked for security) |
| **Cities** | Manage city codes (Delhi std:011, Bangalore std:080, etc.) |
| **Policies** | Set network policies: max response time, rate limits, mandatory fields |
| **Simulation** | Start/stop simulations from the UI, reset simulated data |

### Roles

| Role | Access |
|------|--------|
| SUPER_ADMIN | Everything + simulation controls + key management |
| ADMIN | Manage participants, domains, cities, policies |
| VIEWER | Read-only access to all dashboards |

---

## Configuration Reference

All configuration is in `.env`. Key variables:

### Domain

| Variable | Default | Description |
|----------|---------|-------------|
| `DOMAIN` | `ondc.dmj.one` | Base domain for all subdomains |

### Database (PostgreSQL)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `postgres` | Hostname (Docker service name) |
| `POSTGRES_PORT` | `5432` | Port |
| `POSTGRES_DB` | `ondc` | Database name |
| `POSTGRES_USER` | `ondc_admin` | Username |
| `POSTGRES_PASSWORD` | (generated) | Password |

### Cache (Redis)

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `redis` | Hostname |
| `REDIS_PORT` | `6379` | Port |
| `REDIS_PASSWORD` | (generated) | Password |

### Message Queue (RabbitMQ)

| Variable | Default | Description |
|----------|---------|-------------|
| `RABBITMQ_HOST` | `rabbitmq` | Hostname |
| `RABBITMQ_PORT` | `5672` | Port |
| `RABBITMQ_USER` | `ondc` | Username |
| `RABBITMQ_PASSWORD` | (generated) | Password |

### Service Keys

Each service (REGISTRY, GATEWAY, BAP, BPP) has:

| Variable pattern | Description |
|-----------------|-------------|
| `{SERVICE}_SIGNING_PRIVATE_KEY` | Ed25519 private key (base64) |
| `{SERVICE}_SIGNING_PUBLIC_KEY` | Ed25519 public key (base64) |
| `{SERVICE}_UNIQUE_KEY_ID` | Key identifier |
| `{SERVICE}_SUBSCRIBER_ID` | Subscriber ID in the registry |

### Admin

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_EMAIL` | `admin@ondc.dmj.one` | Admin login email |
| `ADMIN_PASSWORD` | (generated) | Admin login password |
| `NEXTAUTH_SECRET` | (generated) | JWT signing secret |

### Network Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `BECKN_CORE_VERSION` | `1.1.0` | Beckn protocol version |
| `BECKN_COUNTRY` | `IND` | Country code |
| `DEFAULT_CITY` | `std:011` | Default city (Delhi) |
| `MAX_RESPONSE_TIME_MS` | `30000` | Max response timeout |
| `SIGNATURE_TTL_SECONDS` | `300` | Signature validity (5 min) |
| `PRODUCTION_MODE` | `false` | Enable production features |

---

## Shell Scripts Reference

### autoconfig.sh

```bash
sudo bash autoconfig.sh [flags]
```

| Flag | Description |
|------|-------------|
| `--production` | Enable persistent volumes, backups, restart policies |
| `--domain <domain>` | Set base domain (default: `ondc.dmj.one`) |
| `--admin-email <email>` | Admin email (default: `admin@ondc.dmj.one`) |
| `--admin-password <pw>` | Admin password (auto-generated if omitted) |
| `--no-seed` | Skip database seeding (empty database) |
| `-h` / `--help` | Show help |

### simulate.sh

```bash
sudo bash simulate.sh [flags]
```

See [Simulation](#simulation) section above for all flags.

### teardown.sh

```bash
sudo bash teardown.sh [flags]
```

| Flag | Description |
|------|-------------|
| (none) | Stop containers, keep volumes (data preserved) |
| `--volumes` | Stop containers AND delete all data volumes |
| `--full` | Delete everything: containers, volumes, images |
| `-y` / `--yes` | Skip confirmation prompts |

---

## Troubleshooting

### Services won't start

```bash
# Check which containers are running
docker compose ps

# Check logs for errors
docker compose logs registry
docker compose logs gateway

# Check if ports are in use
ss -tlnp | grep -E '(3001|3002|3003|3004|3005|3000|5432|6379|5672)'
```

### Database connection errors

```bash
# Check if PostgreSQL is healthy
docker compose exec postgres pg_isready

# Check database exists
docker compose exec postgres psql -U ondc_admin -d ondc -c '\dt'

# Re-run init.sql manually
docker compose exec postgres psql -U ondc_admin -d ondc -f /docker-entrypoint-initdb.d/init.sql
```

### Registry /subscribe returns errors

- Ensure the registry container is running: `docker compose ps registry`
- Check that `encr_public_key` is a valid X25519 key (not Ed25519)
- Verify the subscriber_id is unique

### Gateway /search returns NACK

- Check that the BAP is registered and SUBSCRIBED in the registry
- Verify the Authorization header is correctly signed
- Check RabbitMQ is running: `docker compose ps rabbitmq`
- Verify there are BPPs registered for the requested domain+city

### Admin dashboard shows "Unauthorized"

- Default credentials are in `.credentials` file (created by autoconfig.sh)
- Check `NEXTAUTH_SECRET` is set in `.env`
- Try clearing browser cookies

### Simulation fails

- Ensure mock-server is running: `docker compose --profile simulation up -d mock-server`
- Check mock-server health: `curl http://localhost:3010/health`
- Verify all core services are healthy first

### Container keeps restarting

```bash
# Check the crash logs
docker compose logs --tail 50 <service-name>

# Common causes:
# - Database not ready yet (wait and retry)
# - Missing env vars (check .env)
# - Port conflict (another process using the port)
```

### Reset everything and start fresh

```bash
sudo bash teardown.sh --full --yes
sudo bash autoconfig.sh
```

---

## Architecture

```
                      +------------------------------------------+
                      |         VM (any cloud provider)          |
                      |                                          |
   Internet           |  +--------+                              |
   -------> Cloudflare|  | Nginx  |  Reverse Proxy               |
            (SSL/DNS) |  | :80    |  Routes by subdomain          |
                      |  +---+----+                              |
                      |      |                                   |
        +-------------+------+----------------------------+      |
        |             |      v                            |      |
        |  +-------+-------+-------+-------+-------+     |      |
        |  |registry|gateway| admin |  bap  |  bpp  |     |      |
        |  | :3001  | :3002 | :3003 | :3004 | :3005 |     |      |
        |  +-------+-------+-------+-------+-------+     |      |
        |  |  docs  | mock-server                   |     |      |
        |  | :3000  | :3010 (simulation only)       |     |      |
        |  +-------+-------------------------------+     |      |
        |             |                                   |      |
        |  +----------+-----------+-----------+          |      |
        |  | PostgreSQL | Redis   | RabbitMQ  |          |      |
        |  | :5432      | :6379   | :5672     |          |      |
        |  +------------+---------+-----------+          |      |
        |           Docker Compose Network                |      |
        +------------------------------------------------+      |
                      +------------------------------------------+
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict) |
| Runtime | Node.js 20 LTS |
| Monorepo | Turborepo + pnpm workspaces |
| Protocol Services | Fastify |
| Admin Dashboard | Next.js 14 (App Router) |
| Docs Portal | Next.js 14 |
| Database | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Cache | Redis 7 |
| Message Queue | RabbitMQ 3.13 |
| Crypto | @noble/ed25519 + blakejs |
| Auth | NextAuth.js |
| Reverse Proxy | Nginx |
| Containers | Docker + Docker Compose |
| SSL | Cloudflare (proxy mode) |

---

## Switching to Government ONDC

When you're ready to move from this private network to the real government ONDC, your app only changes env vars:

**Your private network:**
```env
BECKN_REGISTRY_URL=https://registry.ondc.dmj.one
BECKN_GATEWAY_URL=https://gateway.ondc.dmj.one
BECKN_SUBSCRIBER_ID=myapp.dmj.one
BECKN_SUBSCRIBER_URL=https://bap.myapp.dmj.one/beckn
BECKN_UNIQUE_KEY_ID=key-abc-123
BECKN_SIGNING_PRIVATE_KEY=<generated-during-registration>
BECKN_SIGNING_PUBLIC_KEY=<generated-during-registration>
```

**Government ONDC (swap only these):**
```env
BECKN_REGISTRY_URL=https://prod.registry.ondc.org
BECKN_GATEWAY_URL=https://prod.gateway.ondc.org
BECKN_SUBSCRIBER_ID=<govt-issued>
BECKN_SUBSCRIBER_URL=<your-production-url>
BECKN_UNIQUE_KEY_ID=<govt-issued>
BECKN_SIGNING_PRIVATE_KEY=<govt-registered-key>
BECKN_SIGNING_PUBLIC_KEY=<govt-registered-key>
```

**Zero code changes.** Same signing, same APIs, same packet structure.

---

## Available Domains

| Code | Name | Example Items |
|------|------|---------------|
| `ONDC:NIC2004:49299` | Water Delivery | 20L cans, tankers, RO water |
| `ONDC:RET10` | Food & Grocery | Biryani, dosa, groceries |
| `ONDC:AGR10` | Agriculture | Seeds, fertilizers, produce |
| `ONDC:LOG10` | Logistics | Couriers, warehousing, fleet |
| `ONDC:HLT10` | Healthcare | Medicines, lab tests |
| `ONDC:RET12` | Retail | Electronics, clothing |

---

## City Codes

| Code | City | State |
|------|------|-------|
| `std:011` | Delhi | Delhi |
| `std:080` | Bangalore | Karnataka |
| `std:022` | Mumbai | Maharashtra |
| `std:044` | Chennai | Tamil Nadu |
| `std:033` | Kolkata | West Bengal |
| `std:040` | Hyderabad | Telangana |
| `std:020` | Pune | Maharashtra |
| `std:079` | Ahmedabad | Gujarat |

---

## Li