import "dotenv/config";
import { Command } from "commander";
import {
  createDb,
  transactions,
  subscribers,
  auditLogs,
} from "@ondc/shared/db";
import { gte, lte, and, type SQL } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://ondc:ondc@localhost:5432/ondc_network";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExportType = "transactions" | "subscribers" | "audit";

function tableForType(type: ExportType) {
  switch (type) {
    case "transactions":
      return transactions;
    case "subscribers":
      return subscribers;
    case "audit":
      return auditLogs;
    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}

function createdAtColumn(type: ExportType) {
  switch (type) {
    case "transactions":
      return transactions.created_at;
    case "subscribers":
      return subscribers.created_at;
    case "audit":
      return auditLogs.created_at;
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]!);
  const lines: string[] = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") {
        return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      }
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Export logic
// ---------------------------------------------------------------------------

interface ExportOptions {
  format: "json" | "csv";
  type: ExportType;
  output?: string;
  from?: string;
  to?: string;
}

async function exportData(opts: ExportOptions) {
  const { db, pool } = createDb(DATABASE_URL);

  try {
    const table = tableForType(opts.type);
    const createdAt = createdAtColumn(opts.type);

    // Build date filters
    const conditions: SQL[] = [];
    if (opts.from) {
      conditions.push(gte(createdAt, new Date(opts.from)));
    }
    if (opts.to) {
      conditions.push(lte(createdAt, new Date(opts.to)));
    }

    const whereClause =
      conditions.length > 0
        ? and(...conditions)
        : undefined;

    // Query
    const rows = await db
      .select()
      .from(table)
      .where(whereClause)
      .orderBy(createdAt);

    console.log(`Fetched ${rows.length} ${opts.type} record(s).`);

    // Format
    let content: string;
    if (opts.format === "csv") {
      content = toCsv(rows as Record<string, unknown>[]);
    } else {
      content = JSON.stringify(rows, null, 2);
    }

    // Write or print
    if (opts.output) {
      const resolved = path.resolve(opts.output);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, "utf-8");
      console.log(`Exported to ${resolved}`);
    } else {
      console.log(content);
    }
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("export-data")
  .description("Export ONDC network data to JSON or CSV")
  .requiredOption(
    "--type <type>",
    "Data type to export: transactions | subscribers | audit",
  )
  .option("--format <format>", "Output format: json | csv", "json")
  .option("--output <filepath>", "File path to write output (stdout if omitted)")
  .option("--from <date>", "Start date filter (ISO 8601)")
  .option("--to <date>", "End date filter (ISO 8601)")
  .action(async (opts) => {
    const validTypes = ["transactions", "subscribers", "audit"];
    if (!validTypes.includes(opts.type)) {
      console.error(
        `Invalid --type "${opts.type}". Must be one of: ${validTypes.join(", ")}`,
      );
      process.exit(1);
    }

    const validFormats = ["json", "csv"];
    if (!validFormats.includes(opts.format)) {
      console.error(
        `Invalid --format "${opts.format}". Must be one of: ${validFormats.join(", ")}`,
      );
      process.exit(1);
    }

    await exportData({
      format: opts.format as ExportOptions["format"],
      type: opts.type as ExportType,
      output: opts.output,
      from: opts.from,
      to: opts.to,
    });
  });

program.parse();
