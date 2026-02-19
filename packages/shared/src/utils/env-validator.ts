/**
 * Environment Variable Validator
 *
 * Validates that required environment variables are present at service startup.
 * Prevents cryptic runtime errors from missing configuration.
 */

import { createLogger } from "./logger.js";

const logger = createLogger("env-validator");

export interface EnvRequirement {
  /** Environment variable name */
  name: string;
  /** Whether the variable is required (service won't start without it) */
  required: boolean;
  /** Default value if not set (only for optional vars) */
  default?: string;
  /** Description for error messages */
  description?: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  values: Record<string, string>;
}

/**
 * Validate environment variables against a set of requirements.
 *
 * @param requirements - Array of environment variable requirements
 * @param exitOnError - If true, process.exit(1) on validation failure. Default: true
 * @returns Validation result with resolved values
 */
export function validateEnvironment(
  requirements: EnvRequirement[],
  exitOnError = true,
): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const values: Record<string, string> = {};

  for (const req of requirements) {
    const value = process.env[req.name];

    if (value === undefined || value === "") {
      if (req.required) {
        errors.push(
          `Missing required env var: ${req.name}${req.description ? ` (${req.description})` : ""}`,
        );
      } else if (req.default !== undefined) {
        values[req.name] = req.default;
        warnings.push(
          `${req.name} not set, using default: "${req.default}"`,
        );
      } else {
        warnings.push(
          `Optional env var ${req.name} not set${req.description ? ` (${req.description})` : ""}`,
        );
      }
    } else {
      values[req.name] = value;
    }
  }

  if (warnings.length > 0) {
    logger.warn({ warnings }, "Environment variable warnings");
  }

  if (errors.length > 0) {
    logger.error({ errors }, "Environment variable validation failed");
    if (exitOnError) {
      process.exit(1);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    values,
  };
}

// ---------------------------------------------------------------------------
// Service-specific requirement sets
// ---------------------------------------------------------------------------

export const REGISTRY_ENV_REQUIREMENTS: EnvRequirement[] = [
  { name: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
  { name: "REDIS_URL", required: false, default: "redis://localhost:6379", description: "Redis connection string" },
  { name: "REGISTRY_PORT", required: false, default: "3001", description: "Registry service port" },
  { name: "REGISTRY_SIGNING_PRIVATE_KEY", required: false, description: "Ed25519 private key for signing" },
  { name: "REGISTRY_ENCRYPTION_PRIVATE_KEY", required: false, description: "X25519 private key for on_subscribe" },
];

export const GATEWAY_ENV_REQUIREMENTS: EnvRequirement[] = [
  { name: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
  { name: "REDIS_URL", required: false, default: "redis://localhost:6379" },
  { name: "RABBITMQ_URL", required: false, default: "amqp://guest:guest@localhost:5672" },
  { name: "REGISTRY_URL", required: false, default: "http://localhost:3001" },
  { name: "GATEWAY_PORT", required: false, default: "3002" },
  { name: "GATEWAY_PRIVATE_KEY", required: false, description: "Ed25519 key for signing search fan-out" },
  { name: "GATEWAY_SUBSCRIBER_ID", required: false, description: "Gateway subscriber ID" },
  { name: "GATEWAY_KEY_ID", required: false, description: "Gateway key ID for auth header" },
];

export const BAP_ENV_REQUIREMENTS: EnvRequirement[] = [
  { name: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
  { name: "REDIS_URL", required: false, default: "redis://localhost:6379" },
  { name: "REGISTRY_URL", required: false, default: "http://localhost:3001" },
  { name: "BAP_PORT", required: false, default: "3004" },
  { name: "BAP_ID", required: false, default: "bap.example.com", description: "BAP subscriber ID" },
  { name: "BAP_URI", required: false, description: "BAP callback URI" },
  { name: "BAP_PRIVATE_KEY", required: false, description: "Ed25519 private key for signing" },
  { name: "BAP_UNIQUE_KEY_ID", required: false, default: "key-1" },
  { name: "GATEWAY_URL", required: false, default: "http://localhost:3002", description: "Gateway URL for search" },
];

export const BPP_ENV_REQUIREMENTS: EnvRequirement[] = [
  { name: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
  { name: "REDIS_URL", required: false, default: "redis://localhost:6379" },
  { name: "REGISTRY_URL", required: false, default: "http://localhost:3001" },
  { name: "BPP_PORT", required: false, default: "3005" },
  { name: "BPP_ID", required: false, default: "bpp.example.com", description: "BPP subscriber ID" },
  { name: "BPP_URI", required: false, description: "BPP callback URI" },
  { name: "BPP_PRIVATE_KEY", required: false, description: "Ed25519 private key for signing" },
  { name: "BPP_UNIQUE_KEY_ID", required: false, default: "key-1" },
];
