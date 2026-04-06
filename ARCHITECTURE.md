# Architecture

> 15 packages, 3 infrastructure services, 1 reverse proxy.

## Overview

A microservices platform built on the [Beckn protocol](https://beckn.network). Every service is a standalone TypeScript application, containerized with Docker, orchestrated through Docker Compose. The monorepo uses pnpm workspaces and Turborepo for build orchestration.

```
                                  Internet
                                     |
                              +--------------+
                              |    nginx     |
                              |   :80/:443   |
                              |  rate limit  |
                              |  WebSocket   |
                              +------+-------+
            +------------------------+------------------------+
            |                        |                        |
     +------+------+         +------+------+         +-------+------+
     |  Frontend   |         |  Protocol   |         |   Agents     |
     |   Layer     |         |   Core      |         |   Layer      |
     +------+------+         +------+------+         +-------+------+
            |                        |                        |
  +---------+---------+    +--------+--------+    +----------+----------+
  |         |    |    |    |        |        |    |          |          |
Admin   Docs Buyer Seller Registry GW BAP/BPP Vault  Orchestrator  Health
:3003  :3000  App   App  :3001   :3002 :3004/5 :3006   :3007       Monitor
             :3012 :3013                                            :3008
                                                            Log Agg. :3009
            |                        |                        |
            +------------------------+------------------------+
                                     |
                    +----------------+----------------+
                    |                |                |
               PostgreSQL         Redis          RabbitMQ
                 :5432            :6379            :5672
```

Production monitoring adds Prometheus and Grafana via `docker-compose.prod.yml`.

---

## Service Catalog

### Infrastructure (3 services)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **PostgreSQL** | `postgres:16-alpine` | 5432 | Primary data store -- 1100+ line Drizzle schema |
| **Redis** | `redis:7-alpine` | 6379 | Session cache, rate limit counters, dedup store |
| **RabbitMQ** | `rabbitmq:3.13-management` | 5672 / 15672 | Async message routing between Gateway and BPPs |

### Protocol Core (4 services)

| Service | Port | Key Responsibility |
|---------|------|--------------------|
| **Registry** | 3001 | Subscriber registration, key management, lookup, key transparency log |
| **Gateway** | 3002 | Search broadcast, response aggregation, multicast |
| **BAP** | 3004 | Buyer-side adapter -- all 10 Beckn actions + IGM + RSP |
| **BPP** | 3005 | Seller-side adapter -- catalog, fulfillment, settlement |

### Frontend (4 services)

| Service | Port | Framework | Purpose |
|---------|------|-----------|---------|
| **Admin** | 3003 | Next.js 15 | 20+ page admin panel -- dashboard, participants, orders, vault, health, logs, simulation |
| **Docs** | 3000 | Next.js 15 | Public documentation and landing page |
| **Buyer App** | 3012 | Next.js 15 | Consumer storefront with i18n (Hindi/English) |
| **Seller App** | 3013 | Next.js 15 | Seller dashboard with i18n (Hindi/English) |

### Agent Services (5 services)

| Service | Port | Purpose |
|---------|------|---------|
| **Vault** | 3006 | AES-256-GCM encrypted secrets, HMAC tokens, auto-rotation |
| **Orchestrator** | 3007 | Docker container management, WebSocket hub, teardown coordination |
| **Health Monitor** | 3008 | 15-second health checks, three-tier alerts (INFO/WARNING/CRITICAL) |
| **Log Aggregator** | 3009 | Centralized structured logging, 30-day retention, search API |
| **Simulation Engine** | 3011 | Order flow generation, configurable load testing |

### Testing (1 service)

| Service | Port | Purpose |
|---------|------|---------|
| **Mock Server** | 3010 | Simulated BAP/BPP responses for integration testing |

### Production Monitoring (2 services, prod-only)

| Service | Port | Purpose |
|---------|------|---------|
| **Prometheus** | 9090 | Metrics collection, alerting rules |
| **Grafana** | 3100 | Dashboards and visualization |

---

## The Beckn Protocol Flow

```
  Buyer App           BAP               Gateway            BPP            Seller App
     |                 |                   |                |                 |
     |---- search ---->|                   |                |                 |
     |                 |---- search ------->|                |                 |
     |                 |                   |-- search ----->|                 |
     |                 |                   |                |-- on_search --->|
     |                 |                   |<- on_search ---|                 |
     |<-- on_search ---|<-- on_search -----|                |                 |
     |                 |                   |                |                 |
     |---- select ---->|------------------------ select -->|                 |
     |<-- on_select ---|<----------------------- on_select |                 |
     |                 |                   |                |                 |
     |---- init ------>|------------------------ init ---->|                 |
     |<-- on_init -----|<----------------------- on_init --|                 |
     |                 |                   |                |                 |
     |---- confirm --->|------------------------ confirm ->|                 |
     |<-- on_confirm --|<---------------------- on_confirm |                 |
```

**Search** goes through the Gateway (broadcast to all eligible BPPs).
**Everything after search** is peer-to-peer between BAP and BPP.
**The Registry** is the trust anchor -- every participant is verified.

---

## Shared Package (`@ondc/shared`)

The shared package is the foundation. All other services import from it.

### Modules

| Module | Contents |
|--------|----------|
| `crypto/` | Ed25519 signing, X25519 key exchange, BLAKE-512 hashing, auth header generation, post-quantum (ML-DSA-65 + ML-KEM-768) |
| `protocol/` | Beckn type definitions, context builder, request validator, error codes, catalog validation, order state machine |
| `middleware/` | Rate limiting, duplicate detection, network policy, finder fee validation, error handling, request signing |
| `db/` | Drizzle ORM schema (1100+ lines), migration utilities |
| `compliance/` | DPDPA 2023, IT Act 2000, Consumer Protection Act 2019, GST |
| `services/` | Payment gateway adapters (Razorpay), notification service, metrics collector, settlement service, address/IFSC service |
| `utils/` | Pino logger, env validator, registry client, vault client, PII field-level encryption |

---

## Cryptographic Architecture

### Message Signing (Ed25519)

Every Beckn message carries a signature in the `Authorization` header:

```
Authorization: Signature keyId="registry.example.com|registry-key-01|ed25519"
  algorithm="ed25519"
  created="1706000000"
  expires="1706000300"
  headers="(created) (expires) digest"
  signature="base64-encoded-ed25519-signature"
```

The signature covers: `(created)` timestamp, `(expires)` TTL (default 300s), and `digest` (BLAKE-512 hash of request body).

### Post-Quantum Hybrid (Opt-in)

When `PQ_CRYPTO_ENABLED=true` and `@noble/post-quantum` is installed:

- **Signing**: Ed25519 + ML-DSA-65 (FIPS 204). Both signatures must verify.
- **Key encapsulation**: X25519 + ML-KEM-768 (FIPS 203). Both layers must agree on shared secret.
- **Graceful degradation**: if the PQ library is unavailable, falls back to classical-only with a warning log.

### PII Field-Level Encryption

The PII guard (`pii-guard.ts`) encrypts specific Beckn message fields before storage:

- `message.order.billing.name`
- `message.order.billing.phone`
- `message.order.billing.email`
- `message.order.billing.address`
- Fulfillment contact and location fields

Each value is encrypted with AES-256-GCM and stored as `PII:<base64(iv + authTag + ciphertext)>`.

### Vault Encryption

```
                  Master Key (PBKDF2)
                       |
                  +----------+
                  | AES-256  |
                  |   GCM    |
                  +----+-----+
                       |
  +--------------------+--------------------+
  |                    |                    |
DB Passwords    Signing Keys         API Tokens
  |                    |                    |
  +-- Encrypted at rest in vault_secrets --+
```

### Key Transparency

The Registry maintains an append-only log of all public key changes (registration, rotation, revocation). Each entry is signed with the registry's private key. Inspired by Certificate Transparency (CT) logs.

---

## Middleware Pipeline

Every Beckn request passes through seven middleware layers:

```
  Incoming Request
        |
  +-------------+
  |    CORS      |  Cross-origin headers
  +------+-------+
         |
  +------+-------+
  |  Signature   |  Ed25519 verification (Beckn auth header)
  | Verification |  Reject if TTL expired or signature invalid
  +------+-------+
         |
  +------+-------+
  | Rate Limiter |  Per-subscriber rate limiting via Redis
  |              |  429 if quota exceeded
  +------+-------+
         |
  +------+-------+
  |  Duplicate   |  message_id deduplication (5-min TTL)
  |  Detector    |  Reject replayed messages
  +------+-------+
         |
  +------+-------+
  |   Network    |  SLA enforcement, domain validation
  |   Policy     |  Reject policy violations
  +------+-------+
         |
  +------+-------+
  |  Finder Fee  |  Commission validation
  |  Validator   |  Reject incorrect finder fees
  +------+-------+
         |
  +------+-------+
  |    Route     |  Business logic handler
  |   Handler    |
  +------+-------+
         |
  +------+-------+
  |    Error     |  Beckn-spec error formatting
  |   Handler    |  Standardized error codes
  +-------------+
```

---

## Compliance Modules

The `@ondc/shared/compliance` barrel exports programmatic compliance tools:

| Module | Law | What It Does |
|--------|-----|-------------|
| `dpdpa.ts` | DPDPA 2023 | Consent notice generation (Section 5), data principal rights request types (Section 8), breach notification deadline calculation (Section 12, 72-hour rule), fiduciary obligation gap checker (Section 9), cross-border transfer validation (Section 11), legitimate use classification (Section 6) |
| `it-act.ts` | IT Act 2000 | CERT-In incident severity classification (6h/24h/72h tiers), reportable incident type enumeration per CERT-In Directions 2022 |
| `consumer-protection.ts` | CPA 2019 | Seller disclosure schema (Rule 5), pricing transparency, GRO requirement, return/refund policy |
| `gst.ts` | GST | GSTIN format validation, HSN code mapping, TCS computation (Section 52 CGST) |

These modules provide types, validators, and deadline calculators. They do not replace legal counsel.

---

## Database Schema

1100+ line Drizzle ORM schema. Key tables:

| Table | Purpose |
|-------|---------|
| `subscribers` | BAP, BPP, BG registration with signing keys |
| `domains` | 24 ONDC domain codes (seeded) |
| `cities` | 70+ Indian cities in STD format (seeded) |
| `transactions` | Per-message audit trail (action, status, latency) |
| `orders` | Order lifecycle state machine |
| `order_state_transitions` | State change audit log |
| `settlements` | Payment reconciliation tracking |
| `issues` | IGM complaint lifecycle |
| `vault_secrets` | Encrypted secret storage (versioned) |
| `health_snapshots` | Service health history |
| `health_alerts` | Alert log with severity |
| `aggregated_logs` | Centralized structured logs |
| `admin_users` | Dashboard login (bcrypt hashed) |
| `audit_logs` | Admin action audit trail |
| `ratings` | 1-5 star ratings by category |
| `consent_records` | DPDPA consent tracking |

---

## Docker Orchestration

### Dependency Graph

```
                    postgres <------+
                       |            |
                    redis <-----+   |
                       |        |   |
                   rabbitmq     |   |
                       |        |   |
                    vault ------+---+
                    +--+--+
              registry    orchestrator
              +--+--+     health-monitor
           gateway   bpp   log-aggregator
              |
             bap
              |
           +--+--+
       admin  docs  buyer-app  seller-app
              |
           nginx
```

### Profiles

```bash
# Development -- all services
docker compose up -d

# Simulation -- adds mock-server + simulation-engine
docker compose --profile simulation up -d

# Production -- persistent volumes, Prometheus, Grafana, no simulation
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Server deployment -- pre-built GHCR images + Watchtower auto-update
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml up -d
```

### Monitoring Stack (Production)

`docker-compose.prod.yml` adds:

- **Prometheus** -- scrapes `/metrics` endpoints, evaluates alert rules from `monitoring/alerts.yml`
- **Grafana** -- dashboards for network health, latency percentiles, error rates

The `MetricsCollector` in `@ondc/shared` tracks per-action latency (p50/p95/p99), error rates, throughput, and SLA violations. It exports in Prometheus text format via `toPrometheus()`.

---

## Build Pipeline

### Turborepo Task Graph

```
          clean
            |
          build
         +--+--+
     shared    (all services depend on shared)
         |
   +-----+-----+------+------+------+------+------+------+
 registry gateway bap  bpp  admin  docs buyer-app seller-app ...agents
```

### Multi-Stage Docker Builds

Every service uses a two-stage pattern:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
  # Install pnpm, copy workspace, build @ondc/shared, then target service

# Stage 2: Runtime
FROM node:22-alpine
  # Copy dist + node_modules only. Minimal attack surface.
```

---

## CI/CD Pipeline

### CI (every push/PR)

Checkout > pnpm install > Turborepo build > Vitest test suite

### Docker Build & Push (push to main / tags)

1. `dorny/paths-filter` detects changed services (shared changes trigger all dependents)
2. Matrix build: 15 services in parallel
3. Push to GHCR with tags: SHA, branch, semver, `:latest`

### Auto-Deploy

Watchtower polls GHCR every 5 minutes, pulls new `:latest` images, restarts containers. Scoped to ONDC containers only via labels.

A systemd timer syncs config (compose files, nginx.conf, DB schema) from git every 10 minutes.

---

*For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md). For contributing guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).*
