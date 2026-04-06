FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/seller-app/package.json packages/seller-app/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/seller-app/ packages/seller-app/
ENV DOCKER_BUILD=1
RUN pnpm --filter @ondc/seller-app build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/seller-app/.next/standalone ./
COPY --from=builder /app/packages/seller-app/.next/static ./packages/seller-app/.next/static
COPY --from=builder /app/packages/seller-app/public ./packages/seller-app/public
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs
USER nodejs
EXPOSE 3000
CMD ["node", "packages/seller-app/server.js"]
