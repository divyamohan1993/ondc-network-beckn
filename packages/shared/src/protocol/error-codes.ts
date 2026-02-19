// ---------------------------------------------------------------------------
// ONDC Error Code Taxonomy
// ---------------------------------------------------------------------------
// 10000-10099: Context errors (missing fields, invalid format)
// 20000-20099: Domain errors (domain not found, unsupported)
// 30000-30099: Policy errors (rate limit, field violations)
// 40000-40099: Business errors (item unavail, order state invalid)
// 50000-50099: Technical errors (internal, timeout, dependency)
// ---------------------------------------------------------------------------

/**
 * High-level error type categories aligned with Beckn protocol NACK types.
 */
export enum OndcErrorType {
  CONTEXT_ERROR = "CONTEXT-ERROR",
  DOMAIN_ERROR = "DOMAIN-ERROR",
  POLICY_ERROR = "POLICY-ERROR",
  BUSINESS_ERROR = "BUSINESS-ERROR",
  TECHNICAL_ERROR = "TECHNICAL-ERROR",
}

/**
 * Comprehensive ONDC error codes.
 *
 * Ranges:
 *   10000-10099  Context errors
 *   20000-20099  Domain errors
 *   30000-30099  Policy errors
 *   40000-40099  Business errors
 *   50000-50099  Technical errors
 */
export enum OndcErrorCode {
  // ---- Context errors (10000-10099) ----------------------------------------
  INVALID_REQUEST = 10000,
  INVALID_SIGNATURE = 10001,
  STALE_REQUEST = 10002,
  INVALID_TTL = 10003,
  INVALID_CONTEXT_DOMAIN = 10004,
  INVALID_CONTEXT_ACTION = 10005,
  INVALID_CONTEXT_CORE_VERSION = 10006,
  INVALID_CONTEXT_BAP_ID = 10007,
  INVALID_CONTEXT_BAP_URI = 10008,
  INVALID_CONTEXT_TRANSACTION_ID = 10009,
  INVALID_CONTEXT_MESSAGE_ID = 10010,
  INVALID_CONTEXT_TIMESTAMP = 10011,
  INVALID_CONTEXT_BPP_ID = 10012,
  INVALID_CONTEXT_BPP_URI = 10013,
  INVALID_CONTEXT_CITY = 10014,
  INVALID_CONTEXT_COUNTRY = 10015,

  // ---- Domain errors (20000-20099) -----------------------------------------
  INTERNAL_ERROR = 20000,
  INVALID_CATALOG = 20001,
  ITEM_NOT_FOUND = 20002,
  ITEM_QUANTITY_UNAVAILABLE = 20003,
  PROVIDER_NOT_FOUND = 20004,
  CATEGORY_NOT_FOUND = 20005,
  FULFILLMENT_NOT_FOUND = 20006,
  DOMAIN_NOT_SUPPORTED = 20007,
  INVALID_DOMAIN_RESPONSE = 20008,

  // ---- Policy errors (30000-30099) -----------------------------------------
  POLICY_VIOLATION = 30000,
  RATE_LIMIT_EXCEEDED = 30001,
  SUBSCRIBER_NOT_FOUND = 30002,
  SUBSCRIBER_KEY_EXPIRED = 30003,
  MANDATORY_FIELD_MISSING = 30004,
  INVALID_FIELD_VALUE = 30005,
  UNSUPPORTED_PAYMENT_TYPE = 30006,
  TERMS_NOT_ACCEPTED = 30007,
  INVALID_LOCATION = 30008,
  INVALID_PRICE = 30009,
  INVALID_QUANTITY = 30010,
  INVALID_FULFILLMENT_TYPE = 30011,
  INVALID_BILLING_INFO = 30012,
  DUPLICATE_REQUEST = 30013,
  REQUEST_ALREADY_PROCESSED = 30014,
  BUYER_FINDER_FEE_VIOLATION = 30015,
  CANCELLATION_NOT_POSSIBLE = 30016,
  RETURN_NOT_POSSIBLE = 30017,
  UPDATE_NOT_POSSIBLE = 30018,

