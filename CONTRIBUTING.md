# Contributing

Thank you for considering contributing to the [dmj.one](https://dmj.one) ONDC Beckn Network. Every contribution makes open commerce more accessible.

## Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/<your-username>/ondc-network-beckn.git
cd ondc-network-beckn
```

### 2. Install Dependencies

```bash
# Requires Node.js 22 and pnpm 10+
corepack enable
pnpm install
```

### 3. Set Up Local Environment

```bash
# Copy environment template
cp .env.example .env

# Start infrastructure
docker compose up postgres redis rabbitmq -d

# Run in development mode
pnpm dev
```

### 4. Run Tests

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
```

## Development Workflow

### Branch Naming

```
feature/<description>     New functionality
fix/<description>         Bug fix
docs/<description>        Documentation only
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

1. Create a branch from `main`
2. Make focused, incremental changes
3. Ensure all tests pass (`pnpm test`)
4. Ensure the build succeeds (`pnpm build`)
5. Write a clear PR description explaining **what** and **why**
6. Link related issues

### CI Pipeline

Every push to `main` and every PR triggers:

- **Build** — Turborepo builds all packages in dependency order
- **Test** — Vitest runs all test suites
- **Docker Build** — Changed services are built and pushed to GHCR (on merge to `main`)

CI uses the same Node.js and pnpm versions defined in `package.json` (`packageManager` field). If CI fails, check locally with `pnpm build && pnpm test`.

## Project Structure

Understanding where to make changes:

| What You're Changing | Where |
|---------------------|-------|
| Beckn protocol logic | `packages/shared/src/protocol/` |
| Cryptographic operations | `packages/shared/src/crypto/` |
| Middleware (rate limit, auth, etc.) | `packages/shared/src/middleware/` |
| Database schema | `packages/shared/src/db/schema.ts` + `db/init.sql` |
| Registry API | `packages/registry/src/` |
| Gateway routing | `packages/gateway/src/` |
| BAP/BPP adapters | `packages/bap/src/` or `packages/bpp/src/` |
| Admin dashboard | `packages/admin/src/` |
| Agent services | `packages/<agent>/src/` |
| Docker config | `docker-compose.yml` / `docker-compose.prod.yml` / `docker-compose.deploy.yml` / Dockerfiles |
| Nginx routing | `nginx/nginx.conf` |
| CI/CD workflows | `.github/workflows/ci.yml`, `.github/workflows/docker.yml` |
| Deployment scripts | `autoconfig.sh`, `simulate.sh`, `teardown.sh`, `scripts/setup-server.sh`, `scripts/deploy.sh` |

## Code Style

- **TypeScript strict mode** — No `any`, no implicit returns
- **ESM** — Use `import`/`export`, file extensions in imports (`.js`)
- **Functional middleware** — Factory functions that return Fastify plugins
- **Drizzle ORM** — Type-safe queries, no raw SQL in application code
- **Pino logging** — Structured JSON logs, no `console.log`

## Testing

- **Unit tests** co-locate with source: `foo.ts` → `foo.test.ts`
- **Integration tests** in `tests/integration/`
- **E2E tests** in `tests/e2e/`
- **Test runner:** Vitest
- **Coverage target:** Maintain or improve existing coverage

## Security

If you discover a security vulnerability, please **do not** open a public issue. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this standard.

## Questions?

Open a [Discussion](https://github.com/divyamohan1993/ondc-network-beckn/discussions) for questions, ideas, or feedback.

---

*Your contributions help make digital commerce open and accessible for everyone.*

---

<p align="center">
  <sub>A <a href="https://dmj.one">dmj.one</a> initiative</sub>
</p>
