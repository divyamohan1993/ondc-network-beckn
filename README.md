<p align="center">
  <img src="https://ondc.org/assets/theme/images/ondc_registered_logo.svg?v=3.2" alt="ONDC" width="200"/>
</p>

<h1 align="center">ONDC Beckn Network</h1>

<p align="center">
  <strong>The entire open commerce network. One command.</strong>
  <br/>
  <sub>A <a href="https://dmj.one">dmj.one</a> initiative — Empowering Minds, Shaping Futures</sub>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="ARCHITECTURE.md">Architecture</a> &bull;
  <a href="DEPLOYMENT.md">Deploy</a> &bull;
  <a href="CHANGELOG.md">What's New</a> &bull;
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <a href="https://github.com/divyamohan1993/ondc-network-beckn/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/divyamohan1993/ondc-network-beckn/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"/></a>
  <a href="https://github.com/divyamohan1993/ondc-network-beckn/actions/workflows/docker.yml"><img src="https://img.shields.io/github/actions/workflow/status/divyamohan1993/ondc-network-beckn/docker.yml?branch=main&style=flat-square&label=Docker%20Build" alt="Docker Build"/></a>
  <img src="https://img.shields.io/badge/Beckn_Protocol-1.1.0-blue?style=flat-square" alt="Beckn 1.1.0"/>
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License"/>
  <img src="https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 22"/>
</p>

---

## The Problem

India's digital commerce is fragmented. Millions of sellers locked into platforms. Billions of buyers limited by walled gardens. The Beckn protocol was designed to break these walls — but running an ONDC network has meant stitching together dozens of services, manually configuring cryptographic keys, and praying the pieces fit.

**That ends here.**

## The Solution

