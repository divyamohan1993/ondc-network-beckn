# Architecture

> Sixteen services, three layers, one network.

## Overview

The ONDC Beckn Network is a microservices platform built on the [Beckn protocol](https://beckn.network). Every service is a standalone TypeScript application, containerized with Docker, and orchestrated through Docker Compose. The monorepo uses pnpm workspaces and Turborepo for build orchestration.

```
                                  Internet
                                     │
                              ┌──────┴──────┐
                              │    nginx     │
                              │   :80/:443   │
                              │  rate limit  │
                              │  WebSocket   │
                              └──────┬───────┘
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
     ┌──────┴──────┐         ┌──────┴──────┐         ┌───────┴──────┐
     │  Frontend   │         │  Protocol   │         │   Agents     │
     │   Layer     │         │   Core      │         │   Layer      │
     └──────┬──────┘         └──────┬──────┘         └───────┬──────┘
            │                        │                        │
  ┌─────────┼─────────┐    ┌────────┼────────┐    ┌──────────┼──────────┐
  │         │         │    │        │        │    │          │          │
Admin    Docs     Login  Registry Gateway BAP/BPP Vault  Orchestrator  Health
:3003    :3000          :3001    :3002   :3004/5  :3006    :3007      Monitor
                                                                      :3008
                                                             Log Agg. :3009
            │                        │                        │
            └────────────────────────┼────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
               PostgreSQL         Redis          RabbitMQ
                 :5432            :6379            :5672
```

---

## Service Catalog

### Infrastructure (3 services)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **PostgreSQL** | `postgres:16-alpine` | 5432 | Primary data store — 30+ tables, Drizzle ORM |
| **Redis** | `redis:7-alpine` | 6379 | Session cache, rate limit counters, dedup store |
| **RabbitMQ** | `rabbitmq:3.13-management` | 5672 / 15672 | Async message routing between Gateway and BPPs |

### Protocol Core (4 services)

| Service | Port | Depends On | Key Responsibility |
|---------|------|------------|-------------------|
| **Registry** | 3001 | Vault, DB, Redis | Subscriber registration, key management, lookup |
| **Gateway** | 3002 | Registry, DB, Redis, RabbitMQ | Search broadcast, response aggregation, multicast |
| **BAP** | 3004 | Gateway, DB, Redis | Buyer-side adapter — all 10 Beckn actions + IGM + RSP |
| **BPP** | 3005 | Registry, DB, Redis | Seller-side adapter — catalog, fulfillment, settlement |

### Frontend (2 services)

| Service | Port | Framework | Key Features |
|---------|------|-----------|-------------|
| **Admin** | 3003 | Next.js 15 | 20+ pages — dashboard, participants, orders, vault, health, logs, simulation |
| **Docs** | 3000 | Next.js 15 | Public documentation and landing page |

### Agent Services (5 services)

| Service | Port | Key Features |
|---------|------|-------------|
| **Vault** | 3006 | AES-256-GCM encrypted secrets, HMAC tokens, auto-rotation |
| **Orchestrator** | 3007 | Docker container management, WebSocket hub, teardown coordination |
| **Health Monitor** | 3008 | 15-second health checks, alert generation (INFO/WARNING/CRITICAL) |
| **Log Aggregator** | 3009 | Centralized structured logging, 30-day retention, search API |
| **Simulation Engine** | 3011 | Order flow generation, configurable load testing |

### Testing (1 service)

| Service | Port | Key Features |
|---------|------|-------------|
| **Mock Server** | 3010 | Simulated BAP/BPP responses for integration testing |

---

## The Beckn Protocol Flow

The Beckn protocol defines a standard vocabulary for digital commerce. Every transaction follows this lifecycle:

```
  Buyer App           BAP               Gateway            BPP            Seller App
     │                 │                   │                │                 │
     │──── search ────►│                   │                │                 │
     │                 │──── search ───────►│                │                 │
     │                 │                   │── search ─────►│                 │
     │                 │                   │                │── on_search ───►│
     │                 │                   │◄─ on_search ───│                 │
     │◄── on_search ───│◄── on_search ─────│                │                 │
     │                 │                   │                │                 │
     │──── select ────►│───────────────────────── select ──►│                 │
     │◄── on_select ───│◄──────────────────────── on_select │                 │
     │                 │                   │                │                 │
     │──── init ──────►│───────────────────────── init ────►│                 │
     │◄── on_init ─────│◄──────────────────────── on_init ──│                 │
     │                 │                   │                │                 │
     │──── confirm ───►│───────────────────────── confirm ─►│                 │
     │◄── on_confirm ──│◄──────────────────────── on_confirm│                 │
     │                 │                   │                │                 │
     │──── status ────►│───────────────────────── status ──►│                 │
     │◄── on_status ───│◄──────────────────────── on_status │                 │
     │                 │                   │                │                 │
```

**Search** goes through the Gateway (broadcast to all eligible BPPs).
**Everything after search** is peer-to-peer between BAP and BPP.
**The Registry** is the trust anchor — every participant is verified.

---

## Middleware Pipeline

Every Beckn request passes through seven middleware layers:

```
  Incoming Request
        │
        ▼
  ┌─────────────┐
  │    CORS      │  Cross-origin headers
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │  Signature   │  Ed25519 verification (Beckn auth header)
  │ Verification │  → Reject if TTL expired or signature invalid
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │ Rate Limiter │  Per-subscriber rate limiting via Redis
  │              │  → 429 if quota exceeded
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │  Duplicate   │  message_id deduplication (5-min TTL)
  │  Detector    │  → Reject replayed messages
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │   Network    │  SLA enforcement, domain validation
  │   Policy     │  → Reject policy violations
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │  Finder Fee  │  Commission validation
  │  Validator   │  → Reject incorrect finder fees
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │    Route     │  Business logic handler
  │   Handler    │
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │    Error     │  Beckn-spec error formatting
  │   Handler    │  → Standardized error codes
  └─────────────┘
```

---

## Cryptographic Architecture

### Signing (Ed25519)

Every Beckn message carries a cryptographic signature in the `Authorization` header:

```
Authorization: Signature keyId="registry.ondc.dmj.one|registry-key-01|ed25519"
  algorithm="ed25519"
  created="1706000000"
  expires="1706000300"
  headers="(created) (expires) digest"
  signature="base64-encoded-ed25519-signature"
```

The signature covers:
- `(created)` — Unix timestamp
- `(expires)` — TTL (default: 300 seconds)
- `digest` — BLAKE-512 hash of the request body

### Encryption (Vault)

```
                  Master Key (PBKDF2)
                       │
                  ┌────┴─────┐
                  │ AES-256  │
                  │   GCM    │
                  └────┬─────┘
                       │
  ┌────────────────────┼────────────────────┐
  │                    │                    │
DB Passwords    Signing Keys         API Tokens
  │                    │                    │
  └── Encrypted at rest in vault_secrets ───┘
```

- **Key derivation:** PBKDF2 from master key
- **Encryption:** AES-256-GCM (authenticated encryption)
- **Token auth:** HMAC-SHA256 service tokens
- **Rotation:** Automatic via rotation scheduler + webhooks

---

## Database Schema

### Entity Relationship Overview

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────┐
│  subscribers │────►│subscriber_domains │◄────│   domains    │
│              │     └───────────────────┘     └──────────────┘
│ - subscriber_id    ┌───────────────────┐     ┌──────────────┐
│ - type (BAP/BPP)   │   transactions    │     │    cities    │
│ - signing_key      │ - message_id      │     │ - code       │
│ - status           │ - action          │     │ - name       │
└──────┬───────┘     │ - status          │     └──────────────┘
       │             │ - latency_ms      │
       │             └───────────────────┘
       │
       ├──►┌────────────────┐     ┌───────────────────────┐
       │   │     orders     │────►│order_state_transitions│
       │   │ - state        │     │ - from_state          │
       │   │ - billing      │     │ - to_state            │
       │   │ - fulfillment  │     │ - timestamp           │
       │   └────────────────┘     └───────────────────────┘
       │
       ├──►┌────────────────┐
       │   │  settlements   │
       │   │ - amount       │
       │   │ - recon_status │
       │   └────────────────┘
       │
       └──►┌────────────────┐
           │    issues       │  (IGM)
           │ - status        │
           │ - category      │
           └─────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  vault_secrets   │  │ health_snapshots │  │ aggregated_logs  │
│ - encrypted_value│  │ - service        │  │ - service        │
│ - version        │  │ - response_ms    │  │ - level          │
│ - rotation_at    │  │ - is_healthy     │  │ - message        │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Key Tables

| Table | Records | Purpose |
|-------|---------|---------|
| `subscribers` | Network participants | BAP, BPP, BG registration with keys |
| `domains` | 24 seed records | ONDC domain codes (ONDC:RET10, etc.) |
| `cities` | 70+ seed records | Indian cities in STD code format |
| `transactions` | Per-message | Request/response audit trail |
| `orders` | Per-order | Full order lifecycle state machine |
| `settlements` | Per-settlement | Payment reconciliation tracking |
| `issues` | Per-complaint | IGM issue lifecycle |
| `vault_secrets` | Per-secret | Encrypted secret storage |
| `health_snapshots` | Per-check | Service health history |
| `health_alerts` | Per-alert | Alert log with severity |
| `aggregated_logs` | Per-entry | Centralized structured logs |
| `admin_users` | Per-admin | Dashboard login (bcrypt hashed) |
| `audit_logs` | Per-action | Admin action audit trail |
| `ratings` | Per-rating | 1-5 star ratings by category |

### Enums

```sql
subscriber_type:     BAP | BPP | BG
subscriber_status:   INITIATED | UNDER_SUBSCRIPTION | SUBSCRIBED | SUSPENDED | REVOKED
order_state:         CREATED | ACCEPTED | IN_PROGRESS | COMPLETED | CANCELLED | RETURNED
transaction_status:  SENT | ACK | NACK | CALLBACK_RECEIVED | TIMEOUT | ERROR
alert_severity:      INFO | WARNING | CRITICAL
issue_status:        OPEN | ESCALATED | RESOLVED | CLOSED
admin_role:          SUPER_ADMIN | ADMIN | VIEWER
```

---

## Docker Orchestration

### Service Dependency Graph

```
                    postgres ◄──────┐
                       │            │
                    redis ◄─────┐   │
                       │        │   │
                   rabbitmq     │   │
                       │        │   │
                    vault ──────┘───┘
                    ┌──┴──┐
              registry    orchestrator
              ┌──┴──┐     health-monitor
           gateway   bpp   log-aggregator
              │
             bap
              │
           ┌──┴──┐
         admin   docs
              │
           nginx
```

### Profiles

```bash
# Development — all services including simulation
docker compose up -d

# Simulation mode — adds mock-server + simulation-engine
docker compose --profile simulation up -d

# Production — persistent volumes, no simulation
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Server deployment — pre-built GHCR images + Watchtower auto-update
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml up -d
```

### Resource Limits (Production)

| Service | Memory Limit |
|---------|-------------|
| PostgreSQL | 1 GB |
| Redis | 512 MB |
| RabbitMQ | 512 MB |
| Vault | 256 MB |
| All others | Default (no limit) |

---

## Networking

### Internal

All services communicate over a Docker bridge network (`ondc-network`). Services reference each other by container name (e.g., `postgres:5432`, `registry:3001`).

### External

Nginx acts as the single entry point:

```
*.ondc.dmj.one  ──►  nginx :80
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
  subdomain routing    rate limiting    WebSocket upgrade
        │                 │                 │
  registry.*         30 req/s (API)    admin/api/ws
  gateway.*          10 req/s (admin)  orchestrator/ws
  admin.*
  bap.*
  bpp.*
```

### Security Headers

Every response includes:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## Build Pipeline

### Turborepo Task Graph

```
          clean
            │
          build
         ┌──┴──┐
     shared    (all services depend on shared)
         │
   ┌─────┼─────┬──────┬──────┬──────┬──────┐
 registry gateway bap  bpp  admin  docs  ...agents
```

### Multi-Stage Docker Builds

Every service uses the same efficient two-stage pattern:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
  → Install pnpm
  → Copy workspace
  → Build @ondc/shared first
  → Build target service
  → Result: compiled JavaScript in dist/

# Stage 2: Runtime
FROM node:22-alpine
  → Copy dist + node_modules only
  → Minimal attack surface
  → EXPOSE port
  → CMD ["node", "dist/server.js"]
```

---

## Monitoring & Observability

### Health Checks

Every service exposes `GET /health`. The Health Monitor polls all services every 15 seconds:

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

### Alert Pipeline

```
Health Monitor (15s poll)
    │
    ├── Response > 5s  →  WARNING alert
    ├── Service down   →  CRITICAL alert
    └── Normal         →  INFO snapshot
    │
    ▼
health_alerts table  →  Admin Dashboard  →  Operator
```

### Centralized Logging

All services use `pino` structured logging. The Log Aggregator collects, indexes, and retains logs:

```
Service (pino) ──► Log Aggregator ──► aggregated_logs table
                                           │
                                     Admin Dashboard
                                     (Logs Explorer)
```

---

## Development Patterns

### Service Bootstrap Pattern

Every Fastify service follows this pattern:

```typescript
import Fastify from "fastify";
import { createLogger, createDb } from "@ondc/shared";

const server = Fastify({ logger: createLogger("service-name") });

// Dependencies
const { db } = createDb(DATABASE_URL);
server.decorate("db", db);

// Middleware
await server.register(cors);
await server.register(rateLimit);

// Routes
await server.register(healthRoutes);
await server.register(actionRoutes);

// Start
await server.listen({ port, host: "0.0.0.0" });
```

### Shared Package Usage

```typescript
// Cryptography
import { ed25519Sign, ed25519Verify, blake512Hash } from "@ondc/shared";

// Protocol
import { createContext, validateRequest, BecknAction } from "@ondc/shared";

// Middleware
import { createRateLimiterMiddleware, createDuplicateDetector } from "@ondc/shared";

// Database
import { createDb, subscribers, orders, transactions } from "@ondc/shared";

// Utilities
import { createLogger, validateEnv, VaultClient } from "@ondc/shared";
```

---

## CI/CD Pipeline

### Continuous Integration

Every push to `main` and every pull request triggers the CI pipeline (`.github/workflows/ci.yml`):

```
Push/PR to main
      │
      ▼
  ┌──────────┐
  │ Checkout  │
  └────┬──────┘
       │
  ┌────▼──────┐
  │ pnpm      │  Reads version from packageManager field
  │ install   │
  └────┬──────┘
       │
  ┌────▼──────┐
  │ pnpm      │  Turborepo builds all packages in dependency order
  │ build     │
  └────┬──────┘
       │
  ┌────▼──────┐
  │ pnpm      │  Vitest runs all test suites
  │ test      │
  └──────────┘
```

### Docker Build & Push

When code is pushed to `main` or a version tag is created (`.github/workflows/docker.yml`):

```
Push to main / Tag
       │
  ┌────▼────────┐
  │ Detect      │  dorny/paths-filter identifies changed services
  │ Changes     │  (including shared package dependencies)
  └────┬────────┘
       │
  ┌────▼────────┐
  │ Matrix      │  12 services build in parallel
  │ Build       │  Only changed services are rebuilt
  └────┬────────┘
       │
  ┌────▼────────┐
  │ Push to     │  Tags: SHA, branch, semver, :latest
  │ GHCR        │  Cached via GitHub Actions cache
  └────┬────────┘
       │
  ┌────▼────────┐
  │ Watchtower  │  Running on server, polls GHCR every 5 min
  │ Auto-deploy │  Pulls new :latest images, rolling restart
  └─────────────┘
```

### Deployment Overlay

The three-layer compose architecture:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base services with `build:` directives for local development |
| `docker-compose.prod.yml` | Production overrides: persistent volumes, restart policies, memory limits |
| `docker-compose.deploy.yml` | Server deployment: GHCR `image:` references + Watchtower auto-updater |

Server-side, a systemd timer syncs configuration (compose files, nginx.conf, DB schema) from git every 10 minutes, ensuring compose changes propagate automatically without redeploying images.

---

---

<p align="center">
  <sub>Part of the <a href="https://dmj.one">dmj.one</a> ONDC Network initiative.</sub>
</p>

*For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md). For contributing guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).*
