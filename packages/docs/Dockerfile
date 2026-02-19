# Stage 1: Build the application
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/docs/package.json packages/docs/
RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/docs/ packages/docs/

ENV NEXT_TELEMETRY_DISABLED=1
RUN cd packages/docs && pnpm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone in a monorepo preserves directory structure
COPY --from=builder --chown=nextjs:nodejs /app/packages/docs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/docs/.next/static ./packages/docs/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "packages/docs/server.js"]
