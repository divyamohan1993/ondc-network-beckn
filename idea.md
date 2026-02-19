# ONDC Platform — Implementation Blueprint

## The One-Liner

```bash
git clone https://github.com/youruser/ondc-platform.git && cd ondc-platform && sudo bash autoconfig.sh
```

That's it. Blank Ubuntu VM → fully running, production-grade Beckn network. Destroy the VM when done. Spin up a new one when needed. Or keep it running forever for real users.

---

## Two Deployment Modes

### Mode 1: Ephemeral (Test / Demo / Development)

```bash
# Spin up a GCloud/AWS VM
# SSH in
git clone https://github.com/youruser/ondc-platform.git
cd ondc-platform
sudo bash autoconfig.sh            # Installs everything, starts all services
sudo bash simulate.sh --baps 5 --bpps 20 --orders 500   # Populate with fake but realistic data
# ... use it, test against it, demo it ...
# When done: destroy the VM. Nothing to clean up.
```

**Use cases:**
- Testing a new app (JalSeva, agriculture platform) against a real Beckn network
- Classroom demos / hackathons — every team gets their own ONDC
- Load testing with thousands of simulated transactions
- Development environment that mirrors production exactly

### Mode 2: Permanent (Production)

```bash
# Spin up a VM, point DNS to it
git clone https://github.com/youruser/ondc-platform.git
cd ondc-platform
sudo bash autoconfig.sh --production   # Same script, enables persistent volumes + backups + SSL hardening
# Real participants register through the subscribe API or admin dashboard
# You govern the network through admin.ondc.dmj.one
```

**Use cases:**
- Running your own Beckn network for real commerce
- Private ONDC for an organization, university, or city
- Staging environment that mirrors government ONDC exactly

The **only difference** between modes is a `--production` flag that enables PostgreSQL persistent volumes, automated backups, and stricter rate limits. The code, APIs, signing — all identical.

---

## What `autoconfig.sh` Does (The Full Lifecycle)

```
sudo bash autoconfig.sh [--production] [--domain ondc.dmj.one]
```

Step by step, non-interactively (all config via flags or env, with sane defaults):

```
 1. Detect OS (Ubuntu 22/24), check minimum specs (2 cores, 4GB RAM)
 2. Install system dependencies: Docker, Docker Compose, curl, jq
 3. Copy .env.example → .env
 4. Generate Ed25519 key pairs for: registry, gateway (automatic, no prompts)
 5. Generate random admin password (or accept via --admin-password flag)
 6. Generate random PostgreSQL password, Redis password, RabbitMQ credentials
 7. Write all generated values into .env
 8. docker compose build        (builds all 6 services from Dockerfiles)
 9. docker compose up -d        (starts everything: Postgres, Redis, RabbitMQ, 6 services, Nginx)
10. Wait for Postgres to be ready (healthcheck loop)
11. Run database migrations      (creates all tables)
12. Run seed script              (admin user, default domains, default cities)
13. Register registry + gateway as network participants in their own registry
14. Run health check             (hit /health on all 6 services)
15. Print summary:
    ┌──────────────────────────────────────────────────────────┐
    │  ONDC Platform Ready                                      │
    │                                                           │
    │  Admin Dashboard:  https://admin.ondc.dmj.one             │
    │  Registry:         https://registry.ondc.dmj.one          │
    │  Gateway:          https://gateway.ondc.dmj.one           │
    │  BAP Adapter:      https://bap.ondc.dmj.one               │
    │  BPP Adapter:      https://bpp.ondc.dmj.one               │
    │  Documentation:    https://ondc.dmj.one                   │
    │                                                           │
    │  Admin Login:      admin@ondc.dmj.one / <generated>       │
    │                                                           │
    │  To simulate data: sudo bash simulate.sh --baps 5 --bpps 20│
    │  To tear down:     docker compose down -v                  │
    └──────────────────────────────────────────────────────────┘
```

If `--production` flag is set, additionally:
- Enables PostgreSQL volume mounts for data persistence across restarts
- Sets up a daily pg_dump cron job to `/backups/`
- Enables RabbitMQ durable queues
- Sets stricter rate limits
- Disables simulation endpoints (real network only)

---

## What `simulate.sh` Does (Fake-but-Realistic Data)

```bash
sudo bash simulate.sh [options]
```

| Flag | Default | What it does |
|------|---------|-------------|
| `--baps N` | 3 | Register N simulated buyer platforms (BAPs) with real Ed25519 keys |
| `--bpps N` | 10 | Register N simulated seller platforms (BPPs) with catalogs |
| `--orders N` | 100 | Generate N complete order flows (search→select→init→confirm→status→track) |
| `--domains` | all | Which domains to populate: `water,food,agriculture,logistics` |
| `--cities` | all seeded | Which cities to spread across |
| `--live` | false | If true, runs continuous simulation (1 order/second) until stopped |
| `--reset` | false | Wipe all simulated data first |

