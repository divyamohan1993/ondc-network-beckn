/**
 * Key Transparency Log - append-only record of all public key changes.
 * Allows NPs to verify that registry key responses are consistent over time.
 * Inspired by Certificate Transparency (CT) logs.
 */
import { eq, and, like, sql } from "drizzle-orm";
import { sign } from "@ondc/shared/crypto";
import { createLogger } from "@ondc/shared/utils";
import { auditLogs, type Database } from "@ondc/shared/db";

const logger = createLogger("key-transparency");

export type KeyAction = "REGISTERED" | "ROTATED" | "REVOKED";

export class KeyTransparencyLog {
  constructor(
    private db: Database,
    private registryPrivateKey: string,
  ) {}

  /**
   * Record a key change event in the append-only transparency log.
   * Signs the entry with the registry's private key for tamper evidence.
   */
  async recordKeyChange(params: {
    subscriberId: string;
    uniqueKeyId: string;
    publicKey: string;
    action: KeyAction;
    previousKeyId?: string;
  }): Promise<string> {
    const entry = {
      subscriberId: params.subscriberId,
      uniqueKeyId: params.uniqueKeyId,
      publicKey: params.publicKey,
      action: params.action,
      previousKeyId: params.previousKeyId,
      timestamp: new Date().toISOString(),
      sequence: await this.getNextSequence(),
    };

    // Sign the entry with registry key for tamper evidence
    const entryString = JSON.stringify(entry);
    const signature = sign(entryString, this.registryPrivateKey);

    await this.db.insert(auditLogs).values({
      actor: params.subscriberId,
      action: `KEY_${params.action}`,
      resource_type: "subscriber_key",
      resource_id: params.subscriberId,
      details: { ...entry, signature },
    });

    logger.info(
      { subscriberId: params.subscriberId, action: params.action, uniqueKeyId: params.uniqueKeyId },
      `Key ${params.action.toLowerCase()}: ${params.subscriberId}`,
    );

    return signature;
  }

  /**
   * Get the next monotonic sequence number for key events.
   */
  private async getNextSequence(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(like(auditLogs.action, "KEY_%"));
    return Number(result[0]?.count ?? 0) + 1;
  }

  /**
   * Get key history for a subscriber (for out-of-band verification).
   * Returns all key change events in chronological order.
   */
  async getKeyHistory(subscriberId: string) {
    return this.db
      .select()
      .from(auditLogs)
      .where(
        and(
          like(auditLogs.action, "KEY_%"),
          eq(auditLogs.resource_id, subscriberId),
        ),
      )
      .orderBy(auditLogs.created_at);
  }
}
