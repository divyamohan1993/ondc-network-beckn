import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "@ondc/shared/utils";
import { auditLogs } from "@ondc/shared/db";
import { vaultSecrets } from "../db/schema.js";
import type { Database } from "../types.js";
import { createVaultAuthGuard, hasScope } from "../middleware/auth.js";

const logger = createLogger("vault:secrets");

// ---------------------------------------------------------------------------
// Request body/param types
// ---------------------------------------------------------------------------

interface CreateSecretBody {
  name: string;
  value: string;
  service: string;
  rotationInterval?: number;
}

interface UpdateSecretBody {
  value?: string;
  service?: string;
  rotationInterval?: number | null;
}

interface SecretParams {
  name: string;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

/**
 * Secret CRUD routes.
 *
 * All routes require a valid vault token (internal API key or access token)
 * via the x-vault-token header.
 */
export async function secretsRoutes(fastify: FastifyInstance): Promise<void> {
  const db = fastify.db as Database;
  const encryption = fastify.encryption;
  const rotationScheduler = fastify.rotationScheduler;
  const tokenManager = fastify.tokenManager;

  // Apply auth guard to all routes in this plugin
  fastify.addHook("onRequest", createVaultAuthGuard(tokenManager));

  // =========================================================================
  // POST /secrets - Create a new secret
  // =========================================================================
  fastify.post<{ Body: CreateSecretBody }>(
    "/secrets",
    async (request, reply) => {
      if (!hasScope(request, "secrets:write") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "secrets:write"',
          },
        });
      }