**What it creates:**

For each simulated **BAP** (buyer platform):
- A real Ed25519 key pair (generated, registered in registry via /subscribe)
- A subscriber entry with status SUBSCRIBED
- A realistic name: "FreshKart Delhi", "AquaFlow Bangalore", "KisanDirect Mumbai"
- A callback URL pointing to a built-in mock server (included in the platform)

For each simulated **BPP** (seller/provider):
- A real Ed25519 key pair
- A subscriber entry with status SUBSCRIBED
- A realistic catalog with 5-50 items per provider, domain-specific:
  - **Water delivery**: "20L Bisleri Can ₹80", "500L Tanker ₹1200", "RO Water 20L ₹40"
  - **Agriculture**: "Basmati Rice 25kg ₹1800", "Urea Fertilizer 50kg ₹600"
  - **Food delivery**: "Chicken Biryani ₹250", "Masala Dosa ₹120"
  - **Logistics**: "Same-day Courier 5kg ₹150", "Warehouse Storage 100sqft ₹5000/mo"

For each simulated **order**:
- A complete transaction chain through the Beckn protocol:
  1. BAP sends `search` → Gateway fans out → BPP returns `on_search` with catalog
  2. BAP sends `select` → BPP returns `on_select` with quote
  3. BAP sends `init` → BPP returns `on_init` with payment details
  4. BAP sends `confirm` → BPP returns `on_confirm` with order ID
  5. BAP sends `status` → BPP returns `on_status` (processing/shipped/delivered)
  6. BAP sends `track` → BPP returns `on_track` with location
- **Every request is cryptographically signed** — identical to real traffic
- **Every transaction is logged** in the transactions table with realistic timestamps and latencies
- Transactions are spread across the configured time window with realistic distribution (more orders during 10am-2pm, fewer at night)

The simulation data is **indistinguishable from real traffic** at the protocol level. The admin dashboard will show charts, analytics, and audit logs exactly as if real participants were trading. This is intentional — it's how you test, demo, and validate before going live.

**`--live` mode** runs an infinite loop generating realistic traffic patterns — useful for load testing or live demos where you want the dashboard to show real-time activity.

---

## Architecture Overview

```
                         ┌──────────────────────────────────────────────┐
                         │           VM (any cloud provider)            │
                         │                                              │
   Internet              │   ┌─────────┐                               │
   ───────►  Cloudflare  │   │  Nginx  │  Reverse Proxy                │
             (SSL/DNS)   │   │  :80    │  Routes by subdomain          │
                         │   └────┬────┘                               │
                         │        │                                     │
          ┌──────────────┼────────┼──────────────────────────────┐     │
          │              │        ▼                                │     │
          │  ┌────────────────────────────────────────────────┐  │     │
          │  │  registry :3001  │  gateway :3002               │  │     │
          │  │  admin    :3003  │  bap     :3004               │  │     │
          │  │  bpp      :3005  │  docs    :3000               │  │     │
          │  │  mock-srv :3010  │  (handles sim BAP/BPP cbs)   │  │     │
          │  └────────────────────────────────────────────────┘  │     │
          │              │                                        │     │
          │  ┌────────────────────────────────────────────────┐  │     │
          │  │  PostgreSQL :5432  │  Redis :6379               │  │     │
          │  │  RabbitMQ :5672   │                             │  │     │
          │  └────────────────────────────────────────────────┘  │     │
          │              Docker Compose Network                    │     │
          └───────────────────────────────────────────────────────┘     │
                         └──────────────────────────────────────────────┘
```

**New component: `mock-server` (:3010)** — An internal service that acts as the "application backend" for all simulated BAPs and BPPs. When a simulated BPP receives a search, the mock server generates a realistic catalog response. When a simulated BAP gets a callback, the mock server logs it. This is what makes simulation work without needing N actual application backends running. In production mode, this service is disabled — real apps provide their own backends.

---

## Monorepo Structure

