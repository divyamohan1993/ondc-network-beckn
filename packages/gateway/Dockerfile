FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/gateway/package.json packages/gateway/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/gateway/ packages/gateway/
RUN pnpm --filter @ondc/shared build && pnpm --filter @ondc/gateway build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/gateway/package.json packages/gateway/
COPY --from=builder /app/packages/gateway/dist packages/gateway/dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/packages/shared/node_modules packages/shared/node_modules/
COPY --from=builder /app/packages/gateway/node_modules packages/gateway/node_modules/
WORKDIR /app/packages/gateway
EXPOSE 3002
CMD ["node", "dist/server.js"]
