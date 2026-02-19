FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/registry/package.json packages/registry/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/registry/ packages/registry/
RUN pnpm --filter @ondc/shared build && pnpm --filter @ondc/registry build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/registry/package.json packages/registry/
COPY --from=builder /app/packages/registry/dist packages/registry/dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/packages/shared/node_modules packages/shared/node_modules/
COPY --from=builder /app/packages/registry/node_modules packages/registry/node_modules/
WORKDIR /app/packages/registry
EXPOSE 3001
CMD ["node", "dist/server.js"]