```
ondc-platform/
│
├── autoconfig.sh                    # Blank VM → running platform (the entry point)
├── simulate.sh                      # Populate with N simulated BAPs/BPPs/orders
├── teardown.sh                      # Clean shutdown: docker compose down, optional volume wipe
├── docker-compose.yml               # Entire stack
├── docker-compose.prod.yml          # Production overrides (persistent volumes, backup cron)
├── .env.example                     # All config vars with documentation
├── .gitignore                       # Ignores .env, node_modules, data volumes, backups
│
├── nginx/
│   ├── nginx.conf                   # Subdomain → port routing (templated by autoconfig.sh)
│   └── nginx.conf.template          # Template with {{DOMAIN}} placeholders
│
├── packages/
│   ├── shared/                      # Shared crypto + protocol library
│   │   ├── src/
│   │   │   ├── crypto/
│   │   │   │   ├── ed25519.ts       # Key generation, sign, verify (using @noble/ed25519)
│   │   │   │   ├── blake512.ts      # BLAKE-512 hashing (using blakejs)
│   │   │   │   ├── x25519.ts        # X25519 encryption key pairs
│   │   │   │   └── auth-header.ts   # Build & parse Authorization / X-Gateway-Authorization
│   │   │   ├── protocol/
│   │   │   │   ├── context.ts       # Beckn context builder
│   │   │   │   ├── ack.ts           # ACK/NACK response builder
│   │   │   │   ├── validator.ts     # Beckn packet validation
│   │   │   │   └── types.ts         # All Beckn TypeScript types
│   │   │   ├── middleware/
│   │   │   │   ├── sign-request.ts  # Outgoing request signing
│   │   │   │   ├── verify-auth.ts   # Incoming signature verification
│   │   │   │   └── error-handler.ts # Standard error responses
│   │   │   └── utils/
│   │   │       ├── registry-client.ts
│   │   │       └── logger.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── registry/                    # :3001 — Beckn Registry
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── subscribe.ts     # POST /subscribe
│   │   │   │   ├── on-subscribe.ts  # POST /on_subscribe
│   │   │   │   └── lookup.ts        # POST /lookup
│   │   │   ├── services/
│   │   │   │   ├── subscriber.ts
│   │   │   │   ├── challenge.ts
│   │   │   │   └── key-store.ts
│   │   │   └── db/
│   │   │       ├── schema.ts        # Drizzle schema
│   │   │       └── migrations/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── gateway/                     # :3002 — Beckn Gateway
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── search.ts
│   │   │   │   └── on-search.ts
│   │   │   └── services/
│   │   │       ├── discovery.ts
│   │   │       ├── multicast.ts
│   │   │       └── response-agg.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── bap/                         # :3004 — Reference BAP Adapter
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── actions/         # 10 action endpoints (search, select, init, confirm, ...)
│   │   │   │   └── callbacks/       # 10 callback endpoints (on_search, on_select, ...)
│   │   │   ├── services/
│   │   │   │   ├── beckn-client.ts
│   │   │   │   └── webhook.ts
│   │   │   └── api/
│   │   │       └── client-api.ts    # Simplified API for buyer apps
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── bpp/                         # :3005 — Reference BPP Adapter
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── actions/         # 10 incoming action endpoints
│   │   │   │   └── callbacks/       # 10 outgoing callback endpoints
│   │   │   ├── services/
│   │   │   │   ├── catalog.ts
│   │   │   │   └── webhook.ts
│   │   │   └── api/
│   │   │       └── provider-api.ts  # Simplified API for seller apps
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── admin/                       # :3003 — Admin Dashboard (Next.js)
│   │   ├── src/app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx             # Dashboard overview
│   │   │   ├── login/page.tsx
│   │   │   ├── participants/page.tsx
│   │   │   ├── participants/[id]/page.tsx
│   │   │   ├── domains/page.tsx
│   │   │   ├── transactions/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── health/page.tsx
│   │   │   ├── audit/page.tsx
│   │   │   ├── keys/page.tsx
│   │   │   ├── cities/page.tsx
│   │   │   ├── policies/page.tsx
│   │   │   ├── simulation/page.tsx  # NEW: trigger simulation from UI
│   │   │   └── api/                 # Internal API routes
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── docs/                        # :3000 — Landing Page + Documentation
│   │   ├── src/app/
│   │   │   ├── page.tsx             # Landing page
│   │   │   └── docs/               # Onboarding, integration, signing guides
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── mock-server/                 # :3010 — Simulation Backend (NEW)
│       ├── src/
│       │   ├── server.ts
│       │   ├── bap-mock.ts          # Handles callbacks for simulated BAPs
│       │   ├── bpp-mock.ts          # Handles actions for simulated BPPs (generates catalog, fulfills orders)
│       │   └── data/
│       │       ├── catalogs/        # Realistic catalog templates per domain
│       │       │   ├── water.json
│       │       │   ├── food.json
│       │       │   ├── agriculture.json
│       │       │   └── logistics.json
│       │       ├── providers.json   # Realistic provider names per domain
│       │       └── locations.json   # GPS coords, addresses per city
│       ├── Dockerfile
│       └── package.json
│
├── scripts/
│   ├── keygen.ts                    # Generate Ed25519 + X25519 key pairs (CLI)
│   ├── seed.ts                      # Seed: admin user, domains, cities
│   ├── simulate.ts                  # Core simulation logic (called by simulate.sh)
│   ├── health-check.ts             # Verify all services respond
│   └── export-data.ts              # Export transactions/analytics as CSV/JSON (for reporting)
│
├── db/
│   └── init.sql                     # Create database, enable extensions (uuid-ossp, pgcrypto)
│
├── backups/                         # (gitignored) pg_dump files in production mode
│
├── turbo.json
├── package.json                     # Root workspace: pnpm workspaces
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript (strict) | Type safety across all protocol objects |
| Runtime | Node.js 20 LTS | Stable, wide library support |
| Monorepo | Turborepo + pnpm workspaces | Fast builds, shared packages |
| Protocol Services | Fastify | Fastest Node.js HTTP framework, schema validation built-in |
| Admin Dashboard | Next.js 14 (App Router) | SSR, API routes, React Server Components |
| Docs Portal | Next.js 14 (static export) | Same stack, MDX for documentation |
| Database | PostgreSQL 16 | JSONB for Beckn messages, strong indexing |
| ORM | Drizzle ORM | Type-safe, lightweight, migrations |
| Cache | Redis 7 | Response cache, rate limiting, pub/sub |
| Message Queue | RabbitMQ 3.13 | Async gateway fan-out, dead-letter queues |
| Crypto | `@noble/ed25519` + `blakejs` | Pure JS, audited, no native deps |
| Auth (Admin) | NextAuth.js (credentials) | Email/password, JWT sessions |
| Reverse Proxy | Nginx | Subdomain routing, one config |
| Containers | Docker + Docker Compose | Single `docker compose up` for everything |
| SSL | Cloudflare (proxy mode) | Free SSL, no certbot needed |

---

## Database Schema

```
subscribers
├── id (uuid, PK)
├── subscriber_id (text, unique)       — "jalseva.dmj.one"
├── subscriber_url (text)              — callback URL
├── type (enum: BAP, BPP, BG)
├── domain (text)                      — "nic2004:49299" (water delivery)
├── city (text)                        — "std:011"
├── signing_public_key (text)          — Ed25519 public key (base64)
├── encr_public_key (text)             — X25519 encryption key (base64)
├── unique_key_id (text)
├── status (enum: INITIATED, UNDER_SUBSCRIPTION, SUBSCRIBED, SUSPENDED, REVOKED)
├── valid_from (timestamp)
├── valid_until (timestamp)
├── webhook_url (text)                 — where to forward callbacks
├── is_simulated (boolean, default false) — marks simulated participants for easy cleanup
├── created_at (timestamp)
└── updated_at (timestamp)