This is a complete, production-grade implementation of the [Beckn protocol](https://beckn.network) for the [Open Network for Digital Commerce (ONDC)](https://ondc.org). Sixteen services. One repository. Zero guesswork.

```bash
sudo bash autoconfig.sh --production --domain ondc.dmj.one
```

That's it. From a blank Ubuntu VM to a fully operational ONDC network — registry, gateway, buyer adapter, seller adapter, admin dashboard, secret vault, health monitoring, log aggregation, and an orchestration layer — all secured, all connected, all running.

---

## What's Inside

```
16 services.  26,000+ lines of TypeScript.  30+ database tables.  One vision.
```

| Layer | Services | What It Does |
|-------|----------|-------------|
| **Protocol Core** | Registry, Gateway, BAP, BPP | Full Beckn 1.1.0 — subscribe, search, select, init, confirm, track, cancel, settle |
| **Infrastructure** | PostgreSQL, Redis, RabbitMQ | Battle-tested data layer with health checks and persistence |
| **Control Plane** | Admin Dashboard, Docs Portal | Next.js 15 dashboard with real-time monitoring and governance |
| **Security** | Vault, Nginx | AES-256-GCM encrypted secrets, Ed25519 signatures, rate limiting |
| **Observability** | Health Monitor, Log Aggregator, Orchestrator | 15-second health checks, centralized logs, Docker lifecycle management |
| **Testing** | Mock Server, Simulation Engine | Generate thousands of realistic order flows on demand |

---

## Quick Start

### Prerequisites

- **OS:** Ubuntu 22.04+ (or any Linux with Docker)
- **Docker:** 24.0+ with Compose V2
- **RAM:** 4 GB minimum, 8 GB recommended
- **Disk:** 10 GB free space

### One-Command Deploy

```bash
# Clone the repository
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn

# Deploy everything
sudo bash autoconfig.sh
```

The script handles everything:
1. Installs Docker, Node.js, and pnpm if missing
2. Generates Ed25519 signing keys for every service
3. Creates random passwords for all infrastructure
4. Builds and starts all 16 services in dependency order
5. Seeds the database with ONDC domains and Indian cities
6. Verifies every health endpoint before declaring victory

### What You Get

| Service | URL | Purpose |
|---------|-----|---------|
| Docs Portal | `http://ondc.dmj.one` | Public landing page |
| Registry | `http://registry.ondc.dmj.one` | Subscriber management |
| Gateway | `http://gateway.ondc.dmj.one` | Message routing |
| Admin Panel | `http://admin.ondc.dmj.one` | Network governance |
| BAP Adapter | `http://bap.ondc.dmj.one` | Buyer-side API |
| BPP Adapter | `http://bpp.ondc.dmj.one` | Seller-side API |

### Production Deploy

```bash
sudo bash autoconfig.sh \
  --production \
  --domain ondc.dmj.one \
  --admin-email admin@dmj.one
```

Production mode enables:
- Persistent data volumes (survive restarts)
- Memory limits per container
- Automatic restart policies
- Simulation services disabled

### One-Command Server Provisioning

Deploy to any fresh Ubuntu server with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/divyamohan1993/ondc-network-beckn/main/scripts/setup-server.sh | sudo bash
```

This installs Docker, clones the repo, generates secrets, pulls pre-built images from GHCR, and sets up automatic updates via [Watchtower](https://containrrr.dev/watchtower/). See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete production guide.

---

## Architecture at a Glance

```
                           ┌─────────┐
                           │  nginx  │ :80
                           └────┬────┘
                 ┌──────────────┼──────────────┐
                 │              │              │
          ┌──────┴──────┐ ┌────┴────┐ ┌───────┴──────┐
          │   Admin :3003│ │Docs:3000│ │ Protocol APIs│
          │   (Next.js)  │ │(Next.js)│ │              │
          └──────┬───────┘ └─────────┘ └──────┬───────┘
                 │                             │
    ┌────────────┼────────────┐    ┌──────────┼──────────┐
    │            │            │    │          │          │
┌───┴───┐ ┌─────┴────┐ ┌─────┴─┐ ┌┴────┐ ┌───┴──┐ ┌────┴──┐
│ Vault │ │Orchestrat.│ │Health │ │Reg. │ │ GW   │ │BAP/BPP│
│ :3006 │ │  :3007    │ │ :3008 │ │:3001│ │:3002 │ │:3004/5│
└───┬───┘ └─────┬─────┘ └───┬───┘ └──┬──┘ └───┬──┘ └───┬───┘
    │           │            │        │        │        │
    └───────────┴────────────┴────────┴────────┴────────┘
                         │         │         │
                    ┌────┴──┐ ┌───┴────┐ ┌──┴───────┐
                    │Postgr.│ │ Redis  │ │ RabbitMQ │
                    │ :5432 │ │ :6379  │ │  :5672   │
                    └───────┘ └────────┘ └──────────┘
```

The full architecture deep-dive is in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## The Beckn Flow

Every transaction follows the same elegant pattern:

```
Buyer App  ──search──►  BAP  ──►  Gateway  ──►  BPP  ──►  Seller App
                                     │
                                  Registry
                               (trust layer)
```

**Discovery:** `search` → `on_search`
**Order:** `select` → `init` → `confirm`
**Fulfillment:** `status` → `track` → `update`
**Post-Order:** `cancel` | `rating` | `support`

All messages are signed with Ed25519. All subscribers are verified through the Registry. All transactions are logged, auditable, and traceable.

---

## Developer Experience

### Local Development

```bash
# Install dependencies
pnpm install

# Start infrastructure only
docker compose up postgres redis rabbitmq -d

# Run a single service in dev mode
pnpm --filter @ondc/registry dev

# Run all services
pnpm dev
```

### Testing

```bash
# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Visual test UI
pnpm test:ui
```

### Simulation

Generate realistic test data without touching production:

```bash
# Quick simulation
sudo bash simulate.sh --baps 5 --bpps 20 --orders 500

# Continuous live simulation
sudo bash simulate.sh --live --baps 10

# Target specific domains
sudo bash simulate.sh --domains ONDC:RET10,ONDC:RET11 --cities std:011,std:022
```

### Teardown

```bash
# Stop services, keep data
sudo bash teardown.sh

# Stop and wipe everything
sudo bash teardown.sh --full -y
```

---

## Project Structure

```
ondc-network-beckn/
├── packages/
│   ├── shared/              # Crypto, protocol types, middleware, DB schema
│   ├── registry/            # Subscriber registry (Beckn Registry)
│   ├── gateway/             # Message router (Beckn Gateway)
│   ├── bap/                 # Buyer Application Provider adapter
│   ├── bpp/                 # Business Provider adapter
│   ├── admin/               # Next.js 14 admin dashboard
│   ├── docs/                # Public documentation portal
│   ├── vault/               # AES-256-GCM secret management
│   ├── orchestrator/        # Docker lifecycle + WebSocket hub
│   ├── health-monitor/      # Periodic health checks + alerting
│   ├── log-aggregator/      # Centralized structured logging
│   ├── mock-server/         # Mock BAP/BPP for testing
│   └── simulation-engine/   # Order flow generator
├── db/
│   └── init.sql             # Database schema + seed data (24 domains, 70+ cities)
├── nginx/
│   └── nginx.conf           # Reverse proxy with rate limiting
├── scripts/                 # CLI utilities
├── tests/                   # Integration & E2E tests
├── docker-compose.yml       # Development orchestration
├── docker-compose.prod.yml  # Production overrides
├── docker-compose.deploy.yml # GHCR images + Watchtower auto-update
├── autoconfig.sh            # Zero-touch deployment (953 lines)
├── simulate.sh              # Test data generation
├── teardown.sh              # Graceful shutdown
└── turbo.json               # Turborepo build pipeline
```

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Language** | TypeScript 5.9 (strict mode, ESM) |
| **Runtime** | Node.js 22 LTS |
| **Monorepo** | pnpm Workspaces + Turborepo |
| **Backend** | Fastify 5 |
| **Frontend** | Next.js 15 (App Router) + Tailwind CSS v4 |
| **Database** | PostgreSQL 16 + Drizzle ORM |
| **Cache** | Redis 7 |
| **Message Queue** | RabbitMQ 3.13 |
| **Auth** | NextAuth + Ed25519 + HMAC-SHA256 |
| **Encryption** | AES-256-GCM (Vault) + PBKDF2 key derivation |
| **Signing** | Ed25519 (Beckn auth headers) |
| **Hashing** | BLAKE-512 (request digest) |
| **Containers** | Docker with multi-stage builds |
| **CI/CD** | GitHub Actions + GHCR + Watchtower auto-deploy |
| **Proxy** | Nginx with rate limiting + WebSocket |
| **Testing** | Vitest + V8 coverage |

---

## Security

Security isn't a feature. It's the foundation.

- **Zero static secrets** — Every password, key, and token is dynamically generated at deploy time
- **Ed25519 signatures** on every Beckn message with configurable TTL
- **AES-256-GCM** encrypted secret vault with PBKDF2 key derivation
- **HMAC-SHA256** service authentication tokens
- **BLAKE-512** request body hashing
- **Rate limiting** at both Nginx (IP-based) and application (subscriber-based) layers
- **Message deduplication** prevents replay attacks
- **Automatic key rotation** — passwords every 24h, signing keys every 30 days
- **Security headers** — X-Frame-Options, X-Content-Type-Options, CSP

See [SECURITY.md](SECURITY.md) for our security policy and responsible disclosure process.

---

## ONDC Compliance

This implementation covers the complete ONDC specification:

- **24 ONDC domain codes** — Retail, F&B, Fashion, Electronics, Grocery, Logistics, and more
- **70+ Indian cities** in STD code format
- **IGM** (Issue & Grievance Management) — full complaint lifecycle
- **RSP** (Reconciliation & Settlement Protocol) — payment reconciliation
- **Finder fee validation** — commission enforcement
- **Network policy middleware** — SLA enforcement
- **Catalog validation** — schema compliance checking
- **Order state machine** — CREATED → ACCEPTED → IN_PROGRESS → COMPLETED

---

## Configuration

All configuration lives in `.env`. The `autoconfig.sh` script generates it automatically, but here's the anatomy:

| Variable | Default | Description |
|----------|---------|-------------|
| `DOMAIN` | `ondc.dmj.one` | Your network domain |
| `BECKN_CORE_VERSION` | `1.1.0` | Beckn protocol version |
| `PRODUCTION_MODE` | `false` | Enable production hardening |
| `HEALTH_CHECK_INTERVAL_MS` | `15000` | Health check frequency |
| `LOG_RETENTION_DAYS` | `30` | Log retention period |
| `RATE_LIMIT_MAX` | `100` | Max requests per subscriber |
| `PASSWORD_ROTATION_INTERVAL_HOURS` | `24` | Credential rotation cycle |

See [.env.example](.env.example) for the complete list of 118 configuration variables.

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — Use it. Build on it. Make commerce open.

---

<p align="center">
  <sub>Built with purpose by <a href="https://dmj.one">dmj.one</a> — where Dreams unite, Manifest, and Journey as One.</sub>
  <br/>
  <sub>For India. For open commerce. For everyone.</sub>
</p>
