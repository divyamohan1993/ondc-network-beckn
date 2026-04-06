FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/buyer-app/package.json packages/buyer-app/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/buyer-app/ packages/buyer-app/
ENV DOCKER_BUILD=1
RUN pnpm --filter @ondc/buyer-app build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/buyer-app/.next/standalone ./
COPY --from=builder /app/packages/buyer-app/.next/static ./packages/buyer-app/.next/static
COPY --from=builder /app/packages/buyer-app/public ./packages/buyer-app/public
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs
USER nodejs
EXPOSE 3000
CMD ["node", "packages/buyer-app/server.js"]