domains
├── id (uuid, PK)
├── code (text, unique)                — "nic2004:49299"
├── name (text)                        — "Water Delivery"
├── description (text)
├── schema_version (text)
├── is_active (boolean)
└── created_at (timestamp)

cities
├── id (uuid, PK)
├── code (text, unique)                — "std:011"
├── name (text)                        — "Delhi"
├── state (text)
└── is_active (boolean)

transactions
├── id (uuid, PK)
├── transaction_id (text, indexed)     — Beckn transaction_id
├── message_id (text, indexed)         — Beckn message_id
├── action (text)                      — search, select, init, confirm, etc.
├── bap_id (text, FK → subscribers)
├── bpp_id (text, FK → subscribers)
├── domain (text)
├── city (text)
├── request_body (jsonb)
├── response_body (jsonb)
├── status (enum: SENT, ACK, NACK, CALLBACK_RECEIVED, TIMEOUT, ERROR)
├── error (jsonb)
├── latency_ms (integer)
├── is_simulated (boolean, default false)
├── created_at (timestamp)
└── updated_at (timestamp)

audit_logs
├── id (uuid, PK)
├── actor (text)
├── action (text)                      — "registry.lookup", "participant.approve"
├── resource_type (text)
├── resource_id (text)
├── details (jsonb)
├── ip_address (text)
└── created_at (timestamp)             — immutable, no updated_at

admin_users
├── id (uuid, PK)
├── email (text, unique)
├── password_hash (text)               — bcrypt
├── name (text)
├── role (enum: SUPER_ADMIN, ADMIN, VIEWER)
├── is_active (boolean)
├── created_at (timestamp)
└── last_login (timestamp)

network_policies
├── id (uuid, PK)
├── domain (text, nullable)            — null = global
├── key (text)                         — "max_response_time_ms"
├── value (jsonb)
├── description (text)
└── updated_at (timestamp)

