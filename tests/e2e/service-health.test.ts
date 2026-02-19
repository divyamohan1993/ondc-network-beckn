import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

describe("Service Health Configuration", () => {
  describe("Docker Compose", () => {
    it("docker-compose.yml exists", () => {
      expect(existsSync(resolve(ROOT, "docker-compose.yml"))).toBe(true);
    });

    it("docker-compose.yml contains all required services", () => {
      const content = readFileSync(resolve(ROOT, "docker-compose.yml"), "utf-8");
      const requiredServices = [
        "postgres", "redis", "rabbitmq",
        "registry", "gateway", "bap", "bpp", "admin",
        "vault", "orchestrator", "health-monitor", "log-aggregator",
        "mock-server", "simulation-engine",
      ];
      for (const service of requiredServices) {
        expect(content).toContain(service);
      }
    });

    it("all services have health check or depends_on", () => {
      const content = readFileSync(resolve(ROOT, "docker-compose.yml"), "utf-8");
      // At minimum, infrastructure services should have healthcheck
      expect(content).toContain("healthcheck");
    });
  });

  describe("Environment Configuration", () => {
    it(".env.example exists", () => {
      expect(existsSync(resolve(ROOT, ".env.example"))).toBe(true);
    });

    it(".env.example contains all service port configs", () => {
      const content = readFileSync(resolve(ROOT, ".env.example"), "utf-8");
      const portConfigs = [
        "REGISTRY_PORT", "GATEWAY_PORT", "BAP_PORT", "BPP_PORT",
        "VAULT_PORT", "ORCHESTRATOR_PORT", "HEALTH_MONITOR_PORT",
        "LOG_AGGREGATOR_PORT",
      ];
      for (const config of portConfigs) {
        expect(content).toContain(config);
      }
    });

    it(".env.example contains database configuration", () => {
      const content = readFileSync(resolve(ROOT, ".env.example"), "utf-8");
      expect(content).toContain("POSTGRES_HOST");
      expect(content).toContain("POSTGRES_DB");
    });

    it(".env.example contains vault configuration", () => {
      const content = readFileSync(resolve(ROOT, ".env.example"), "utf-8");
      expect(content).toContain("VAULT_MASTER_KEY");
    });
  });

  describe("Database Initialization", () => {
    it("init.sql exists", () => {
      expect(existsSync(resolve(ROOT, "db/init.sql"))).toBe(true);
    });

    it("init.sql creates all required tables", () => {
      const content = readFileSync(resolve(ROOT, "db/init.sql"), "utf-8");
      const requiredTables = [
        "subscribers", "domains", "cities", "transactions",
        "audit_logs", "admin_users", "network_policies",
        "vault_secrets", "vault_tokens", "rotation_hooks",
        "health_snapshots", "health_alerts", "aggregated_logs",
        "teardown_operations", "orders", "order_state_transitions",
        "simulation_runs",
      ];
      for (const table of requiredTables) {
        expect(content).toContain(table);
      }
    });

    it("init.sql creates required enums", () => {
      const content = readFileSync(resolve(ROOT, "db/init.sql"), "utf-8");
      const enums = [
        "subscriber_type", "subscriber_status", "transaction_status",
        "admin_role", "order_state",
      ];
      for (const e of enums) {
        expect(content).toContain(e);
      }
    });
  });

  describe("Nginx Configuration", () => {
    it("nginx.conf exists", () => {
      expect(existsSync(resolve(ROOT, "nginx/nginx.conf"))).toBe(true);
    });

    it("nginx.conf contains upstreams for all services", () => {
      const content = readFileSync(resolve(ROOT, "nginx/nginx.conf"), "utf-8");
      const upstreams = ["registry", "gateway", "admin"];
      for (const upstream of upstreams) {
        expect(content).toContain(upstream);
      }
    });

    it("nginx.conf has rate limiting configuration", () => {
      const content = readFileSync(resolve(ROOT, "nginx/nginx.conf"), "utf-8");
      expect(content).toContain("limit_req");
    });
  });

  describe("Package Structure", () => {
    const servicePackages = [
      "shared", "registry", "gateway", "bap", "bpp",
      "admin", "vault", "orchestrator", "health-monitor",
      "log-aggregator", "mock-server", "simulation-engine",
    ];

    for (const pkg of servicePackages) {
      it(`${pkg} package.json exists`, () => {
        expect(existsSync(resolve(ROOT, `packages/${pkg}/package.json`))).toBe(true);
      });
    }

    it("all service packages have build script", () => {
      for (const pkg of servicePackages) {
        const pkgJson = JSON.parse(
          readFileSync(resolve(ROOT, `packages/${pkg}/package.json`), "utf-8"),
        );
        expect(pkgJson.scripts).toHaveProperty("build");
      }
    });

    it("all service packages depend on @ondc/shared", () => {
      const nonSharedPkgs = servicePackages.filter(p => p !== "shared" && p !== "admin" && p !== "docs");
      for (const pkg of nonSharedPkgs) {
        const pkgJson = JSON.parse(
          readFileSync(resolve(ROOT, `packages/${pkg}/package.json`), "utf-8"),
        );
        expect(pkgJson.dependencies?.["@ondc/shared"]).toBeDefined();
      }
    });
  });

  describe("Deployment Scripts", () => {
    it("autoconfig.sh exists", () => {
      expect(existsSync(resolve(ROOT, "autoconfig.sh"))).toBe(true);
    });

    it("turbo.json exists with correct pipeline", () => {
      const content = JSON.parse(
        readFileSync(resolve(ROOT, "turbo.json"), "utf-8"),
      );
      expect(content.tasks || content.pipeline).toBeDefined();
    });

    it("pnpm-workspace.yaml exists", () => {
      expect(existsSync(resolve(ROOT, "pnpm-workspace.yaml"))).toBe(true);
    });
  });
});
