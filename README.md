<p align="center">
  <img src="https://ondc.org/assets/theme/images/ondc_registered_logo.svg?v=3.2" alt="ONDC" width="200"/>
</p>

<h1 align="center">ONDC Network -- Beckn Protocol Implementation</h1>

<p align="center">
  A production-grade, open-source implementation of the <a href="https://ondc.org">ONDC</a> protocol stack, built on the <a href="https://becknprotocol.io">Beckn</a> specification.
  <br/>
  <sub>A <a href="https://dmj.one">dmj.one</a> initiative</sub>
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
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License"/>
  <img src="https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 22"/>
</p>

---

## What This Is

A complete Beckn network with registry, gateway, buyer app (BAP), seller app (BPP), admin dashboard, consumer storefront, and seller dashboard. Protocol-identical to India's government ONDC network.

Can run as:

1. **Standalone private network** -- your own ONDC-compatible commerce network
2. **ONDC participant** -- connect BAP/BPP to the real government ONDC network (config change, zero code changes)

This project is complementary to the ONDC initiative. It implements the same open protocol so that developers, businesses, and researchers can build, test, and deploy interoperable commerce applications.

---

## Architecture

15 packages, 3 infrastructure services, 1 reverse proxy:

| Package | What It Does |
|---------|-------------|
| `shared` | Crypto, protocol types, middleware, DB schema, compliance modules, PII guard |
| `registry` | Subscriber registration, key management, lookup, key transparency log |
| `gateway` | Search broadcast, response aggregation, multicast routing via RabbitMQ |
| `bap` | Buyer Application Provider -- all 10 Beckn actions + IGM + RSP |
| `bpp` | Business Provider -- catalog, fulfillment, settlement processing |
| `buyer-app` | Next.js consumer storefront with i18n (Hindi + English) |
| `seller-app` | Next.js seller dashboard with i18n (Hindi + English) |
| `admin` | Next.js admin panel -- 20+ pages, real-time monitoring, governance |
| `docs` | Public documentation portal |
| `vault` | AES-256-GCM secret management with auto-rotation |
| `orchestrator` | Docker lifecycle management, WebSocket hub |
| `health-monitor` | 15-second health checks, alert generation |
| `log-aggregator` | Centralized structured logging with retention |
| `simulation-engine` | Order flow generator for load testing |
| `mock-server` | Simulated BAP/BPP responses for integration testing |

Infrastructure: PostgreSQL 16, Redis 7, RabbitMQ 3.13, Nginx.
Production monitoring: Prometheus + Grafana (via `docker-compose.prod.yml`).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full deep-dive.

---

## Quick Start

### Prerequisites

- Ubuntu 22.04+ (or any Linux with Docker)
- Docker 24.0+ with Compose V2
- 4 GB RAM minimum, 8 GB recommended

### Deploy

```bash
git clone https://github.com/divyamohan1993/ondc-network-beckn.git
cd ondc-network-beckn

# Automated: installs Docker, generates keys, builds, seeds, starts everything
sudo bash autoconfig.sh --domain your-domain.com

# Or with production hardening
sudo bash autoconfig.sh --production --domain your-domain.com
```

### Access Points

| Service | URL |
|---------|-----|
| Buyer Storefront | `https://shop.your-domain.com` |
| Seller Dashboard | `https://seller.your-domain.com` |
| Admin Panel | `https://admin.your-domain.com` |
| Registry | `https://registry.your-domain.com` |
| Gateway | `https://gateway.your-domain.com` |
| Docs | `https://your-domain.com` |

### Local Development

```bash
pnpm install
docker compose up postgres redis rabbitmq -d
pnpm dev
```

---

## Features

### Protocol
- [x] Beckn 1.1.0 -- all 10 actions (search, select, init, confirm, status, track, cancel, update, rating, support)
- [x] ACK/NACK handling with Beckn-spec error codes
- [x] 24 ONDC domain codes (Retail, F&B, Fashion, Electronics, Grocery, Logistics, etc.)
- [x] 70+ Indian cities in STD code format
- [x] IGM (Issue & Grievance Management) -- full complaint lifecycle
- [x] RSP (Reconciliation & Settlement Protocol)
- [x] Catalog validation and schema compliance
- [x] Order state machine with audit trail (CREATED > ACCEPTED > IN_PROGRESS > COMPLETED)
- [x] Finder fee validation and commission enforcement

### Applications
- [x] Consumer storefront (Next.js 15, i18n Hindi/English)
- [x] Seller dashboard (Next.js 15, i18n Hindi/English)
- [x] Admin panel with 20+ pages -- participants, orders, alerts, logs, simulation
- [x] Payment gateway integration (Razorpay adapter -- **requires Razorpay credentials**)
- [x] Notification service (SMS/push -- **requires provider credentials**)
- [x] Address service with IFSC validation

### Security
- [x] Ed25519 message signing with configurable TTL
- [x] Hybrid post-quantum cryptography (ML-DSA-65 + ML-KEM-768) -- opt-in via `PQ_CRYPTO_ENABLED`
- [x] AES-256-GCM vault encryption with PBKDF2 key derivation
- [x] PII field-level encryption on Beckn messages (billing name, phone, email, address)
- [x] Key transparency log (append-only, signed, inspired by Certificate Transparency)
- [x] HMAC-SHA256 inter-service authentication
- [x] BLAKE-512 request body hashing
- [x] Message deduplication (replay attack prevention)
- [x] Automatic credential rotation (24h passwords, 30d signing keys)
- [x] Rate limiting at Nginx (IP) and application (subscriber) layers

