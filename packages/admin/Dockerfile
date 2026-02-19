FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/admin/package.json packages/admin/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/admin/ packages/admin/
ENV DOCKER_BUILD=1
RUN pnpm --filter @ondc/shared build && pnpm --filter @ondc/admin build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/admin/.next/standalone ./
COPY --from=builder /app/packages/admin/.next/static ./packages/admin/.next/static
COPY --from=builder /app/packages/admin/public ./packages/admin/public
EXPOSE 3003
CMD ["node", "packages/admin/server.js"]
