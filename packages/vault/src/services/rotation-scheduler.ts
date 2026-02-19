import { eq, isNotNull, and } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import { auditLogs } from "@ondc/shared/db";
import { vaultSecrets, rotationHooks } from "../db/schema.js";
import { EncryptionService } from "./encryption.js";
import type { Database } from "../types.js";

const logger = createLogger("vault:rotation-scheduler");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RotationStatus {
  secretName: string;
  service: string;
  version: number;
  rotationIntervalSeconds: number | null;
  lastRotatedAt: Date | null;
  nextRotationAt: Date | null;
  isOverdue: boolean;
}

export interface RotationResult {
  secretName: string;
  success: boolean;
  newVersion: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// RotationScheduler
// ---------------------------------------------------------------------------

/**
 * Manages automatic secret rotation on configurable schedules.
 *
 * The scheduler checks at a configurable interval (default 60s) for secrets
 * whose rotation is due. When rotating:
 *  1. Generates a new random password
 *  2. Encrypts and stores the new value
 *  3. Moves the old value to previous_encrypted_value for a grace period
 *  4. Fires registered HTTP callbacks (rotation hooks)
 *  5. Logs the rotation event in audit_logs
 */
export class RotationScheduler {
  private readonly db: Database;
  private readonly encryption: EncryptionService;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly checkIntervalMs: number;
  private running = false;

