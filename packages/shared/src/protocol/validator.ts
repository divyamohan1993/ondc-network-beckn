import { BecknAction, BecknCallbackAction } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// UUID v4 pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ISO 8601 timestamp pattern (basic check)
const ISO_TIMESTAMP_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// ISO 8601 duration pattern (e.g. PT30S, PT5M, P1D)
const ISO_DURATION_REGEX = /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/;

// All valid actions (both request and callback, including IGM)
const VALID_ACTIONS = new Set<string>([
  ...Object.values(BecknAction),
  ...Object.values(BecknCallbackAction),
  // IGM actions
  "issue", "on_issue", "issue_status", "on_issue_status",
  // RSP actions
  "receiver_recon", "on_receiver_recon", "collector_recon", "on_collector_recon",
]);

/**
 * Parse an ISO 8601 duration string to milliseconds.
 * Supports PT{n}S, PT{n}M, PT{n}H formats.
 * @returns milliseconds, or null if invalid.
 */
export function parseDurationToMs(duration: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return null;

  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Validate an incoming Beckn protocol request.
 *
 * Checks:
 *   - context is present and is an object
 *   - message is present and is an object
 *   - context.action is a valid Beckn/IGM/RSP action
 *   - context.domain is a non-empty string
 *   - context.country or context.location.country.code is present
 *   - context.city or context.location.city.code is present
 *   - context.core_version or context.version is present
 *   - context.bap_id is a non-empty string
 *   - context.bap_uri is a non-empty string
 *   - context.transaction_id is a valid UUID
 *   - context.message_id is a valid UUID
 *   - context.timestamp is a valid ISO 8601 timestamp and not stale
 *   - context.ttl is a valid ISO 8601 duration (if present)
 */
export function validateBecknRequest(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    errors.push("Request body must be a non-null object.");
    return { valid: false, errors };
  }

  const request = body as Record<string, unknown>;

  if (!request["context"] || typeof request["context"] !== "object") {
    errors.push("context is required and must be an object.");
  }

  if (!request["message"] || typeof request["message"] !== "object") {
    errors.push("message is required and must be an object.");
  }

  if (!request["context"] || typeof request["context"] !== "object") {
    return { valid: false, errors };
  }

  const context = request["context"] as Record<string, unknown>;

  // domain is always required
  if (typeof context["domain"] !== "string" || context["domain"].trim().length === 0) {
    errors.push("context.domain is required and must be a non-empty string.");
  }

  // bap_id and bap_uri are always required
  if (typeof context["bap_id"] !== "string" || context["bap_id"].trim().length === 0) {
    errors.push("context.bap_id is required and must be a non-empty string.");
  }
  if (typeof context["bap_uri"] !== "string" || context["bap_uri"].trim().length === 0) {
    errors.push("context.bap_uri is required and must be a non-empty string.");
  }

  // country: accept either flat or nested location
  const hasCountryFlat = typeof context["country"] === "string" && context["country"].trim().length > 0;
  const location = context["location"] as Record<string, unknown> | undefined;
  const hasCountryNested = location
    && typeof location === "object"
    && location["country"]
    && typeof (location["country"] as Record<string, unknown>)["code"] === "string";
  if (!hasCountryFlat && !hasCountryNested) {
    errors.push("context.country or context.location.country.code is required.");
  }

  // city: accept either flat or nested location
  const hasCityFlat = typeof context["city"] === "string" && context["city"].trim().length > 0;
  const hasCityNested = location
    && typeof location === "object"
    && location["city"]
    && typeof (location["city"] as Record<string, unknown>)["code"] === "string";
  if (!hasCityFlat && !hasCityNested) {
    errors.push("context.city or context.location.city.code is required.");
  }

  // version: accept either core_version (v1.1) or version (v1.2)
  const hasCoreVersion = typeof context["core_version"] === "string" && context["core_version"].trim().length > 0;
  const hasVersion = typeof context["version"] === "string" && context["version"].trim().length > 0;
  if (!hasCoreVersion && !hasVersion) {
    errors.push("context.core_version or context.version is required.");
  }

  // Action validation
  const action = context["action"];
  if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
    errors.push(
      `context.action must be a valid Beckn action. Received: "${String(action)}".`,
    );
  }

  // ONDC spec: Callback actions (on_*) and non-search request actions
  // MUST include bpp_id and bpp_uri in the context.
  // - All on_* callbacks always require bpp_id/bpp_uri (BPP is responding)
  // - Non-search actions (select, init, confirm, etc.) target a specific BPP
  // - Only "search" is exempt since it's broadcast through the gateway
  if (typeof action === "string") {
    const isCallback = action.startsWith("on_");
    const isSearch = action === "search";
    const CALLBACK_AND_RSP_ACTIONS = new Set([
      ...Object.values(BecknCallbackAction),
      "on_issue", "on_issue_status",
      "on_receiver_recon", "on_collector_recon",
    ]);

    if (isCallback || CALLBACK_AND_RSP_ACTIONS.has(action)) {
      if (typeof context["bpp_id"] !== "string" || context["bpp_id"].trim().length === 0) {
        errors.push("context.bpp_id is required for callback actions.");
      }
      if (typeof context["bpp_uri"] !== "string" || context["bpp_uri"].trim().length === 0) {
        errors.push("context.bpp_uri is required for callback actions.");
      }
    } else if (!isSearch && VALID_ACTIONS.has(action)) {
      // Non-search request actions should also have bpp_id/bpp_uri (warn-level, not reject)
      // Per ONDC spec, select/init/confirm/status/track/cancel/update/rating/support
      // are directed at a specific BPP
      if (typeof context["bpp_id"] !== "string" || context["bpp_id"].trim().length === 0) {
        errors.push("context.bpp_id is required for non-search actions.");
      }
      if (typeof context["bpp_uri"] !== "string" || context["bpp_uri"].trim().length === 0) {
        errors.push("context.bpp_uri is required for non-search actions.");
      }
    }
  }

  // transaction_id must be a valid UUID
  const transactionId = context["transaction_id"];
  if (typeof transactionId !== "string" || !UUID_REGEX.test(transactionId)) {
    errors.push("context.transaction_id is required and must be a valid UUID v4.");
  }

  // message_id must be a valid UUID
  const messageId = context["message_id"];
  if (typeof messageId !== "string" || !UUID_REGEX.test(messageId)) {
    errors.push("context.message_id is required and must be a valid UUID v4.");
  }

  // timestamp must be valid ISO 8601 and not stale
  const timestamp = context["timestamp"];
  if (typeof timestamp !== "string" || !ISO_TIMESTAMP_REGEX.test(timestamp)) {
    errors.push("context.timestamp is required and must be a valid ISO 8601 timestamp.");
  } else {
    const tsDate = new Date(timestamp);
    const now = Date.now();
    // Reject timestamps more than 5 minutes in the past (stale request)
    if (now - tsDate.getTime() > 5 * 60 * 1000) {
      errors.push("context.timestamp is stale (more than 5 minutes old).");
    }
    // Reject timestamps more than 30 seconds in the future
    if (tsDate.getTime() - now > 30 * 1000) {
      errors.push("context.timestamp is in the future.");
    }
  }

  // TTL validation (if present, must be valid ISO 8601 duration)
  const ttl = context["ttl"];
  if (ttl !== undefined && ttl !== null) {
    if (typeof ttl !== "string" || !ISO_DURATION_REGEX.test(ttl)) {
      errors.push("context.ttl must be a valid ISO 8601 duration (e.g. PT30S).");
    }
  }

  // TTL expiry enforcement: reject messages where timestamp + ttl has elapsed
  if (ttl !== undefined && typeof ttl === "string" && typeof timestamp === "string") {
    const ttlMs = parseDurationToMs(ttl);
    if (ttlMs !== null) {
      const tsDate = new Date(timestamp as string);
      const expiresAt = tsDate.getTime() + ttlMs;
      if (Date.now() > expiresAt) {
        errors.push("Message has expired based on timestamp + ttl.");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a message_id has been seen before (for duplicate detection).
 * Returns true if the message_id is a duplicate.
 * Uses Redis for distributed dedup with 5-minute TTL.
 *
 * @param messageId - The message_id from the Beckn context.
 * @param redisClient - A Redis client with get/set methods.
 * @returns true if the message_id has already been processed (duplicate).
 */
export async function checkDuplicateMessageId(
  messageId: string,
  redisClient: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, mode: string, ttl: number) => Promise<string | null>;
  },
): Promise<boolean> {
  const key = `msg:dedup:${messageId}`;
  const exists = await redisClient.get(key);
  if (exists) return true;
  await redisClient.set(key, "1", "EX", 300); // 5 min TTL
  return false;
}
