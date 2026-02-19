import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import { vaultSecrets, rotationHooks } from "../db/schema.js";
import type { Database } from "../types.js";
import { createVaultAuthGuard, hasScope } from "../middleware/auth.js";

const logger = createLogger("vault:rotation");

// ---------------------------------------------------------------------------
// Request body/param types
// ---------------------------------------------------------------------------

interface UpdateScheduleParams {
  name: string;
}

interface UpdateScheduleBody {
  rotationIntervalSeconds: number | null;
}

interface RegisterHookBody {
  secretName: string;
  callbackUrl: string;
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * Rotation management routes.
 *
 * All routes require a valid vault token (internal API key or access token)
 * via the x-vault-token header.
 */
export async function rotationRoutes(fastify: FastifyInstance): Promise<void> {
  const db = fastify.db as Database;
  const rotationScheduler = fastify.rotationScheduler;
  const tokenManager = fastify.tokenManager;

  // Apply auth guard to all routes in this plugin
  fastify.addHook("onRequest", createVaultAuthGuard(tokenManager));

  // =========================================================================
  // GET /rotation/status - Get status of all rotation schedules
  // =========================================================================
  fastify.get("/rotation/status", async (request, reply) => {
    if (!hasScope(request, "rotation:read") && !hasScope(request, "*")) {
      return reply.status(403).send({
        error: {
          type: "AUTH-ERROR",
          code: "INSUFFICIENT_SCOPE",
          message: 'Required scope: "rotation:read"',
        },
      });
    }

    try {
      const statuses = await rotationScheduler.getRotationStatuses();

      return reply.status(200).send({
        schedulerRunning: rotationScheduler.isRunning(),
        secrets: statuses,
        total: statuses.length,
      });
    } catch (err) {
      logger.error({ err }, "Error fetching rotation statuses");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "STATUS_FAILED",
          message: "Failed to fetch rotation statuses",
        },
      });
    }
  });

  // =========================================================================
  // POST /rotation/trigger-all - Trigger rotation of all secrets with rotation
  // =========================================================================
  fastify.post("/rotation/trigger-all", async (request, reply) => {
    if (!hasScope(request, "rotation:trigger") && !hasScope(request, "*")) {
      return reply.status(403).send({
        error: {
          type: "AUTH-ERROR",
          code: "INSUFFICIENT_SCOPE",
          message: 'Required scope: "rotation:trigger"',
        },
      });
    }

    try {
      const results = await rotationScheduler.rotateAll();

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      logger.info({ succeeded, failed, total: results.length }, "Bulk rotation completed");

      return reply.status(200).send({
        success: true,
        results,
        summary: {
          total: results.length,
          succeeded,
          failed,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error triggering bulk rotation");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "BULK_ROTATION_FAILED",
          message: "Failed to trigger bulk rotation",
        },
      });
    }
  });

  // =========================================================================
  // PUT /rotation/schedule/:name - Update rotation schedule for a secret
  // =========================================================================
  fastify.put<{ Params: UpdateScheduleParams; Body: UpdateScheduleBody }>(
    "/rotation/schedule/:name",
    async (request, reply) => {
      if (!hasScope(request, "rotation:write") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "rotation:write"',
          },
        });
      }

      try {
        const { name } = request.params;
        const { rotationIntervalSeconds } = request.body;

        // Validate interval
        if (
          rotationIntervalSeconds !== null &&
          (typeof rotationIntervalSeconds !== "number" || rotationIntervalSeconds < 0)
        ) {
          return reply.status(400).send({
            error: {
              type: "VALIDATION-ERROR",
              code: "INVALID_INTERVAL",
              message:
                "rotationIntervalSeconds must be a non-negative number or null to disable",
            },
          });
        }

        // Find the secret
        const [secret] = await db
          .select()
          .from(vaultSecrets)
          .where(
            and(
              eq(vaultSecrets.name, name),
              eq(vaultSecrets.is_deleted, false),
            ),
          )
          .limit(1);

        if (!secret) {
          return reply.status(404).send({
            error: {
              type: "NOT-FOUND",
              code: "SECRET_NOT_FOUND",
              message: `Secret "${name}" not found`,
            },
          });
        }

        // Update the rotation interval
        await db
          .update(vaultSecrets)
          .set({
            rotation_interval_seconds: rotationIntervalSeconds,
            updated_at: new Date(),
          })
          .where(eq(vaultSecrets.id, secret.id));

        logger.info(
          { name, rotationIntervalSeconds },
          "Rotation schedule updated",
        );

        return reply.status(200).send({
          success: true,
          name,
          rotationIntervalSeconds,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Error updating rotation schedule");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "SCHEDULE_UPDATE_FAILED",
            message: "Failed to update rotation schedule",
          },
        });
      }
    },
  );

  // =========================================================================
  // GET /rotation/hooks - List registered rotation hooks
  // =========================================================================
  fastify.get("/rotation/hooks", async (request, reply) => {
    if (!hasScope(request, "rotation:read") && !hasScope(request, "*")) {
      return reply.status(403).send({
        error: {
          type: "AUTH-ERROR",
          code: "INSUFFICIENT_SCOPE",
          message: 'Required scope: "rotation:read"',
        },
      });
    }

    try {
      const hooks = await db
        .select()
        .from(rotationHooks)
        .orderBy(rotationHooks.secret_name);

      return reply.status(200).send({
        hooks,
        total: hooks.length,
      });
    } catch (err) {
      logger.error({ err }, "Error listing rotation hooks");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "HOOKS_LIST_FAILED",
          message: "Failed to list rotation hooks",
        },
      });
    }
  });

  // =========================================================================
  // POST /rotation/hooks - Register a new rotation hook
  // =========================================================================
  fastify.post<{ Body: RegisterHookBody }>(
    "/rotation/hooks",
    async (request, reply) => {
      if (!hasScope(request, "rotation:write") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "rotation:write"',
          },
        });
      }

      try {
        const { secretName, callbackUrl, headers } = request.body;

        if (!secretName || !callbackUrl) {
          return reply.status(400).send({
            error: {
              type: "VALIDATION-ERROR",
              code: "MISSING_FIELDS",
              message: "secretName and callbackUrl are required",
            },
          });
        }

        // Validate URL format
        try {
          new URL(callbackUrl);
        } catch {
          return reply.status(400).send({
            error: {
              type: "VALIDATION-ERROR",
              code: "INVALID_URL",
              message: "callbackUrl must be a valid URL",
            },
          });
        }

        // Verify the secret exists
        const [secret] = await db
          .select({ name: vaultSecrets.name })
          .from(vaultSecrets)
          .where(
            and(
              eq(vaultSecrets.name, secretName),
              eq(vaultSecrets.is_deleted, false),
            ),
          )
          .limit(1);

        if (!secret) {
          return reply.status(404).send({
            error: {
              type: "NOT-FOUND",
              code: "SECRET_NOT_FOUND",
              message: `Secret "${secretName}" not found`,
            },
          });
        }

        const [inserted] = await db
          .insert(rotationHooks)
          .values({
            secret_name: secretName,
            callback_url: callbackUrl,
            headers: headers ?? null,
          })
          .returning();

        logger.info(
          { hookId: inserted!.id, secretName, callbackUrl },
          "Rotation hook registered",
        );

        return reply.status(201).send({
          success: true,
          hook: inserted,
        });
      } catch (err) {
        logger.error({ err }, "Error registering rotation hook");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "HOOK_REGISTER_FAILED",
            message: "Failed to register rotation hook",
          },
        });
      }
    },
  );
}
