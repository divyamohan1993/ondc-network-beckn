FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/bpp/package.json packages/bpp/
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/bpp/ packages/bpp/
RUN pnpm --filter @ondc/shared build && pnpm --filter @ondc/bpp build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/bpp/package.json packages/bpp/
COPY --from=builder /app/packages/bpp/dist packages/bpp/dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/packages/shared/node_modules packages/shared/node_modules/
COPY --from=builder /app/packages/bpp/node_modules packages/bpp/node_modules/
WORKDIR /app/packages/bpp
EXPOSE 3005
CMD ["node", "dist/server.js"]