simulation_runs                         — NEW: track simulation sessions
├── id (uuid, PK)
├── started_at (timestamp)
├── completed_at (timestamp)
├── config (jsonb)                     — { baps: 5, bpps: 20, orders: 500, domains: [...] }
├── stats (jsonb)                      — { created_baps: 5, created_bpps: 20, orders_completed: 487 }
└── status (enum: RUNNING, COMPLETED, FAILED)
```

**Key detail:** `is_simulated` flag on subscribers and transactions. This lets you:
- Filter simulated vs. real data in the admin dashboard
- Wipe all simulated data with one command (`simulate.sh --reset`) without touching real participants
- Run simulations alongside real traffic in production if needed (for load testing)

---

## Implementation Plan — Phase by Phase

### Phase 1: Foundation (Shared Crypto + Protocol Library)

Build `packages/shared` — the library every service imports.

| Module | What it does |
|--------|-------------|
| `crypto/ed25519.ts` | `generateKeyPair()`, `sign(message, privateKey)`, `verify(message, signature, publicKey)` using `@noble/ed25519` |
| `crypto/blake512.ts` | `hash(body)` → base64 digest using `blakejs` |
| `crypto/x25519.ts` | `generateEncryptionKeyPair()`, `encrypt(data, publicKey)`, `decrypt(data, privateKey)` |
| `crypto/auth-header.ts` | `buildAuthHeader(subscriberId, uniqueKeyId, privateKey, body)` → full Authorization header string. `parseAuthHeader(header)` → { keyId, algorithm, created, expires, signature }. `buildGatewayAuthHeader(...)` → X-Gateway-Authorization |
| `protocol/types.ts` | TypeScript interfaces for all Beckn objects: Context, Message, SearchIntent, Catalog, Order, Provider, Item, Fulfillment, etc. |
| `protocol/context.ts` | `buildContext(action, domain, city, bapId, bapUri, bppId?, bppUri?)` → valid Beckn context with generated UUIDs and timestamps |
| `protocol/ack.ts` | `ack()` → `{ message: { ack: { status: "ACK" } } }`. `nack(error)` → NACK with error details |
| `protocol/validator.ts` | Validate incoming Beckn packets: required fields present, valid enums, UUID format, timestamp not expired |
| `middleware/sign-request.ts` | Fastify preHandler: signs outgoing requests automatically |
| `middleware/verify-auth.ts` | Fastify preHandler: verifies incoming Authorization header, calls registry /lookup to get public key |
| `middleware/error-handler.ts` | Standard Beckn error responses |
| `utils/registry-client.ts` | HTTP client for `/lookup` and `/subscribe` with Redis caching |
| `utils/logger.ts` | Structured JSON logger (pino) |

**Verification:** Unit tests — sign/verify round-trip, header format matches ONDC spec character-by-character.

---

### Phase 2: Registry Service (:3001)

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/subscribe` | POST | Receive subscriber details → generate challenge → encrypt with their X25519 key → return challenge |
| `/on_subscribe` | POST | Receive decrypted challenge → verify → mark subscriber SUBSCRIBED |
| `/lookup` | POST | Find subscribers by subscriber_id, domain, city, type. Response format matches ONDC exactly |
| `/health` | GET | Service health check |

**Subscribe flow (matches government ONDC exactly):**
1. New participant calls `POST /subscribe` with: subscriber_id, subscriber_url, type, domain, city, signing_public_key, encr_public_key
2. Registry generates random challenge, encrypts it with participant's encr_public_key
3. Registry returns `{ challenge: "<encrypted>" }`
4. Participant decrypts challenge with their encr_private_key
5. Participant calls `POST /on_subscribe` with `{ answer: "<decrypted_challenge>" }`
6. Registry verifies → status becomes SUBSCRIBED
7. All steps logged to audit_logs

**Admin internal API** (called by admin dashboard, not public):
- `GET /internal/subscribers` — list, filter, paginate
- `PATCH /internal/subscribers/:id` — approve, suspend, revoke
- `GET /internal/subscribers/:id/transactions` — transaction history

---

