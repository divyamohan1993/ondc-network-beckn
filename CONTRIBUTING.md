# Contributing

Contributions welcome. Every contribution makes open commerce more accessible.

## Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/<your-username>/ondc-network-beckn.git
cd ondc-network-beckn
```

### 2. Install Dependencies

```bash
# Requires Node.js 22+ and pnpm 10+
corepack enable
pnpm install
```

### 3. Local Environment

```bash
cp .env.example .env

# Start infrastructure
docker compose up postgres redis rabbitmq -d

# Run all services in dev mode
pnpm dev

# Or run a single service
pnpm --filter @ondc/registry dev
```

### 4. Run Tests

```bash
pnpm test              # ~1400 tests across 42 files
pnpm test:watch        # Watch mode
pnpm test:coverage     # V8 coverage report
pnpm test:ui           # Browser-based test UI
```

## Development Workflow

### Branch Naming

```
feature/<description>     New functionality
fix/<description>         Bug fix
docs/<description>        Documentation
refactor/<description>    Code restructuring
test/<description>        Test additions
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat(gateway): add response timeout configuration
fix(registry): handle duplicate subscriber_id on registration
docs: update deployment instructions for ARM64
test(shared): add middleware chain integration tests
refactor(bap): extract order state machine to shared package
```

### Pull Requests

1. Branch from `main`
2. Make focused, incremental changes
3. `pnpm build && pnpm test` must pass
4. Clear PR description explaining what and why
5. Link related issues

### CI Pipeline

Every push triggers:

- **Build** -- Turborepo builds all 15 packages in dependency order
- **Test** -- Vitest runs all test suites
- **Docker Build** -- changed services built and pushed to GHCR (on merge to `main`)

## Where to Make Changes

| What | Where |
|------|-------|
| Beckn protocol logic | `packages/shared/src/protocol/` |
| Cryptography (Ed25519, PQ, PII) | `packages/shared/src/crypto/` + `packages/shared/src/utils/pii-guard.ts` |
| Middleware (rate limit, auth, etc.) | `packages/shared/src/middleware/` |
| Compliance (DPDPA, IT Act, CPA, GST) | `packages/shared/src/compliance/` |
| Database schema | `packages/shared/src/db/schema.ts` + `db/init.sql` |
| Payment/notification services | `packages/shared/src/services/` |
| Registry API | `packages/registry/src/` |
| Gateway routing | `packages/gateway/src/` |
| BAP/BPP adapters | `packages/bap/src/` or `packages/bpp/src/` |
| Buyer storefront | `packages/buyer-app/src/` |
| Seller dashboard | `packages/seller-app/src/` |
| Admin dashboard | `packages/admin/src/` |
| Agent services | `packages/<agent>/src/` |
| Docker config | `docker-compose*.yml` and Dockerfiles |
| Nginx routing | `nginx/nginx.conf` |
| Monitoring | `monitoring/prometheus.yml`, `monitoring/alerts.yml` |
| CI/CD | `.github/workflows/` |
| Scripts | `autoconfig.sh`, `simulate.sh`, `teardown.sh`, `scripts/` |

## Code Style

- **TypeScript strict mode** -- no `any`, no implicit returns
- **ESM** -- `import`/`export`, file extensions in imports (`.js`)
- **Functional middleware** -- factory functions returning Fastify plugins
- **Drizzle ORM** -- type-safe queries, no raw SQL in application code
- **Pino logging** -- structured JSON, no `console.log`
- **i18n** -- buyer-app and seller-app use i18n for all user-facing strings (Hindi + English baseline)

## Testing

- Unit tests co-locate with source: `foo.ts` -> `foo.test.ts`
- Integration tests in `tests/integration/`
- E2E tests in `tests/e2e/`
- Runner: Vitest with V8 coverage
- Target: maintain or improve existing coverage

## Security

If you discover a security vulnerability, **do not** open a public issue. See [SECURITY.md](SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Open a [Discussion](https://github.com/divyamohan1993/ondc-network-beckn/discussions).
