module.exports = {
  apps: [
    { name: "registry", cwd: "./packages/registry", script: "dist/server.js", env: { REGISTRY_PORT: 3001 } },
    { name: "gateway", cwd: "./packages/gateway", script: "dist/server.js", env: { GATEWAY_PORT: 3002 } },
    { name: "bap", cwd: "./packages/bap", script: "dist/server.js", env: { BAP_PORT: 3003 } },
    { name: "bpp", cwd: "./packages/bpp", script: "dist/server.js", env: { BPP_PORT: 3004 } },
    { name: "vault", cwd: "./packages/vault", script: "dist/server.js", env: { VAULT_PORT: 3006 } },
    { name: "health-monitor", cwd: "./packages/health-monitor", script: "dist/server.js", env: { HEALTH_MONITOR_PORT: 3007 } },
    { name: "buyer-app", cwd: "./packages/buyer-app", script: "npx", args: "next start -p 3012" },
    { name: "seller-app", cwd: "./packages/seller-app", script: "npx", args: "next start -p 3013" },
    { name: "admin", cwd: "./packages/admin", script: "npx", args: "next start -p 3014" },
    { name: "docs", cwd: "./packages/docs", script: "npx", args: "next start -p 3015" },
  ],
};
