import "dotenv/config";
import pg from "pg";
import { createLogger } from "@ondc/shared/utils";
import { writeFileSync } from "node:fs";

const logger = createLogger("pramaan-export");

interface PramaanLogEntry {
  context: Record<string, unknown>;
  message: Record<string, unknown>;
}

interface PramaanFlow {
  transaction_id: string;
  domain: string;
  flow: string;
  payload: Record<string, PramaanLogEntry>;
}

async function exportPramaanLogs() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    logger.error("DATABASE_URL required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const { rows } = await pool.query(`
    SELECT
      t.transaction_id,
      t.action,
      t.request_body,
      t.response_body,
      t.timestamp,
      t.domain
    FROM transactions t
    WHERE t.transaction_id IS NOT NULL
    ORDER BY t.transaction_id, t.timestamp ASC
  `);

  const flows = new Map<string, PramaanFlow>();

  for (const row of rows) {
    const txnId = row.transaction_id as string;
    if (!flows.has(txnId)) {
      flows.set(txnId, {
        transaction_id: txnId,
        domain: (row.domain as string) || "ONDC:RET10",
        flow: "Flow 1",
        payload: {},
      });
    }

    const flow = flows.get(txnId)!;
    const actionPath = `/${row.action}`;

    flow.payload[actionPath] = {
      context: row.request_body?.context || row.response_body?.context || {},
      message: row.request_body?.message || row.response_body?.message || {},
    };
  }

  // Detect flow type from actions present
  for (const flow of flows.values()) {
    const actions = Object.keys(flow.payload);
    if (actions.includes("/cancel") || actions.includes("/on_cancel")) {
      flow.flow = "Flow 3"; // Cancellation
    } else if (actions.includes("/update") || actions.includes("/on_update")) {
      flow.flow = "Flow 4"; // Update
    } else if (actions.includes("/confirm") || actions.includes("/on_confirm")) {
      flow.flow = "Flow 1"; // Complete order
    } else if (actions.includes("/select") || actions.includes("/on_select")) {
      flow.flow = "Flow 2"; // Partial
    }
  }

  const output = Array.from(flows.values());
  const outputPath = process.argv[2] || "./pramaan-logs.json";

  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  logger.info({ count: output.length, outputPath }, "Pramaan logs exported");
  await pool.end();
}

exportPramaanLogs().catch((err) => {
  logger.error({ err }, "Export failed");
  process.exit(1);
});