### Phase 3: Gateway Service (:3002)

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/search` | POST | Receive from BAP → verify signature → lookup matching BPPs → fan out search → return ACK |
| `/on_search` | POST | Receive from BPPs → verify signature → forward to originating BAP |
| `/health` | GET | Service health check |

**Search fan-out flow:**
1. BAP sends signed `POST /search` to gateway
2. Gateway verifies BAP's Authorization header (registry lookup for public key)
3. Gateway extracts `context.domain` + `context.city`
4. Gateway calls registry `/lookup` to find all SUBSCRIBED BPPs matching domain+city
5. For each matching BPP: queue a signed search request in RabbitMQ
6. Return immediate ACK to BAP
7. RabbitMQ workers deliver search to each BPP, adding `X-Gateway-Authorization` header
8. BPPs process search, send `POST /on_search` back to gateway
9. Gateway forwards `on_search` to BAP's callback URL (from `context.bap_uri`)

**Gateway is ONLY for discovery.** select, init, confirm, etc. are peer-to-peer.

---

### Phase 4: BAP Protocol Adapter (:3004)

**Protocol endpoints (Beckn-facing):**
- 10 outgoing actions: `/search`, `/select`, `/init`, `/confirm`, `/status`, `/track`, `/cancel`, `/update`, `/rating`, `/support`
- 10 incoming callbacks: `/on_search`, `/on_select`, `/on_init`, `/on_confirm`, `/on_status`, `/on_track`, `/on_cancel`, `/on_update`, `/on_rating`, `/on_support`

**Simplified client API (app-facing):**

| Endpoint | What the buyer app sends | What happens under the hood |
|----------|-------------------------|---------------------------|
| `POST /api/search` | `{ domain, city, query }` | Builds full Beckn context + search intent, signs, sends to gateway |
| `POST /api/select` | `{ transaction_id, provider_id, items }` | Builds Beckn select message, signs, sends directly to BPP |
| `POST /api/init` | `{ transaction_id, billing, fulfillment }` | Builds Beckn init, signs, sends to BPP |
| `POST /api/confirm` | `{ transaction_id, payment }` | Builds Beckn confirm, signs, sends to BPP |
| `GET /api/orders/:txn_id` | — | Returns order status from local transaction log |
| `POST /api/webhooks` | `{ url, events }` | Register callback URL for receiving async responses |

The buyer app never touches Beckn protocol directly. It calls the simplified API, gets callbacks at its webhook URL.

---

### Phase 5: BPP Protocol Adapter (:3005)

**Protocol endpoints (Beckn-facing):**
- 10 incoming actions: receives from BAPs/Gateway, verifies signatures (both Authorization + X-Gateway-Authorization for search)
- 10 outgoing callbacks: signs with BPP's key, sends to BAP's callback URL

**Simplified provider API (app-facing):**

| Endpoint | What the seller app sends | What happens |
|----------|-------------------------|-------------|
| `POST /api/catalog` | `{ provider, items[] }` | Stores catalog, used to generate on_search responses |
| `PUT /api/catalog/items/:id` | `{ price, stock, active }` | Update individual items |
| `POST /api/fulfill/:order_id` | `{ status, tracking }` | Sends on_status/on_track callbacks to BAP |
| `GET /api/orders` | — | Lists incoming orders |
| `POST /api/webhooks` | `{ url, events }` | Register webhook for receiving actions |

---

### Phase 6: Mock Server (:3010) — Simulation Backend

This is the "brain" behind simulated participants. When simulate.sh creates fake BAPs and BPPs, their webhook URLs point to this mock server.

**For simulated BPPs:**
- When a search arrives, mock server looks up the BPP's catalog template (from `data/catalogs/{domain}.json`)
- Generates a realistic `on_search` response with items, prices, provider details
- Signs and sends back through the BPP adapter

**For simulated BAPs:**
- When an `on_search` callback arrives, mock server can optionally continue the flow (select → init → confirm) to generate complete order chains
- Logs all received callbacks

**Catalog templates** (`packages/mock-server/src/data/catalogs/`):
```
water.json     — 30+ items: tankers of various sizes, bottled water, RO refills
food.json      — 50+ items: restaurant menus, grocery items, snacks
agriculture.json — 40+ items: seeds, fertilizers, equipment, produce
logistics.json — 20+ items: courier services, warehouse space, fleet rental
healthcare.json — 25+ items: medicines, lab tests, consultations
retail.json    — 35+ items: electronics, clothing, home goods
```

Each item has: name, price (INR), description, category, images (placeholder URLs), fulfillment options, availability.

**Provider templates** (`providers.json`):
```json
{
  "water": ["AquaPure Delhi", "BlueWater Tankers", "JalMitra Services", ...],
  "food": ["Spice Kitchen", "Tandoori Nights", "Green Bowl Cafe", ...],
  "agriculture": ["KisanMandi", "AgriGold Seeds", "FarmFresh Direct", ...]
}
```

---

### Phase 7: Admin Dashboard (:3003)

Next.js 14 application. All pages talk to internal API routes that query PostgreSQL.

| Page | What it shows |
|------|--------------|
| **Dashboard** (`/`) | Network overview cards: total BAPs, total BPPs, transactions today, active domains. Line charts: transaction volume (7d), search volume, order volume. Success/failure rate pie chart |
| **Participants** (`/participants`) | Table: subscriber_id, type, domain, city, status, created_at. Filters: type, domain, status, simulated/real. Actions: approve, suspend, revoke. Click → detail page with keys, URLs, transaction history |
| **Domains** (`/domains`) | List all domains with participant counts per domain. Create/edit/disable. Each domain shows: code, name, active BAPs count, active BPPs count |
| **Transactions** (`/transactions`) | Searchable table: transaction_id, action, BAP, BPP, domain, status, latency, timestamp. Filters: domain, action, status, date range, simulated/real. Click → full request/response JSON viewer |
| **Analytics** (`/analytics`) | Charts: transactions by domain over time, search→order conversion funnel, average latency by BPP (identify slow providers), top participants by volume, geographic heat map by city |
| **Network Health** (`/health`) | Service cards (registry, gateway, BAP, BPP, mock-server): green/red status, uptime, last response time. RabbitMQ: queue depth, consumers, message rates. PostgreSQL: connection pool, active queries. Redis: memory usage, hit rate |
| **Audit Logs** (`/audit`) | Immutable log: actor, action, resource, timestamp. Filter by actor, action type, date range. Every registry lookup, every participant approval, every key rotation |
| **Key Management** (`/keys`) | Participant keys: key ID, algorithm, creation date, expiry (NOT private key values). Gateway/registry key rotation with confirmation dialog |
| **Cities** (`/cities`) | City management: code, name, state, active status. Add new cities, bulk import |
| **Policies** (`/policies`) | Network policy editor: max response timeout, rate limits, mandatory fields per domain, allowed domains list |
| **Simulation** (`/simulation`) | **NEW:** Trigger simulations from the UI. Set BAPs, BPPs, orders count. Start/stop live simulation. View simulation run history. One-click "Reset simulated data" button |

**Auth:** Email/password login → JWT session. Roles: SUPER_ADMIN (full access + simulation controls), ADMIN (manage participants/domains), VIEWER (read-only dashboards).

---

### Phase 8: Documentation Portal (:3000)

| Page | Content |
|------|---------|
| **Landing** (`/`) | What is this network, how it compares to government ONDC, how to join. Visual architecture diagram |
| **Getting Started** (`/docs/onboarding`) | Step-by-step: 1) Generate keys with CLI, 2) Call /subscribe, 3) Complete challenge, 4) Set env vars, 5) Start making API calls |
| **Integration Guide** (`/docs/integration`) | Code examples in Node.js, Python, Go: full search→order flow |
| **Signing Tutorial** (`/docs/signing`) | Ed25519 + BLAKE-512 walkthrough with copy-paste code, test vectors |
| **API Reference** (`/docs/api`) | All endpoints for Registry, Gateway, BAP, BPP with request/response examples |
| **Domains** (`/docs/domains`) | Available domains, their NIC codes, schema expectations |
| **Migration Guide** (`/docs/migration`) | How to switch from this network to government ONDC: literally just change env vars |

---

### Phase 9: Infrastructure + Scripts

**docker-compose.yml:**
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment: [from .env]
    volumes: []                    # No volume in ephemeral mode
    healthcheck: pg_isready

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment: [from .env]

  registry:
    build: ./packages/registry
    depends_on: [postgres, redis]
    ports: ["3001:3001"]

  gateway:
    build: ./packages/gateway
    depends_on: [registry, rabbitmq, redis]
    ports: ["3002:3002"]

  bap:
    build: ./packages/bap
    depends_on: [registry, redis]
    ports: ["3004:3004"]

  bpp:
    build: ./packages/bpp
    depends_on: [registry, redis]
    ports: ["3005:3005"]

  admin:
    build: ./packages/admin
    depends_on: [postgres, redis]
    ports: ["3003:3003"]

  docs:
    build: ./packages/docs
    ports: ["3000:3000"]

  mock-server:
    build: ./packages/mock-server
    depends_on: [bap, bpp]
    ports: ["3010:3010"]
    profiles: ["simulation"]       # Only starts when simulation profile is active

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes: [./nginx/nginx.conf:/etc/nginx/nginx.conf]
    depends_on: [registry, gateway, bap, bpp, admin, docs]
```