  // ---- Business errors (40000-40099) ---------------------------------------
  BUSINESS_ERROR = 40000,
  ORDER_NOT_FOUND = 40001,
  INVALID_ORDER_STATE_TRANSITION = 40002,
  PAYMENT_FAILED = 40003,
  FULFILLMENT_NOT_POSSIBLE = 40004,
  ORDER_EXPIRED = 40005,
  QUOTE_EXPIRED = 40006,
  PROVIDER_UNAVAILABLE = 40007,
  STORE_CLOSED = 40008,
  LOCATION_UNSERVICEABLE = 40009,
  INSUFFICIENT_INVENTORY = 40010,
  SETTLEMENT_FAILED = 40011,
  REFUND_NOT_POSSIBLE = 40012,

  // ---- Technical errors (50000-50099) --------------------------------------
  TECHNICAL_ERROR = 50000,
  TIMEOUT = 50001,
  DEPENDENCY_FAILURE = 50002,
  REGISTRY_UNAVAILABLE = 50003,
  GATEWAY_UNAVAILABLE = 50004,
  DATABASE_ERROR = 50005,
  CACHE_ERROR = 50006,
  MESSAGE_QUEUE_ERROR = 50007,
  NETWORK_ERROR = 50008,
  SERIALIZATION_ERROR = 50009,
}

// ---------------------------------------------------------------------------
// Error metadata map
// ---------------------------------------------------------------------------

interface OndcErrorMeta {
  type: OndcErrorType;
  code: OndcErrorCode;
  message: string;
}

