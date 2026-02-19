FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/health-monitor/package.json packages/health-monitor/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/health-monitor/ packages/health-monitor/
RUN pnpm --filter @ondc/shared build && pnpm --filter @ondc/health-monitor build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/health-monitor/package.json packages/health-monitor/
COPY --from=builder /app/packages/health-monitor/dist packages/health-monitor/dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/packages/shared/node_modules packages/shared/node_modules/
COPY --from=builder /app/packages/health-monitor/node_modules packages/health-monitor/node_modules/
WORKDIR /app/packages/health-monitor
EXPOSE 3008
CMD ["node", "dist/server.js"]