**docker-compose.prod.yml** (production overrides):
```yaml
services:
  postgres:
    volumes:
      - pgdata:/var/lib/postgresql/data    # Persistent!
  mock-server:
    profiles: ["disabled"]                  # No simulation in production
volumes:
  pgdata:
```

**Usage:**
```bash
# Ephemeral (default)
docker compose up -d

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# With simulation mock server
docker compose --profile simulation up -d
```

**autoconfig.sh flags:**
```bash
sudo bash autoconfig.sh                           # Ephemeral, default domain
sudo bash autoconfig.sh --domain ondc.dmj.one     # Custom domain
sudo bash autoconfig.sh --production              # Persistent volumes + backups
sudo bash autoconfig.sh --admin-email admin@x.com # Custom admin credentials
sudo bash autoconfig.sh --admin-password secret   # (or auto-generated)
sudo bash autoconfig.sh --no-seed                 # Skip seeding (empty DB)
```

**simulate.sh wraps scripts/simulate.ts:**
```bash
sudo bash simulate.sh --baps 5 --bpps 20 --orders 500
sudo bash simulate.sh --domains water,food --cities std:011,std:022
sudo bash simulate.sh --live                      # Continuous traffic generation
sudo bash simulate.sh --reset                     # Wipe all is_simulated=true data
sudo bash simulate.sh --reset --bpps 50 --orders 2000   # Reset then repopulate
```

**teardown.sh:**
```bash
sudo bash teardown.sh              # docker compose down (keeps volumes)
sudo bash teardown.sh --volumes    # docker compose down -v (wipes everything)
sudo bash teardown.sh --full       # Also removes Docker images and system packages
```

---

## Signing Implementation (Byte-for-Byte ONDC Compatible)

