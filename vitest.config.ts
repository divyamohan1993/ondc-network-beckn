import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@ondc/shared/crypto": resolve(__dirname, "packages/shared/src/crypto/index.ts"),
      "@ondc/shared/protocol": resolve(__dirname, "packages/shared/src/protocol/index.ts"),
      "@ondc/shared/middleware": resolve(__dirname, "packages/shared/src/middleware/index.ts"),
      "@ondc/shared/utils": resolve(__dirname, "packages/shared/src/utils/index.ts"),
      "@ondc/shared/db": resolve(__dirname, "packages/shared/src/db/index.ts"),
      "@ondc/shared": resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/index.ts",
        "**/types.ts",
      ],
    },
    testTimeout: 15000,
    hookTimeout: 10000,
    pool: "forks",
    fileParallelism: true,
  },
});