      try {
        const { name, value, service, rotationInterval } = request.body;

        if (!name || !value || !service) {
          return reply.status(400).send({
            error: {
              type: "VALIDATION-ERROR",
              code: "MISSING_FIELDS",
              message: "name, value, and service are required",
            },
          });
        }

        // Check if secret already exists (including soft-deleted)
        const [existing] = await db
          .select()
          .from(vaultSecrets)
          .where(eq(vaultSecrets.name, name))
          .limit(1);

        if (existing && !existing.is_deleted) {
          return reply.status(409).send({
            error: {
              type: "CONFLICT",
              code: "SECRET_EXISTS",
              message: `Secret "${name}" already exists. Use PUT to update.`,
            },
          });
        }

        // Encrypt the value
        const encryptedValue = encryption.encrypt(value);

        if (existing && existing.is_deleted) {
          // Re-activate a soft-deleted secret
          await db
            .update(vaultSecrets)
            .set({
              encrypted_value: encryptedValue,
              previous_encrypted_value: null,
              service,
              version: 1,
              rotation_interval_seconds: rotationInterval ?? null,
              last_rotated_at: null,
              is_deleted: false,
              updated_at: new Date(),
            })
            .where(eq(vaultSecrets.id, existing.id));
        } else {
          await db.insert(vaultSecrets).values({
            name,
            encrypted_value: encryptedValue,
            service,
            rotation_interval_seconds: rotationInterval ?? null,
          });
        }

        // Audit log
        await db.insert(auditLogs).values({
          actor: request.vaultClaims?.serviceId ?? "unknown",
          action: "SECRET_CREATED",
          resource_type: "vault_secret",
          resource_id: name,
          details: { service, hasRotation: !!rotationInterval },
          ip_address: request.ip,
        });

        logger.info({ name, service }, "Secret created");

        return reply.status(201).send({
          success: true,
          name,
          service,
          version: 1,
          rotationInterval: rotationInterval ?? null,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Error creating secret");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "CREATE_FAILED",
            message: "Failed to create secret",
          },
        });
      }
    },
  );

  // =========================================================================
  // GET /secrets - List all secret names (not values) with metadata
  // =========================================================================
  fastify.get("/secrets", async (request, reply) => {
    if (!hasScope(request, "secrets:read") && !hasScope(request, "*")) {
      return reply.status(403).send({
        error: {
          type: "AUTH-ERROR",
          code: "INSUFFICIENT_SCOPE",
          message: 'Required scope: "secrets:read"',
        },
      });
    }

    try {
      const secrets = await db
        .select({
          name: vaultSecrets.name,
          service: vaultSecrets.service,
          version: vaultSecrets.version,
          rotation_interval_seconds: vaultSecrets.rotation_interval_seconds,
          last_rotated_at: vaultSecrets.last_rotated_at,
          created_at: vaultSecrets.created_at,
          updated_at: vaultSecrets.updated_at,
        })
        .from(vaultSecrets)
        .where(eq(vaultSecrets.is_deleted, false))
        .orderBy(vaultSecrets.name);

      return reply.status(200).send({
        secrets,
        total: secrets.length,
      });
    } catch (err) {
      logger.error({ err }, "Error listing secrets");
      return reply.status(500).send({
        error: {
          type: "INTERNAL-ERROR",
          code: "LIST_FAILED",
          message: "Failed to list secrets",
        },
      });
    }
  });

  // =========================================================================
  // GET /secrets/:name - Get a secret value (decrypted)
  // =========================================================================
  fastify.get<{ Params: SecretParams }>(
    "/secrets/:name",
    async (request, reply) => {
      if (!hasScope(request, "secrets:read") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "secrets:read"',
          },
        });
      }

      try {
        const { name } = request.params;

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

        // Decrypt the value
        const decryptedValue = encryption.decrypt(secret.encrypted_value);

        // Audit log for secret access
        await db.insert(auditLogs).values({
          actor: request.vaultClaims?.serviceId ?? "unknown",
          action: "SECRET_ACCESSED",
          resource_type: "vault_secret",
          resource_id: name,
          details: { version: secret.version },
          ip_address: request.ip,
        });

        return reply.status(200).send({
          name: secret.name,
          value: decryptedValue,
          service: secret.service,
          version: secret.version,
          rotatedAt: secret.last_rotated_at?.toISOString() ?? null,
          createdAt: secret.created_at?.toISOString() ?? null,
          updatedAt: secret.updated_at?.toISOString() ?? null,
        });
      } catch (err) {
        logger.error({ err }, "Error fetching secret");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "FETCH_FAILED",
            message: "Failed to fetch secret",
          },
        });
      }
    },
  );

  // =========================================================================
  // PUT /secrets/:name - Update a secret
  // =========================================================================
  fastify.put<{ Params: SecretParams; Body: UpdateSecretBody }>(
    "/secrets/:name",
    async (request, reply) => {
      if (!hasScope(request, "secrets:write") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "secrets:write"',
          },
        });
      }

      try {
        const { name } = request.params;
        const { value, service, rotationInterval } = request.body;

        const [existing] = await db
          .select()
          .from(vaultSecrets)
          .where(
            and(
              eq(vaultSecrets.name, name),
              eq(vaultSecrets.is_deleted, false),
            ),
          )
          .limit(1);

        if (!existing) {
          return reply.status(404).send({
            error: {
              type: "NOT-FOUND",
              code: "SECRET_NOT_FOUND",
              message: `Secret "${name}" not found`,
            },
          });
        }

        const updates: Record<string, unknown> = {
          updated_at: new Date(),
        };

        if (value !== undefined) {
          // Move current to previous, encrypt new value
          updates["previous_encrypted_value"] = existing.encrypted_value;
          updates["encrypted_value"] = encryption.encrypt(value);
          updates["version"] = existing.version + 1;
        }

        if (service !== undefined) {
          updates["service"] = service;
        }

        if (rotationInterval !== undefined) {
          updates["rotation_interval_seconds"] = rotationInterval;
        }

        await db
          .update(vaultSecrets)
          .set(updates)
          .where(eq(vaultSecrets.id, existing.id));

        // Audit log
        await db.insert(auditLogs).values({
          actor: request.vaultClaims?.serviceId ?? "unknown",
          action: "SECRET_UPDATED",
          resource_type: "vault_secret",
          resource_id: name,
          details: {
            fields_updated: Object.keys(request.body),
            new_version: updates["version"] ?? existing.version,
          },
          ip_address: request.ip,
        });

        logger.info({ name }, "Secret updated");

        return reply.status(200).send({
          success: true,
          name,
          version: (updates["version"] as number) ?? existing.version,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Error updating secret");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "UPDATE_FAILED",
            message: "Failed to update secret",
          },
        });
      }
    },
  );

  // =========================================================================
  // DELETE /secrets/:name - Soft-delete a secret
  // =========================================================================
  fastify.delete<{ Params: SecretParams }>(
    "/secrets/:name",
    async (request, reply) => {
      if (!hasScope(request, "secrets:write") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "secrets:write"',
          },
        });
      }

      try {
        const { name } = request.params;

        const [existing] = await db
          .select()
          .from(vaultSecrets)
          .where(
            and(
              eq(vaultSecrets.name, name),
              eq(vaultSecrets.is_deleted, false),
            ),
          )
          .limit(1);

        if (!existing) {
          return reply.status(404).send({
            error: {
              type: "NOT-FOUND",
              code: "SECRET_NOT_FOUND",
              message: `Secret "${name}" not found`,
            },
          });
        }

        // Soft-delete
        await db
          .update(vaultSecrets)
          .set({
            is_deleted: true,
            updated_at: new Date(),
          })
          .where(eq(vaultSecrets.id, existing.id));

        // Audit log
        await db.insert(auditLogs).values({
          actor: request.vaultClaims?.serviceId ?? "unknown",
          action: "SECRET_DELETED",
          resource_type: "vault_secret",
          resource_id: name,
          details: {
            service: existing.service,
            version: existing.version,
          },
          ip_address: request.ip,
        });

        logger.info({ name }, "Secret soft-deleted");

        return reply.status(200).send({
          success: true,
          name,
          deletedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Error deleting secret");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "DELETE_FAILED",
            message: "Failed to delete secret",
          },
        });
      }
    },
  );

  // =========================================================================
  // POST /secrets/:name/rotate - Force-rotate a specific secret NOW
  // =========================================================================
  fastify.post<{ Params: SecretParams }>(
    "/secrets/:name/rotate",
    async (request, reply) => {
      if (!hasScope(request, "secrets:rotate") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "secrets:rotate"',
          },
        });
      }

      try {
        const { name } = request.params;

        const result = await rotationScheduler.rotateSecret(name);

        if (!result.success) {
          return reply.status(result.error?.includes("not found") ? 404 : 500).send({
            error: {
              type: result.error?.includes("not found")
                ? "NOT-FOUND"
                : "INTERNAL-ERROR",
              code: "ROTATION_FAILED",
              message: result.error ?? "Failed to rotate secret",
            },
          });
        }

        logger.info({ name, newVersion: result.newVersion }, "Secret force-rotated");

        return reply.status(200).send({
          success: true,
          name,
          newVersion: result.newVersion,
          rotatedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, "Error rotating secret");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "ROTATION_FAILED",
            message: "Failed to rotate secret",
          },
        });
      }
    },
  );

  // =========================================================================
  // GET /secrets/:name/history - Get rotation history from audit logs
  // =========================================================================
  fastify.get<{ Params: SecretParams }>(
    "/secrets/:name/history",
    async (request, reply) => {
      if (!hasScope(request, "secrets:read") && !hasScope(request, "*")) {
        return reply.status(403).send({
          error: {
            type: "AUTH-ERROR",
            code: "INSUFFICIENT_SCOPE",
            message: 'Required scope: "secrets:read"',
          },
        });
      }

      try {
        const { name } = request.params;

        // Verify the secret exists
        const [secret] = await db
          .select({ name: vaultSecrets.name })
          .from(vaultSecrets)
          .where(eq(vaultSecrets.name, name))
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

        // Fetch audit logs related to this secret
        const history = await db
          .select({
            id: auditLogs.id,
            actor: auditLogs.actor,
            action: auditLogs.action,
            details: auditLogs.details,
            ip_address: auditLogs.ip_address,
            created_at: auditLogs.created_at,
          })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.resource_type, "vault_secret"),
              eq(auditLogs.resource_id, name),
            ),
          )
          .orderBy(desc(auditLogs.created_at))
          .limit(100);

        return reply.status(200).send({
          secretName: name,
          history,
          total: history.length,
        });
      } catch (err) {
        logger.error({ err }, "Error fetching secret history");
        return reply.status(500).send({
          error: {
            type: "INTERNAL-ERROR",
            code: "HISTORY_FAILED",
            message: "Failed to fetch secret history",
          },
        });
      }
    },
  );
}