const ERROR_META: Record<OndcErrorCode, { type: OndcErrorType; message: string }> = {
  // Context errors
  [OndcErrorCode.INVALID_REQUEST]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid request" },
  [OndcErrorCode.INVALID_SIGNATURE]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid signature" },
  [OndcErrorCode.STALE_REQUEST]: { type: OndcErrorType.CONTEXT_ERROR, message: "Stale request (expired timestamp)" },
  [OndcErrorCode.INVALID_TTL]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid TTL" },
  [OndcErrorCode.INVALID_CONTEXT_DOMAIN]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context domain" },
  [OndcErrorCode.INVALID_CONTEXT_ACTION]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context action" },
  [OndcErrorCode.INVALID_CONTEXT_CORE_VERSION]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context core_version" },
  [OndcErrorCode.INVALID_CONTEXT_BAP_ID]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context bap_id" },
  [OndcErrorCode.INVALID_CONTEXT_BAP_URI]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context bap_uri" },
  [OndcErrorCode.INVALID_CONTEXT_TRANSACTION_ID]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context transaction_id" },
  [OndcErrorCode.INVALID_CONTEXT_MESSAGE_ID]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context message_id" },
  [OndcErrorCode.INVALID_CONTEXT_TIMESTAMP]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context timestamp" },
  [OndcErrorCode.INVALID_CONTEXT_BPP_ID]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context bpp_id" },
  [OndcErrorCode.INVALID_CONTEXT_BPP_URI]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context bpp_uri" },
  [OndcErrorCode.INVALID_CONTEXT_CITY]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context city" },
  [OndcErrorCode.INVALID_CONTEXT_COUNTRY]: { type: OndcErrorType.CONTEXT_ERROR, message: "Invalid context country" },

  // Domain errors
  [OndcErrorCode.INTERNAL_ERROR]: { type: OndcErrorType.DOMAIN_ERROR, message: "Internal error" },
  [OndcErrorCode.INVALID_CATALOG]: { type: OndcErrorType.DOMAIN_ERROR, message: "Invalid catalog" },
  [OndcErrorCode.ITEM_NOT_FOUND]: { type: OndcErrorType.DOMAIN_ERROR, message: "Item not found" },
  [OndcErrorCode.ITEM_QUANTITY_UNAVAILABLE]: { type: OndcErrorType.DOMAIN_ERROR, message: "Item quantity unavailable" },
  [OndcErrorCode.PROVIDER_NOT_FOUND]: { type: OndcErrorType.DOMAIN_ERROR, message: "Provider not found" },
  [OndcErrorCode.CATEGORY_NOT_FOUND]: { type: OndcErrorType.DOMAIN_ERROR, message: "Category not found" },
  [OndcErrorCode.FULFILLMENT_NOT_FOUND]: { type: OndcErrorType.DOMAIN_ERROR, message: "Fulfillment not found" },
  [OndcErrorCode.DOMAIN_NOT_SUPPORTED]: { type: OndcErrorType.DOMAIN_ERROR, message: "Domain not supported" },
  [OndcErrorCode.INVALID_DOMAIN_RESPONSE]: { type: OndcErrorType.DOMAIN_ERROR, message: "Invalid domain response" },

  // Policy errors
  [OndcErrorCode.POLICY_VIOLATION]: { type: OndcErrorType.POLICY_ERROR, message: "Policy violation" },
  [OndcErrorCode.RATE_LIMIT_EXCEEDED]: { type: OndcErrorType.POLICY_ERROR, message: "Rate limit exceeded" },
  [OndcErrorCode.SUBSCRIBER_NOT_FOUND]: { type: OndcErrorType.POLICY_ERROR, message: "Subscriber not found" },
  [OndcErrorCode.SUBSCRIBER_KEY_EXPIRED]: { type: OndcErrorType.POLICY_ERROR, message: "Subscriber key expired" },
  [OndcErrorCode.MANDATORY_FIELD_MISSING]: { type: OndcErrorType.POLICY_ERROR, message: "Mandatory field missing" },
  [OndcErrorCode.INVALID_FIELD_VALUE]: { type: OndcErrorType.POLICY_ERROR, message: "Invalid field value" },
  [OndcErrorCode.UNSUPPORTED_PAYMENT_TYPE]: { type: OndcErrorType.POLICY_ERROR, message: "Unsupported payment type" },
  [OndcErrorCode.TERMS_NOT_ACCEPTED]: { type: OndcErrorType.POLICY_ERROR, message: "Terms not accepted" },
  [OndcErrorCode.INVALID_LOCATION]: { type: OndcErrorType.POLICY_ERROR, message: "Invalid location" },
  [OndcErrorCode.INVALID_PRICE]: { type: OndcErrorType.POLICY_ERROR, message: "Invalid price" },
  [OndcErrorCode.INVALID_QUANTITY]: { type: OndcErrorType.POLICY_ERROR, message: "Invalid quantity" },
  [OndcErrorCode.INVALID_FULFILLMENT_TYPE]: { type: OndcErrorType.POLICY_ERROR, message: "Invalid fulfillment type" },
  [OndcErrorCode.INVALID_BILLING_INFO]: { type: OndcErrorType.POLICY_ERROR, message: "Invalid billing information" },
  [OndcErrorCode.DUPLICATE_REQUEST]: { type: OndcErrorType.POLICY_ERROR, message: "Duplicate request" },
  [OndcErrorCode.REQUEST_ALREADY_PROCESSED]: { type: OndcErrorType.POLICY_ERROR, message: "Request already processed" },
  [OndcErrorCode.BUYER_FINDER_FEE_VIOLATION]: { type: OndcErrorType.POLICY_ERROR, message: "Buyer finder fee violation" },
  [OndcErrorCode.CANCELLATION_NOT_POSSIBLE]: { type: OndcErrorType.POLICY_ERROR, message: "Cancellation not possible" },
  [OndcErrorCode.RETURN_NOT_POSSIBLE]: { type: OndcErrorType.POLICY_ERROR, message: "Return not possible" },
  [OndcErrorCode.UPDATE_NOT_POSSIBLE]: { type: OndcErrorType.POLICY_ERROR, message: "Update not possible" },

  // Business errors
  [OndcErrorCode.BUSINESS_ERROR]: { type: OndcErrorType.BUSINESS_ERROR, message: "Business error" },
  [OndcErrorCode.ORDER_NOT_FOUND]: { type: OndcErrorType.BUSINESS_ERROR, message: "Order not found" },
  [OndcErrorCode.INVALID_ORDER_STATE_TRANSITION]: { type: OndcErrorType.BUSINESS_ERROR, message: "Invalid order state transition" },
  [OndcErrorCode.PAYMENT_FAILED]: { type: OndcErrorType.BUSINESS_ERROR, message: "Payment failed" },
  [OndcErrorCode.FULFILLMENT_NOT_POSSIBLE]: { type: OndcErrorType.BUSINESS_ERROR, message: "Fulfillment not possible" },
  [OndcErrorCode.ORDER_EXPIRED]: { type: OndcErrorType.BUSINESS_ERROR, message: "Order expired" },
  [OndcErrorCode.QUOTE_EXPIRED]: { type: OndcErrorType.BUSINESS_ERROR, message: "Quote expired" },
  [OndcErrorCode.PROVIDER_UNAVAILABLE]: { type: OndcErrorType.BUSINESS_ERROR, message: "Provider unavailable" },
  [OndcErrorCode.STORE_CLOSED]: { type: OndcErrorType.BUSINESS_ERROR, message: "Store closed" },
  [OndcErrorCode.LOCATION_UNSERVICEABLE]: { type: OndcErrorType.BUSINESS_ERROR, message: "Location unserviceable" },
  [OndcErrorCode.INSUFFICIENT_INVENTORY]: { type: OndcErrorType.BUSINESS_ERROR, message: "Insufficient inventory" },
  [OndcErrorCode.SETTLEMENT_FAILED]: { type: OndcErrorType.BUSINESS_ERROR, message: "Settlement failed" },
  [OndcErrorCode.REFUND_NOT_POSSIBLE]: { type: OndcErrorType.BUSINESS_ERROR, message: "Refund not possible" },

  // Technical errors
  [OndcErrorCode.TECHNICAL_ERROR]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Technical error" },
  [OndcErrorCode.TIMEOUT]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Timeout" },
  [OndcErrorCode.DEPENDENCY_FAILURE]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Dependency failure" },
  [OndcErrorCode.REGISTRY_UNAVAILABLE]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Registry unavailable" },
  [OndcErrorCode.GATEWAY_UNAVAILABLE]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Gateway unavailable" },
  [OndcErrorCode.DATABASE_ERROR]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Database error" },
  [OndcErrorCode.CACHE_ERROR]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Cache error" },
  [OndcErrorCode.MESSAGE_QUEUE_ERROR]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Message queue error" },
  [OndcErrorCode.NETWORK_ERROR]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Network error" },
  [OndcErrorCode.SERIALIZATION_ERROR]: { type: OndcErrorType.TECHNICAL_ERROR, message: "Serialization error" },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Look up the error type and default message for a given ONDC error code.
 *
 * @param code - An `OndcErrorCode` enum value.
 * @returns Object containing the error type, numeric code, and default message.
 * @throws If the error code is not recognised.
 */
export function ondcError(code: OndcErrorCode): OndcErrorMeta {
  const meta = ERROR_META[code];
  if (!meta) {
    throw new Error(`Unknown ONDC error code: ${code}`);
  }
  return {
    type: meta.type,
    code,
    message: meta.message,
  };
}

/**
 * Derive the `OndcErrorType` from an `OndcErrorCode` based on its numeric range.
 *
 * This is useful when you need the category without looking up the full metadata.
 *
 * @param code - An `OndcErrorCode` enum value.
 * @returns The corresponding `OndcErrorType`.
 */
export function errorTypeFromCode(code: OndcErrorCode): OndcErrorType {
  if (code >= 10000 && code < 20000) return OndcErrorType.CONTEXT_ERROR;
  if (code >= 20000 && code < 30000) return OndcErrorType.DOMAIN_ERROR;
  if (code >= 30000 && code < 40000) return OndcErrorType.POLICY_ERROR;
  if (code >= 40000 && code < 50000) return OndcErrorType.BUSINESS_ERROR;
  if (code >= 50000 && code < 60000) return OndcErrorType.TECHNICAL_ERROR;
  throw new Error(`Error code ${code} does not fall within a known range.`);
}

/**
 * Format an ONDC error into the shape expected by a Beckn NACK `error` field.
 *
 * @param code - An `OndcErrorCode` enum value.
 * @param customMessage - Optional override for the default message.
 * @returns Object with string `type`, `code`, and `message` fields.
 */
export function formatBecknError(
  code: OndcErrorCode,
  customMessage?: string,
): { type: string; code: string; message: string } {
  const meta = ondcError(code);
  return {
    type: meta.type,
    code: String(meta.code),
    message: customMessage ?? meta.message,
  };
}

// ---------------------------------------------------------------------------
// Official ONDC Error Code Taxonomy (per ONDC spec)
// ---------------------------------------------------------------------------
// These codes match the official ONDC error code ranges used across the
// network. The original OndcErrorCode enum above is preserved for backward
// compatibility; new integrations should prefer OndcOfficialErrorCode.
// ---------------------------------------------------------------------------

/**
 * Official ONDC error codes aligned with the published ONDC error code taxonomy.
 *
 * Ranges:
 *   10000-10002  Gateway errors
 *   20000-27502  Buyer NP errors
 *   30000-30023  Seller NP validation errors
 *   31001-31003  Seller NP internal errors
 *   40000-40012  Seller business errors
 *   50001-50008  Seller policy enforcement
 *   60001-66005  Logistics SP errors
 */
export enum OndcOfficialErrorCode {
  // ---- Gateway errors (10000-10002) -----------------------------------------
  GATEWAY_INVALID_REQUEST = "10000",
  GATEWAY_INVALID_SIGNATURE = "10001",
  GATEWAY_INVALID_CITY = "10002",

  // ---- Buyer NP errors (20000-27502) ----------------------------------------
  BUYER_INVALID_REQUEST = "20000",
  BUYER_INVALID_CATALOG = "20001",
  BUYER_STALE_REQUEST = "20002",
  BUYER_PROVIDER_NOT_FOUND = "20003",
  BUYER_ITEM_NOT_FOUND = "20004",
  BUYER_ORDER_STATE_ERROR = "20005",
  BUYER_TIMEOUT = "20006",
  BUYER_UNSUPPORTED_ACTION = "21001",
  BUYER_QUANTITY_EXCEEDED = "22501",
  BUYER_QUOTE_CHANGED = "22502",
  BUYER_PAYMENT_NOT_SUPPORTED = "22503",
  BUYER_FULFILLMENT_UNAVAILABLE = "22504",
  BUYER_CANCELLATION_NOT_POSSIBLE = "22505",
  BUYER_UPDATE_NOT_POSSIBLE = "22506",
  BUYER_RATING_NOT_APPLICABLE = "22507",
  BUYER_RETURN_NOT_POSSIBLE = "22508",
  BUYER_TERMS_REJECTED = "22509",
  BUYER_INTERNAL_ERROR = "23001",
  BUYER_CONFIRM_FAILED = "23002",

  // ---- Seller NP errors (30000-31003) ---------------------------------------
  SELLER_INVALID_REQUEST = "30000",
  SELLER_PROVIDER_NOT_FOUND = "30001",
  SELLER_PROVIDER_UNAVAILABLE = "30002",
  SELLER_ITEM_NOT_FOUND = "30003",
  SELLER_ITEM_QUANTITY_UNAVAILABLE = "30004",
  SELLER_QUOTE_UNAVAILABLE = "30005",
  SELLER_ORDER_NOT_FOUND = "30006",
  SELLER_CATALOG_ERROR = "30007",
  SELLER_SERVICEABILITY_ERROR = "30009",
  SELLER_RETURN_UNAVAILABLE = "30016",
  SELLER_INTERNAL_ERROR = "31001",
  SELLER_PROCESSING = "31002",

  // ---- Seller business errors (40000-40002) ---------------------------------
  SELLER_QUANTITY_UNAVAILABLE = "40000",
  SELLER_PAYMENT_PENDING = "40001",
  SELLER_PAYMENT_FAILED = "40002",

  // ---- Seller policy enforcement (50001-50003) ------------------------------
  SELLER_CANCELLATION_REJECTED = "50001",
  SELLER_UPDATE_REJECTED = "50002",
  SELLER_TERMS_REJECTED = "50003",

  // ---- Logistics SP errors (60001-66001) ------------------------------------
  LSP_NOT_SERVICEABLE = "60001",
  LSP_AGENT_UNAVAILABLE = "60003",
  LSP_INTERNAL_ERROR = "66001",
}

// ---------------------------------------------------------------------------
// Mapping from legacy OndcErrorCode to OndcOfficialErrorCode
// ---------------------------------------------------------------------------

const LEGACY_TO_OFFICIAL: Partial<Record<OndcErrorCode, string>> = {
  // Context → Gateway
  [OndcErrorCode.INVALID_REQUEST]: OndcOfficialErrorCode.GATEWAY_INVALID_REQUEST,
  [OndcErrorCode.INVALID_SIGNATURE]: OndcOfficialErrorCode.GATEWAY_INVALID_SIGNATURE,
  [OndcErrorCode.INVALID_CONTEXT_CITY]: OndcOfficialErrorCode.GATEWAY_INVALID_CITY,
  [OndcErrorCode.STALE_REQUEST]: OndcOfficialErrorCode.BUYER_STALE_REQUEST,
  [OndcErrorCode.INVALID_CONTEXT_ACTION]: OndcOfficialErrorCode.BUYER_UNSUPPORTED_ACTION,

  // Domain → Buyer NP / Seller NP
  [OndcErrorCode.INTERNAL_ERROR]: OndcOfficialErrorCode.BUYER_INTERNAL_ERROR,
  [OndcErrorCode.INVALID_CATALOG]: OndcOfficialErrorCode.BUYER_INVALID_CATALOG,
  [OndcErrorCode.ITEM_NOT_FOUND]: OndcOfficialErrorCode.BUYER_ITEM_NOT_FOUND,
  [OndcErrorCode.ITEM_QUANTITY_UNAVAILABLE]: OndcOfficialErrorCode.SELLER_ITEM_QUANTITY_UNAVAILABLE,
  [OndcErrorCode.PROVIDER_NOT_FOUND]: OndcOfficialErrorCode.SELLER_PROVIDER_NOT_FOUND,
  [OndcErrorCode.FULFILLMENT_NOT_FOUND]: OndcOfficialErrorCode.BUYER_FULFILLMENT_UNAVAILABLE,

  // Policy → Seller NP / Buyer NP
  [OndcErrorCode.UNSUPPORTED_PAYMENT_TYPE]: OndcOfficialErrorCode.BUYER_PAYMENT_NOT_SUPPORTED,
  [OndcErrorCode.TERMS_NOT_ACCEPTED]: OndcOfficialErrorCode.BUYER_TERMS_REJECTED,
  [OndcErrorCode.CANCELLATION_NOT_POSSIBLE]: OndcOfficialErrorCode.BUYER_CANCELLATION_NOT_POSSIBLE,
  [OndcErrorCode.RETURN_NOT_POSSIBLE]: OndcOfficialErrorCode.BUYER_RETURN_NOT_POSSIBLE,
  [OndcErrorCode.UPDATE_NOT_POSSIBLE]: OndcOfficialErrorCode.BUYER_UPDATE_NOT_POSSIBLE,
  [OndcErrorCode.INVALID_QUANTITY]: OndcOfficialErrorCode.BUYER_QUANTITY_EXCEEDED,

  // Business → Seller business / Seller policy
  [OndcErrorCode.ORDER_NOT_FOUND]: OndcOfficialErrorCode.SELLER_ORDER_NOT_FOUND,
  [OndcErrorCode.PAYMENT_FAILED]: OndcOfficialErrorCode.SELLER_PAYMENT_FAILED,
  [OndcErrorCode.PROVIDER_UNAVAILABLE]: OndcOfficialErrorCode.SELLER_PROVIDER_UNAVAILABLE,
  [OndcErrorCode.LOCATION_UNSERVICEABLE]: OndcOfficialErrorCode.LSP_NOT_SERVICEABLE,
  [OndcErrorCode.INSUFFICIENT_INVENTORY]: OndcOfficialErrorCode.SELLER_QUANTITY_UNAVAILABLE,
  [OndcErrorCode.QUOTE_EXPIRED]: OndcOfficialErrorCode.BUYER_QUOTE_CHANGED,

  // Technical → Buyer NP / Seller NP
  [OndcErrorCode.TIMEOUT]: OndcOfficialErrorCode.BUYER_TIMEOUT,
  [OndcErrorCode.TECHNICAL_ERROR]: OndcOfficialErrorCode.SELLER_INTERNAL_ERROR,
};

/**
 * Map a legacy `OndcErrorCode` to the closest official ONDC error code string.
 *
 * If no direct mapping exists, returns the numeric code as a string.
 *
 * @param code - A legacy `OndcErrorCode` enum value.
 * @returns The official ONDC error code string (e.g. "30001").
 */
export function mapToOfficialCode(code: OndcErrorCode): string {
  return LEGACY_TO_OFFICIAL[code] ?? String(code);
}

/**
 * Default human-readable messages for each official ONDC error code.
 */
const OFFICIAL_ERROR_MESSAGES: Record<OndcOfficialErrorCode, string> = {
  // Gateway
  [OndcOfficialErrorCode.GATEWAY_INVALID_REQUEST]: "Invalid request",
  [OndcOfficialErrorCode.GATEWAY_INVALID_SIGNATURE]: "Invalid signature",
  [OndcOfficialErrorCode.GATEWAY_INVALID_CITY]: "Invalid city code",

  // Buyer NP
  [OndcOfficialErrorCode.BUYER_INVALID_REQUEST]: "Invalid request from buyer NP",
  [OndcOfficialErrorCode.BUYER_INVALID_CATALOG]: "Invalid catalog response",
  [OndcOfficialErrorCode.BUYER_STALE_REQUEST]: "Stale request",
  [OndcOfficialErrorCode.BUYER_PROVIDER_NOT_FOUND]: "Provider not found",
  [OndcOfficialErrorCode.BUYER_ITEM_NOT_FOUND]: "Item not found",
  [OndcOfficialErrorCode.BUYER_ORDER_STATE_ERROR]: "Invalid order state",
  [OndcOfficialErrorCode.BUYER_TIMEOUT]: "Request timed out",
  [OndcOfficialErrorCode.BUYER_UNSUPPORTED_ACTION]: "Unsupported action",
  [OndcOfficialErrorCode.BUYER_QUANTITY_EXCEEDED]: "Quantity exceeded",
  [OndcOfficialErrorCode.BUYER_QUOTE_CHANGED]: "Quote has changed",
  [OndcOfficialErrorCode.BUYER_PAYMENT_NOT_SUPPORTED]: "Payment type not supported",
  [OndcOfficialErrorCode.BUYER_FULFILLMENT_UNAVAILABLE]: "Fulfillment unavailable",
  [OndcOfficialErrorCode.BUYER_CANCELLATION_NOT_POSSIBLE]: "Cancellation not possible",
  [OndcOfficialErrorCode.BUYER_UPDATE_NOT_POSSIBLE]: "Update not possible",
  [OndcOfficialErrorCode.BUYER_RATING_NOT_APPLICABLE]: "Rating not applicable",
  [OndcOfficialErrorCode.BUYER_RETURN_NOT_POSSIBLE]: "Return not possible",
  [OndcOfficialErrorCode.BUYER_TERMS_REJECTED]: "Terms rejected",
  [OndcOfficialErrorCode.BUYER_INTERNAL_ERROR]: "Internal error at buyer NP",
  [OndcOfficialErrorCode.BUYER_CONFIRM_FAILED]: "Confirm failed at buyer NP",

  // Seller NP
  [OndcOfficialErrorCode.SELLER_INVALID_REQUEST]: "Invalid request at seller NP",
  [OndcOfficialErrorCode.SELLER_PROVIDER_NOT_FOUND]: "Provider not found at seller NP",
  [OndcOfficialErrorCode.SELLER_PROVIDER_UNAVAILABLE]: "Provider unavailable",
  [OndcOfficialErrorCode.SELLER_ITEM_NOT_FOUND]: "Item not found at seller NP",
  [OndcOfficialErrorCode.SELLER_ITEM_QUANTITY_UNAVAILABLE]: "Item quantity unavailable",
  [OndcOfficialErrorCode.SELLER_QUOTE_UNAVAILABLE]: "Quote unavailable",
  [OndcOfficialErrorCode.SELLER_ORDER_NOT_FOUND]: "Order not found at seller NP",
  [OndcOfficialErrorCode.SELLER_CATALOG_ERROR]: "Catalog error at seller NP",
  [OndcOfficialErrorCode.SELLER_SERVICEABILITY_ERROR]: "Serviceability error",
  [OndcOfficialErrorCode.SELLER_RETURN_UNAVAILABLE]: "Return unavailable",
  [OndcOfficialErrorCode.SELLER_INTERNAL_ERROR]: "Internal error at seller NP",
  [OndcOfficialErrorCode.SELLER_PROCESSING]: "Request is being processed",

  // Seller business
  [OndcOfficialErrorCode.SELLER_QUANTITY_UNAVAILABLE]: "Quantity unavailable",
  [OndcOfficialErrorCode.SELLER_PAYMENT_PENDING]: "Payment pending",
  [OndcOfficialErrorCode.SELLER_PAYMENT_FAILED]: "Payment failed",

  // Seller policy
  [OndcOfficialErrorCode.SELLER_CANCELLATION_REJECTED]: "Cancellation rejected",
  [OndcOfficialErrorCode.SELLER_UPDATE_REJECTED]: "Update rejected",
  [OndcOfficialErrorCode.SELLER_TERMS_REJECTED]: "Terms rejected by seller",

  // Logistics
  [OndcOfficialErrorCode.LSP_NOT_SERVICEABLE]: "Location not serviceable",
  [OndcOfficialErrorCode.LSP_AGENT_UNAVAILABLE]: "Logistics agent unavailable",
  [OndcOfficialErrorCode.LSP_INTERNAL_ERROR]: "Internal error at logistics SP",
};

/**
 * Format an official ONDC error code into the shape expected by a Beckn NACK `error` field.
 *
 * @param code - An `OndcOfficialErrorCode` enum value.
 * @param message - Optional custom message. Falls back to the default message for the code.
 * @returns Object with string `type`, `code`, and `message` fields.
 */
export function formatOfficialBecknError(
  code: OndcOfficialErrorCode,
  message?: string,
): { type: string; code: string; message: string } {
  const numericCode = parseInt(code, 10);
  let type: string;
  if (numericCode >= 10000 && numericCode < 20000) {
    type = OndcErrorType.CONTEXT_ERROR;
  } else if (numericCode >= 20000 && numericCode < 30000) {
    type = OndcErrorType.DOMAIN_ERROR;
  } else if (numericCode >= 30000 && numericCode < 40000) {
    type = OndcErrorType.POLICY_ERROR;
  } else if (numericCode >= 40000 && numericCode < 50000) {
    type = OndcErrorType.BUSINESS_ERROR;
  } else {
    type = OndcErrorType.TECHNICAL_ERROR;
  }

  return {
    type,
    code,
    message: message ?? OFFICIAL_ERROR_MESSAGES[code] ?? "Unknown error",
  };
}
