# Changelog

All notable changes to the [dmj.one](https://dmj.one) ONDC Beckn Network platform.

---

## [1.1.0] — 2025-02-20

### CI/CD Pipeline

- **GitHub Actions CI** — Automated build and test on every push/PR to main (Node.js 22, pnpm from `packageManager` field)
- **Docker Build & Push** — 12-service parallel matrix build with smart change detection via `dorny/paths-filter`
- **GitHub Container Registry** — Pre-built images pushed with SHA, branch, semver, and `:latest` tags
- **Docker layer caching** via GitHub Actions cache for fast rebuilds

### Automatic Deployment

- **Watchtower auto-updater** — Polls GHCR every 5 minutes, pulls new images, rolling restart with zero downtime
- **`docker-compose.deploy.yml`** — Deployment overlay with GHCR image references and Watchtower configuration
- **`scripts/setup-server.sh`** — One-command server provisioning: installs Docker, clones repo, generates secrets, starts services
- **`scripts/deploy.sh`** — Manual deployment script with health check verification (120s timeout)
- **systemd config sync timer** — Automatically syncs compose files, nginx.conf, and DB schema from git every 10 minutes
- **Watchtower scoping** — Only manages ONDC containers via `com.centurylinklabs.watchtower.scope` labels

### Build System Upgrades

- **Node.js 22** — Upgraded from Node.js 20 LTS
- **TypeScript 5.9** — Upgraded from 5.4
- **Next.js 15** — Upgraded from 14 (admin dashboard and docs portal)
- **Tailwind CSS v4** — Upgraded from v3 (new CSS-first configuration)
- **Fastify 5** — Upgraded backend framework
- **@noble/curves v2** — Updated cryptographic library with new API
- **Drizzle ORM** — Version bump with updated type system
- **`DOCKER_BUILD=1`** environment variable — Conditional `output: 'standalone'` in Next.js builds for Docker compatibility

### Build Fixes

- Fixed `@noble/curves` v2 import paths and API renames
- Fixed IoRedis CJS/ESM interop (default → named imports)
- Fixed amqplib `Connection` → `ChannelModel` type updates
- Fixed Tailwind CSS v4 `@apply` directive migration
- Fixed Next.js 15 async `searchParams` handling
- Fixed JSONB `unknown` type rendering in React components
- Fixed bcrypt native module build in Docker
- Fixed Windows symlink permissions with `DOCKER_BUILD=1` conditional

---

## [1.0.0] — 2025-02-19

### The Beginning

The first public release of a complete, production-grade ONDC Beckn protocol implementation.

### Protocol Core

- **Registry Service** — Full subscriber lifecycle: register, verify, lookup, suspend, revoke
- **Gateway Service** — Search broadcast with multicast and response aggregation via RabbitMQ
- **BAP Adapter** — All 10 Beckn actions (search, select, init, confirm, status, track, cancel, update, rating, support) with buyer-side client API
- **BPP Adapter** — Seller-side adapter with catalog management, order fulfillment, and settlement processing
- **Beckn 1.1.0 compliance** — Full protocol context creation, validation, and ACK/NACK handling

### Shared Library (`@ondc/shared`)

- **Cryptography** — Ed25519 signing/verification, X25519 key exchange, BLAKE-512 hashing, auth header generation
- **Protocol** — Type definitions, context builder, request validator, error codes, catalog validation, order state machine
- **Middleware** — Rate limiting, duplicate detection, network policy enforcement, finder fee validation, error handling, request signing
- **Database** — Drizzle ORM schema for 30+ tables, migration utilities
- **Utilities** — Pino-based structured logging, environment validator, registry client, vault client

### Admin Dashboard

- **Next.js 14 App Router** with 20+ pages
- **Real-time monitoring** — Service health, alerts, log explorer
- **Network governance** — Participant management, domain/city configuration, policy enforcement
- **Operations** — Order tracking, transaction log, settlement management, IGM issue resolution
- **Control plane** — Service start/stop/restart, simulation control, teardown
- **Security** — NextAuth authentication with role-based access (SUPER_ADMIN, ADMIN, VIEWER)
- **Analytics** — Charts and statistics via Recharts

### Agent Services

- **Vault** — AES-256-GCM encrypted secret storage with PBKDF2 key derivation, HMAC-SHA256 tokens, automatic rotation scheduler with webhook callbacks
- **Orchestrator** — Docker container lifecycle management via Docker socket, WebSocket hub for real-time updates, teardown coordination
- **Health Monitor** — 15-second periodic health checks, three-tier alert system (INFO/WARNING/CRITICAL), configurable thresholds
- **Log Aggregator** — Centralized structured log collection, 30-day configurable retention, multi-level filtering and search API
- **Simulation Engine** — Configurable order flow generation, domain/city filtering, realistic test data

### Infrastructure

- **PostgreSQL 16** — 30+ tables, 24 ONDC domains, 70+ Indian cities seeded
- **Redis 7** — Session cache, rate limit counters, dedup store
- **RabbitMQ 3.13** — Async message routing with management UI
- **Nginx** — Reverse proxy with subdomain routing, rate limiting (30r/s API, 10r/s admin), WebSocket support, security headers
- **Docker Compose** — 16-service orchestration with health checks and dependency ordering

### Deployment Automation

- **`autoconfig.sh`** — 953-line zero-touch deployment script (blank VM to running network)
- **`simulate.sh`** — Test data generation with configurable participants, orders, domains, and cities
- **`teardown.sh`** — Graceful shutdown with optional volume/image cleanup
- **Production overlay** — Persistent volumes, restart policies, memory limits, simulation disabled

### Security

- Dynamic secret generation — zero static passwords
- Ed25519 message signing with configurable TTL
- AES-256-GCM vault encryption
- HMAC-SHA256 inter-service authentication
- BLAKE-512 request body digests
- IP-based and subscriber-based rate limiting
- Message deduplication (5-minute TTL)
- Automatic credential rotation (24h passwords, 30d signing keys)
- Security headers on all responses

### Developer Experience

- **Monorepo** — pnpm workspaces + Turborepo with task caching
- **TypeScript 5.4** — Strict mode, full ESM
- **Testing** — Vitest with V8 coverage, unit + integration + E2E
- **Multi-stage Docker builds** — Efficient, minimal runtime images
- **Hot reload** — `pnpm dev` for local development

### ONDC Compliance

- 24 ONDC domain codes (Retail, F&B, Fashion, Electronics, Grocery, Logistics, etc.)
- 70+ Indian cities in STD code format
- IGM (Issue & Grievance Management) — full complaint lifecycle
- RSP (Reconciliation & Settlement Protocol) — payment reconciliation
- Catalog validation and schema compliance
- Network policy and SLA enforcement
- Order state machine with audit trail

---

*This changelog follows [Keep a Changelog](https://keepachangelog.com) conventions.*

---

<p align="center">
  <sub>Maintained by <a href="https://dmj.one">dmj.one</a></sub>
</p>
