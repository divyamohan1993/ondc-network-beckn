import { randomUUID } from "node:crypto";
import type { BecknContext, BecknAction, BecknCallbackAction } from "./types.js";

/** Default TTL for Beckn requests (30 seconds as ISO 8601 duration). */
const DEFAULT_TTL = "PT30S";

export interface BuildContextParams {
  domain: string;
  country?: string;
  city?: string;
  action: BecknAction | BecknCallbackAction | string;
  core_version?: string;
  bap_id: string;
  bap_uri: string;
  bpp_id?: string;
  bpp_uri?: string;
  transaction_id?: string;
  /**
   * Message ID. For callback actions (on_search, on_select, on_init, on_confirm,
   * on_status, on_track, on_cancel, on_update, on_rating, on_support), this
   * MUST be the same message_id from the originating request per ONDC spec.
   * A new UUID is generated automatically only if omitted.
   */
  message_id?: string;
  timestamp?: string;
  key?: string;
  ttl?: string;
  max_callbacks?: number;
}

/**
 * Build a valid Beckn context object.
 *
 * Emits both v1.1 flat fields (country, city, core_version) and v1.2 nested
 * fields (location, version) for backwards compatibility with all ONDC participants.
 *
 * Auto-generates transaction_id (UUID), message_id (UUID), and timestamp (ISO)
 * if not explicitly provided. Defaults TTL to PT30S per ONDC spec.
 *
 * @param params - Context parameters. domain, action, bap_id, bap_uri are required.
 * @returns A fully populated BecknContext object.
 */
export function buildContext(params: BuildContextParams): BecknContext {
  const country = params.country ?? "IND";
  const city = params.city ?? "std:080";

  return {
    domain: params.domain,
    // v1.1 flat fields (backwards compatibility)
    country,
    city,
    // v1.2 nested location object
    location: {
      country: { code: country },
      city: { code: city },
    },
    action: params.action,
    // v1.1 version field
    core_version: params.core_version ?? "1.2.0",
    // v1.2 version field
    version: params.core_version ?? "1.2.0",
    bap_id: params.bap_id,
    bap_uri: params.bap_uri,
    bpp_id: params.bpp_id,
    bpp_uri: params.bpp_uri,
    transaction_id: params.transaction_id ?? randomUUID(),
    message_id: params.message_id ?? randomUUID(),
    timestamp: params.timestamp ?? new Date().toISOString(),
    ttl: params.ttl ?? DEFAULT_TTL,
    ...(params.key != null ? { key: params.key } : {}),
    ...(params.max_callbacks != null ? { max_callbacks: params.max_callbacks } : {}),
  };
}
