/**
 * Health-check script that probes all ONDC network services and reports their
 * availability.
 *
 * Usage:
 *   tsx src/health-check.ts
 */

interface ServiceDef {
  name: string;
  url: string;
  critical: boolean;
}

const SERVICES: ServiceDef[] = [
  { name: "Registry",    url: "http://localhost:3001/health", critical: true },
  { name: "Gateway",     url: "http://localhost:3002/health", critical: true },
  { name: "Admin API",   url: "http://localhost:3003/health", critical: true },
  { name: "BAP Client",  url: "http://localhost:3004/health", critical: true },
  { name: "BPP Server",  url: "http://localhost:3005/health", critical: true },
  { name: "Docs",        url: "http://localhost:3000/health", critical: false },
  { name: "Mock Server", url: "http://localhost:3010/health", critical: false },
];

interface CheckResult {
  name: string;
  status: "UP" | "DOWN";
  responseTime: number;
  error?: string;
}

async function checkService(service: ServiceDef): Promise<CheckResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(service.url, { signal: controller.signal });
    clearTimeout(timeout);

    const elapsed = Math.round(performance.now() - start);

    if (res.ok) {
      return { name: service.name, status: "UP", responseTime: elapsed };
    }
    return {
      name: service.name,
      status: "DOWN",
      responseTime: elapsed,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    return {
      name: service.name,
      status: "DOWN",
      responseTime: elapsed,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function pad(str: string, len: number) {
  return str.padEnd(len);
}

async function main() {
  console.log("ONDC Network Health Check");
  console.log("=".repeat(70));
  console.log(
    `${pad("Service", 16)} ${pad("Status", 8)} ${pad("Time", 10)} Details`,
  );
  console.log("-".repeat(70));

  const results = await Promise.all(SERVICES.map(checkService));

  for (const r of results) {
    const statusIcon = r.status === "UP" ? "UP" : "DOWN";
    const time = `${r.responseTime}ms`;
    const detail = r.error ?? "";
    console.log(
      `${pad(r.name, 16)} ${pad(statusIcon, 8)} ${pad(time, 10)} ${detail}`,
    );
  }

  console.log("-".repeat(70));

  const criticalDown = results.filter(
    (r) =>
      r.status === "DOWN" &&
      SERVICES.find((s) => s.name === r.name)?.critical,
  );

  if (criticalDown.length > 0) {
    console.log(
      `\nFAILED: ${criticalDown.length} critical service(s) are DOWN.`,
    );
    process.exit(1);
  }

  const allDown = results.filter((r) => r.status === "DOWN");
  if (allDown.length > 0) {
    console.log(
      `\nWARNING: ${allDown.length} non-critical service(s) are DOWN, but all critical services are UP.`,
    );
  } else {
    console.log("\nAll services are UP.");
  }

  process.exit(0);
}

main();