### Indian Law Compliance
- [x] **DPDPA 2023** -- consent notices, data principal rights requests, breach notification deadlines, fiduciary obligation checks, cross-border transfer rules
- [x] **IT Act 2000 / CERT-In Directions 2022** -- incident classification (6h/24h/72h reporting tiers), reportable incident types
- [x] **Consumer Protection Act 2019 / E-Commerce Rules 2020** -- seller disclosure requirements, pricing transparency, grievance officer
- [x] **GST** -- GSTIN validation, HSN code mapping, TCS provisions

### Observability
- [x] Health checks every 15 seconds with three-tier alerts (INFO/WARNING/CRITICAL)
- [x] Centralized structured logging (Pino JSON, 30-day retention)
- [x] In-memory metrics collector with p50/p95/p99 latency, Prometheus export format
- [x] Prometheus + Grafana monitoring stack (production compose)

### Deployment
- [x] Docker Compose with health checks and dependency ordering
- [x] Kubernetes manifests (GKE, minikube, kind) with HPA and PDBs
- [x] GitHub Actions CI/CD with smart change detection
- [x] Watchtower auto-deploy from GHCR
- [x] One-command server provisioning (`setup-server.sh`)

---

## Security

Security details are in [SECURITY.md](SECURITY.md). Key points:

- **Zero static secrets** -- all credentials generated at deploy time
- **Hybrid post-quantum** -- Ed25519 + ML-DSA-65 signatures, X25519 + ML-KEM-768 key encapsulation (opt-in, graceful fallback to classical-only)
- **PII encryption** -- billing name, phone, email, address encrypted at field level with AES-256-GCM before storage
- **Key transparency** -- append-only log of all public key changes, signed by registry
- **Rate limiting** -- dual layer: Nginx IP-based (30 req/s API, 10 req/s admin) + Redis subscriber-based

---

## Indian Law Compliance

The `@ondc/shared` compliance module provides programmatic checks for four laws. These are compliance *tools*, not legal advice.

| Law | What's Automated |
|-----|-----------------|
| DPDPA 2023 | Consent notice generation, data principal rights request tracking, breach notification deadline calculation, fiduciary obligation gap analysis, cross-border transfer checks |
| IT Act 2000 | Incident severity classification (CERT-In tiers), reportable incident type enumeration, reporting deadline enforcement |
| Consumer Protection Act 2019 | Seller disclosure schema validation, pricing transparency checks, grievance officer requirement verification |
| GST | GSTIN format validation, HSN code lookup, TCS computation helpers |

**Operational requirements** that cannot be automated (legal entity registration, officer appointments, CERT-In reporting relationships) are documented in [KNOWN_LIMITS.md](KNOWN_LIMITS.md).

---

## Testing

```bash
pnpm test              # ~1400 tests across 42 files
pnpm test:coverage     # V8 coverage report
pnpm test:watch        # Watch mode
pnpm test:ui           # Browser-based test UI
pnpm export:pramaan    # Export transaction logs for ONDC Pramaan certification
```

---

## Connecting to Real ONDC

This network is protocol-identical to government ONDC. To connect as a participant:

1. Complete [organizational prerequisites](KNOWN_LIMITS.md) (DPIIT registration, NP Agreement, Pramaan certification, KYC)
2. Set environment variables:

```bash
# Point to ONDC's registry instead of your own
ONDC_REGISTRY_URL=https://staging.registry.ondc.org  # or preprod/prod
ONDC_GATEWAY_URL=https://staging.gateway.ondc.org

# Your subscriber credentials (obtained during ONDC onboarding)
SUBSCRIBER_ID=your-domain.com
SUBSCRIBER_UNIQUE_KEY_ID=your-key-id
```

3. No code changes required. The BAP/BPP adapters use the same Beckn protocol regardless of which registry they point to.

---

## Known Limits

See [KNOWN_LIMITS.md](KNOWN_LIMITS.md) for items that require organizational or legal action:

- ONDC Network Participant registration (DPIIT, NP Agreement, Pramaan, KYC)
- NBBL/NOCS settlement onboarding
- Payment gateway merchant accounts (Razorpay/PayU/Paytm)
- Legal officer appointments (GRO, DPO)
- SSL certificates for production
- India-region deployment for DPDPA compliance

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Language | TypeScript 5.9 (strict mode, ESM) |
| Runtime | Node.js 22 LTS |
| Monorepo | pnpm Workspaces + Turborepo |
| Backend | Fastify 5 |
| Frontend | Next.js 15 (App Router) + Tailwind CSS v4 |
| Database | PostgreSQL 16 + Drizzle ORM (1100+ line schema) |
| Cache | Redis 7 |
| Message Queue | RabbitMQ 3.13 |
| Signing | Ed25519 + hybrid ML-DSA-65 (opt-in) |
| Encryption | AES-256-GCM (vault + PII), X25519 + ML-KEM-768 (opt-in) |
| Hashing | BLAKE-512 |
| Monitoring | Prometheus + Grafana |
| Testing | Vitest + V8 coverage |
| CI/CD | GitHub Actions + GHCR + Watchtower |
| Containers | Docker with multi-stage builds |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built by <a href="https://dmj.one">dmj.one</a></sub>
</p>
