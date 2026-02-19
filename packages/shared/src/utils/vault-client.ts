import { request } from "undici";
import { createLogger } from "./logger.js";

const logger = createLogger("vault-client");

export interface VaultClientOptions {
  vaultUrl: string;
  serviceId: string;
  internalApiKey?: string;
}

export interface VaultSecret {
  name: string;
  value: string;
  version: number;
  service: string;
  rotatedAt: string | null;
}

/**
 * Client for interacting with the Vault service.
 * Services use this to retrieve their secrets dynamically
 * instead of reading from static environment variables.
 */
export class VaultClient {
  private readonly vaultUrl: string;
  private readonly serviceId: string;
  private readonly internalApiKey: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(options: VaultClientOptions) {
    this.vaultUrl = options.vaultUrl.replace(/\/$/, "");
    this.serviceId = options.serviceId;
    this.internalApiKey = options.internalApiKey ?? "";
  }

  private async ensureToken(): Promise<string> {
    // If we have a valid token with > 5 min remaining, reuse it
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300_000) {
      return this.accessToken;
    }

    try {
      const { statusCode, body } = await request(`${this.vaultUrl}/tokens/issue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-api-key": this.internalApiKey,
        },
        body: JSON.stringify({
          serviceId: this.serviceId,
          scope: ["read"],
          ttl: 3600,
        }),
      });

      if (statusCode !== 200) {
        const text = await body.text();
        throw new Error(`Vault token issue failed (${statusCode}): ${text}`);
      }

      const data = (await body.json()) as { token: string; expiresAt: string };
      this.accessToken = data.token;
      this.tokenExpiresAt = new Date(data.expiresAt).getTime();
      return this.accessToken;
    } catch (err) {
      logger.error({ err }, "Failed to obtain vault token");
      throw err;
    }
  }

  private authHeaders(): Record<string, string> {
    if (this.internalApiKey) {
      return { "x-internal-api-key": this.internalApiKey };
    }
    return {};
  }

  /**
   * Get a secret value from the vault.
   * Falls back to environment variable if vault is unavailable.
   */
  async getSecret(name: string, envFallback?: string): Promise<string> {
    try {
      const token = await this.ensureToken();
      const { statusCode, body } = await request(`${this.vaultUrl}/secrets/${encodeURIComponent(name)}`, {
        method: "GET",
        headers: {
          "x-vault-token": token,
          ...this.authHeaders(),
        },
      });

      if (statusCode === 200) {
        const data = (await body.json()) as VaultSecret;
        return data.value;
      }

      const text = await body.text();
      logger.warn({ name, statusCode, response: text }, "Vault secret fetch failed");
    } catch (err) {
      logger.warn({ err, name }, "Vault unavailable, using fallback");
    }

    // Fallback to environment variable
    if (envFallback !== undefined) {
      return envFallback;
    }
    const envValue = process.env[name];
    if (envValue !== undefined) {
      return envValue;
    }
    throw new Error(`Secret "${name}" not found in vault or environment`);
  }

  /**
   * Store a secret in the vault.
   */
  async setSecret(
    name: string,
    value: string,
    service: string,
    rotationIntervalSeconds?: number,
  ): Promise<void> {
    const { statusCode, body } = await request(`${this.vaultUrl}/secrets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      body: JSON.stringify({
        name,
        value,
        service,
        rotationInterval: rotationIntervalSeconds,
      }),
    });

    if (statusCode !== 200 && statusCode !== 201) {
      const text = await body.text();
      throw new Error(`Vault set secret failed (${statusCode}): ${text}`);
    }
    await body.text(); // consume body
  }

  /**
   * Trigger rotation for a specific secret.
   */
  async rotateSecret(name: string): Promise<void> {
    const { statusCode, body } = await request(
      `${this.vaultUrl}/secrets/${encodeURIComponent(name)}/rotate`,
      {
        method: "POST",
        headers: this.authHeaders(),
      },
    );

    if (statusCode !== 200) {
      const text = await body.text();
      throw new Error(`Vault rotate failed (${statusCode}): ${text}`);
    }
    await body.text();
  }

  /**
   * List all secret names (not values).
   */
  async listSecrets(): Promise<Array<{ name: string; service: string; version: number; lastRotatedAt: string | null }>> {
    const { statusCode, body } = await request(`${this.vaultUrl}/secrets`, {
      method: "GET",
      headers: this.authHeaders(),
    });

    if (statusCode !== 200) {
      const text = await body.text();
      throw new Error(`Vault list secrets failed (${statusCode}): ${text}`);
    }

    return (await body.json()) as Array<{ name: string; service: string; version: number; lastRotatedAt: string | null }>;
  }

  /**
   * Check if vault is healthy and reachable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const { statusCode } = await request(`${this.vaultUrl}/health`, {
        method: "GET",
      });
      return statusCode === 200;
    } catch {
      return false;
    }
  }
}

/**
 * Create a VaultClient from environment variables.
 * VAULT_URL, VAULT_SERVICE_ID, INTERNAL_API_KEY
 */
export function createVaultClient(): VaultClient | null {
  const vaultUrl = process.env["VAULT_URL"];
  if (!vaultUrl) {
    logger.info("VAULT_URL not set, vault client disabled");
    return null;
  }

  return new VaultClient({
    vaultUrl,
    serviceId: process.env["VAULT_SERVICE_ID"] ?? "unknown",
    internalApiKey: process.env["INTERNAL_API_KEY"],
  });
}