  constructor(
    db: Database,
    encryption: EncryptionService,
    checkIntervalMs: number = 60_000,
  ) {
    this.db = db;
    this.encryption = encryption;
    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Start the rotation scheduler. Begins checking for due rotations
   * at the configured interval.
   */
  start(): void {
    if (this.intervalHandle) {
      logger.warn("Rotation scheduler is already running");
      return;
    }

    logger.info(
      { checkIntervalMs: this.checkIntervalMs },
      "Starting rotation scheduler",
    );

    this.running = true;

    // Run an initial check immediately
    void this.checkAndRotate();

    this.intervalHandle = setInterval(() => {
      void this.checkAndRotate();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the rotation scheduler.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.running = false;
      logger.info("Rotation scheduler stopped");
    }
  }

  /**
   * Whether the scheduler is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check all secrets with rotation intervals and rotate those that are due.
   */
  async checkAndRotate(): Promise<RotationResult[]> {
    const results: RotationResult[] = [];

    try {
      const now = new Date();

      // Find all non-deleted secrets that have a rotation interval configured
      const secrets = await this.db
        .select()
        .from(vaultSecrets)
        .where(
          and(
            isNotNull(vaultSecrets.rotation_interval_seconds),
            eq(vaultSecrets.is_deleted, false),
          ),
        );

      for (const secret of secrets) {
        const intervalSeconds = secret.rotation_interval_seconds;
        if (!intervalSeconds || intervalSeconds <= 0) continue;

        const lastRotated = secret.last_rotated_at ?? secret.created_at;
        if (!lastRotated) continue;

        const nextRotation = new Date(
          lastRotated.getTime() + intervalSeconds * 1000,
        );

        if (now >= nextRotation) {
          logger.info(
            { name: secret.name, lastRotated, nextRotation },
            "Secret rotation due",
          );

          const result = await this.rotateSecret(secret.name);
          results.push(result);
        }
      }
    } catch (err) {
      logger.error({ err }, "Error during rotation check cycle");
    }

    return results;
  }

  /**
   * Force-rotate a specific secret immediately, regardless of schedule.
   *
   * @param secretName - The name of the secret to rotate
   * @returns The rotation result
   */
  async rotateSecret(secretName: string): Promise<RotationResult> {
    try {
      // Fetch the current secret
      const [secret] = await this.db
        .select()
        .from(vaultSecrets)
        .where(
          and(
            eq(vaultSecrets.name, secretName),
            eq(vaultSecrets.is_deleted, false),
          ),
        )
        .limit(1);

      if (!secret) {
        return {
          secretName,
          success: false,
          newVersion: 0,
          error: `Secret "${secretName}" not found`,
        };
      }

      // Generate new password and encrypt it
      const newPassword = EncryptionService.generatePassword(32);
      const newEncryptedValue = this.encryption.encrypt(newPassword);
      const newVersion = secret.version + 1;
      const now = new Date();

      // Update the secret: move current value to previous, set new value
      await this.db
        .update(vaultSecrets)
        .set({
          previous_encrypted_value: secret.encrypted_value,
          encrypted_value: newEncryptedValue,
          version: newVersion,
          last_rotated_at: now,
          updated_at: now,
        })
        .where(eq(vaultSecrets.id, secret.id));

      // Log the rotation in audit_logs
      await this.db.insert(auditLogs).values({
        actor: "vault:rotation-scheduler",
        action: "SECRET_ROTATED",
        resource_type: "vault_secret",
        resource_id: secret.id,
        details: {
          secret_name: secretName,
          service: secret.service,
          old_version: secret.version,
          new_version: newVersion,
          rotated_at: now.toISOString(),
        },
      });

      // Fire rotation hooks
      await this.fireHooks(secretName, newVersion);

      logger.info(
        { secretName, newVersion, service: secret.service },
        "Secret rotated successfully",
      );

      return { secretName, success: true, newVersion };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, secretName }, "Failed to rotate secret");

      return {
        secretName,
        success: false,
        newVersion: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the rotation status for all secrets that have rotation configured.
   */
  async getRotationStatuses(): Promise<RotationStatus[]> {
    const secrets = await this.db
      .select()
      .from(vaultSecrets)
      .where(eq(vaultSecrets.is_deleted, false));

    const now = new Date();

    return secrets.map((secret) => {
      const lastRotated = secret.last_rotated_at ?? secret.created_at;
      const intervalSeconds = secret.rotation_interval_seconds;

      let nextRotationAt: Date | null = null;
      let isOverdue = false;

      if (intervalSeconds && intervalSeconds > 0 && lastRotated) {
        nextRotationAt = new Date(
          lastRotated.getTime() + intervalSeconds * 1000,
        );
        isOverdue = now >= nextRotationAt;
      }

      return {
        secretName: secret.name,
        service: secret.service,
        version: secret.version,
        rotationIntervalSeconds: intervalSeconds,
        lastRotatedAt: secret.last_rotated_at,
        nextRotationAt,
        isOverdue,
      };
    });
  }

  /**
   * Trigger rotation for ALL secrets that have rotation configured.
   */
  async rotateAll(): Promise<RotationResult[]> {
    const secrets = await this.db
      .select()
      .from(vaultSecrets)
      .where(
        and(
          isNotNull(vaultSecrets.rotation_interval_seconds),
          eq(vaultSecrets.is_deleted, false),
        ),
      );

    const results: RotationResult[] = [];

    for (const secret of secrets) {
      const result = await this.rotateSecret(secret.name);
      results.push(result);
    }

    return results;
  }

  /**
   * Fire HTTP callbacks for registered rotation hooks.
   */
  private async fireHooks(
    secretName: string,
    newVersion: number,
  ): Promise<void> {
    try {
      const hooks = await this.db
        .select()
        .from(rotationHooks)
        .where(
          and(
            eq(rotationHooks.secret_name, secretName),
            eq(rotationHooks.is_active, true),
          ),
        );

      if (hooks.length === 0) return;

      logger.info(
        { secretName, hookCount: hooks.length },
        "Firing rotation hooks",
      );

      const hookPromises = hooks.map(async (hook) => {
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(hook.headers ?? {}),
          };

          const response = await fetch(hook.callback_url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              event: "secret_rotated",
              secretName,
              newVersion,
              rotatedAt: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(10_000), // 10s timeout
          });

          if (!response.ok) {
            logger.warn(
              {
                hookId: hook.id,
                callbackUrl: hook.callback_url,
                status: response.status,
              },
              "Rotation hook callback returned non-OK status",
            );
          } else {
            logger.info(
              { hookId: hook.id, callbackUrl: hook.callback_url },
              "Rotation hook callback succeeded",
            );
          }
        } catch (hookErr) {
          logger.error(
            { err: hookErr, hookId: hook.id, callbackUrl: hook.callback_url },
            "Failed to fire rotation hook callback",
          );
        }
      });

      await Promise.allSettled(hookPromises);
    } catch (err) {
      logger.error(
        { err, secretName },
        "Error fetching rotation hooks from database",
      );
    }
  }
}