```
Step 1: Hash the request body
  digest = BLAKE-512(JSON.stringify(requestBody))
  digest_base64 = base64(digest)

Step 2: Construct signing string
  created = Math.floor(Date.now() / 1000)
  expires = created + 300  (5-minute TTL)
  signing_string = "(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest_base64}"

Step 3: Sign with Ed25519
  signature = Ed25519.sign(signing_string, privateKey)
  signature_base64 = base64(signature)

Step 4: Build Authorization header
  Signature keyId="${subscriber_id}|${unique_key_id}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature_base64}"
```

Verification (receiver side):
1. Parse Authorization header → extract keyId, created, expires, signature
2. Split keyId → subscriber_id, unique_key_id
3. Call registry `/lookup` with subscriber_id → get signing_public_key
4. Reconstruct signing_string from request body + timestamps from header
5. Ed25519.verify(signing_string, signature, publicKey)
6. Check current time is between created and expires

---

## How Applications Connect (The Env-Var Promise)

**Your private network:**
```env
BECKN_REGISTRY_URL=https://registry.ondc.dmj.one
BECKN_GATEWAY_URL=https://gateway.ondc.dmj.one
BECKN_SUBSCRIBER_ID=jalseva.dmj.one
BECKN_SUBSCRIBER_URL=https://bap.jalseva.dmj.one/beckn
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

## Cloudflare DNS Setup

```
Type  Name            Content      Proxy
A     ondc            <VM-IP>      Proxied ☁️
A     registry.ondc   <VM-IP>      Proxied ☁️
A     gateway.ondc    <VM-IP>      Proxied ☁️
A     admin.ondc      <VM-IP>      Proxied ☁️
A     bap.ondc        <VM-IP>      Proxied ☁️
A     bpp.ondc        <VM-IP>      Proxied ☁️
```

SSL mode: **Flexible** (Cloudflare handles HTTPS, talks HTTP to Nginx on port 80).

---

## Build Order

```
Phase 1 ─── packages/shared (crypto + protocol + middleware)
Phase 2 ─── packages/registry (needs shared)
Phase 3 ─── packages/gateway (needs shared + registry)
Phase 4 ─── packages/bap (needs shared + registry)         ┐
Phase 5 ─── packages/bpp (needs shared + registry)         ├─ parallel
Phase 6 ─── packages/mock-server (needs bap + bpp)         ┘
Phase 7 ─── packages/admin (needs DB schema from Phase 2)
Phase 8 ─── packages/docs (standalone)
Phase 9 ─── docker-compose + nginx + autoconfig.sh + simulate.sh
```

---

## The Full Lifecycle

### Ephemeral Testing

```bash
# Morning: spin up a VM, clone, configure
gcloud compute instances create ondc-test --machine-type=e2-medium --image-family=ubuntu-2204-lts
gcloud compute ssh ondc-test
git clone https://github.com/youruser/ondc-platform.git && cd ondc-platform
sudo bash autoconfig.sh --domain test.ondc.dmj.one

# Populate with realistic data
sudo bash simulate.sh --baps 10 --bpps 50 --orders 2000

# Test your app against it
# Browse admin.test.ondc.dmj.one to see dashboards
# Run integration tests against registry.test.ondc.dmj.one

# Evening: destroy
gcloud compute instances delete ondc-test
# Gone. No cleanup needed. No lingering state. No cost.
```

### Permanent Production

```bash
# Deploy once
gcloud compute instances create ondc-prod --machine-type=e2-standard-2 --image-family=ubuntu-2204-lts
gcloud compute ssh ondc-prod
git clone https://github.com/youruser/ondc-platform.git && cd ondc-platform
sudo bash autoconfig.sh --production --domain ondc.dmj.one

# Real participants register via:
#   1. Generate keys:     npx tsx scripts/keygen.ts
#   2. Call /subscribe:   curl -X POST https://registry.ondc.dmj.one/subscribe ...
#   3. Admin approves:    admin.ondc.dmj.one → Participants → Approve

# Network runs indefinitely
# Admin monitors via admin.ondc.dmj.one
# Daily backups in /backups/
```

### Updating

```bash
cd ondc-platform
git pull
docker compose build
docker compose up -d
# Zero-downtime: Nginx keeps serving while containers restart
```

---

## What This Gives You

1. **One repo, one command** — `git clone && sudo bash autoconfig.sh` → fully running Beckn network
2. **Disposable or permanent** — use once and destroy, or run forever for real users
3. **Realistic simulation** — N suppliers, N consumers, complete order flows with signed Beckn traffic
4. **Full governance** — admin dashboard identical to what ONDC officials use
5. **Protocol-identical** — apps work on your network AND government ONDC with only env var changes
6. **Multi-domain** — water, food, agriculture, logistics, healthcare, retail — all on one platform
7. **GitHub-native** — version controlled, forkable, PR-able, CI/CD ready
