FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/mock-server/package.json packages/mock-server/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/mock-server/ packages/mock-server/
RUN pnpm --filter @ondc/shared build && pnpm --filter @ondc/mock-server build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/mock-server/package.json packages/mock-server/
COPY --from=builder /app/packages/mock-server/dist packages/mock-server/dist/
COPY --from=builder /app/packages/mock-server/src/data packages/mock-server/dist/data/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/packages/shared/node_modules packages/shared/node_modules/
COPY --from=builder /app/packages/mock-server/node_modules packages/mock-server/node_modules/
WORKDIR /app/packages/mock-server
EXPOSE 3010
CMD ["node", "dist/server.js"]
