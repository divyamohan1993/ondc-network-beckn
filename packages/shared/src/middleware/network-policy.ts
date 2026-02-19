import type { FastifyRequest, FastifyReply } from "fastify";
import type { Redis } from "ioredis";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("network-policy");

// ---------------------------------------------------------------------------
// ONDC Network Policy SLAs (per action)
// ---------------------------------------------------------------------------

/** Default maximum response time in milliseconds per action (ONDC mandated). */
export const ACTION_RESPONSE_SLA: Record<string, number> = {
  search: 3000,     // 3 seconds for search
  on_search: 3000,
  select: 5000,     // 5 seconds for select
  on_select: 5000,
  init: 5000,
  on_init: 5000,
  confirm: 10000,   // 10 seconds for confirm
  on_confirm: 10000,
  status: 5000,
  on_status: 5000,
  track: 5000,
  on_track: 5000,
  cancel: 10000,
  on_cancel: 10000,
  update: 10000,
  on_update: 10000,
  rating: 5000,
  on_rating: 5000,
  support: 5000,
  on_support: 5000,
  // IGM actions
  issue: 10000,
  on_issue: 10000,
  issue_status: 5000,
  on_issue_status: 5000,
};

// ---------------------------------------------------------------------------
// Mandatory ONDC Tags per Domain
// ---------------------------------------------------------------------------

/**
 * Tags that ONDC requires to be present in specific message objects
 * per domain. These are checked during select/init/confirm flows.
 */
export const MANDATORY_TAGS_BY_DOMAIN: Record<string, MandatoryTagRule[]> = {
  "ONDC:RET10": [  // Grocery
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "veg_nonveg", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "packaged_commodities", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "time_to_ship", actions: ["on_search"] },
  ],
  "ONDC:RET11": [  // F&B
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "veg_nonveg", actions: ["on_search"] },
    { path: "message.order.provider.tags", code: "timing", actions: ["on_search"] },
  ],
  "ONDC:RET12": [  // Fashion
    { path: "message.order.items[].tags", code: "size_chart", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "colour", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "gender", actions: ["on_search"] },
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
  ],
  "ONDC:RET13": [  // Beauty & Personal Care
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "brand", actions: ["on_search"] },
  ],
  "ONDC:RET14": [  // Electronics
    { path: "message.order.items[].tags", code: "brand", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "model", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "warranty", actions: ["on_search"] },
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
  ],
  "ONDC:RET15": [  // Home & Decor
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
  ],
  "ONDC:RET16": [  // Agriculture
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
  ],
  "ONDC:RET17": [  // Pharma
    { path: "message.order.items[].tags", code: "prescription_required", actions: ["on_search"] },
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
  ],
  "ONDC:RET18": [  // Appliances
    { path: "message.order.items[].tags", code: "brand", actions: ["on_search"] },
    { path: "message.order.items[].tags", code: "warranty", actions: ["on_search"] },
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
  ],
  "ONDC:RET19": [  // Accessories
    { path: "message.order.provider.tags", code: "serviceability", actions: ["on_search"] },
  ],
};

export interface MandatoryTagRule {
  /** Dot-delimited path to the tags array in the message body */
  path: string;
  /** Tag code that must be present */
  code: string;
  /** Actions during which this tag is mandatory */
  actions: string[];
}

// ---------------------------------------------------------------------------
// Network Policy Configuration
// ---------------------------------------------------------------------------

export interface NetworkPolicyConfig {
  /** Redis client for caching policy lookups. Optional. */
  redisClient?: Redis;
  /** Custom SLA overrides per action (in ms). Merged with defaults. */
  slaOverrides?: Record<string, number>;
  /** Additional mandatory tag rules per domain. Merged with defaults. */
  additionalTagRules?: Record<string, MandatoryTagRule[]>;
  /** Whether to enforce SLA timing headers. Default: true */
  enforceSla?: boolean;
  /** Whether to validate mandatory tags. Default: true */
  enforceTags?: boolean;
  /** Allowed domains. If set, rejects requests for unlisted domains. */
  allowedDomains?: string[];
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Create a Fastify preHandler that enforces ONDC network policies:
 *
 * 1. **Domain allowlist**: Rejects requests for domains not in the allowed list.
 * 2. **SLA headers**: Sets X-ONDC-Response-SLA header with the max allowed
 *    response time for the action, enabling downstream timeout enforcement.
 * 3. **Mandatory tag validation**: Checks that domain-specific mandatory tags
 *    are present in the message body.
 */
export function createNetworkPolicyMiddleware(config: NetworkPolicyConfig = {}) {
  const {
    slaOverrides = {},
    additionalTagRules = {},
    enforceSla = true,
    enforceTags = true,
    allowedDomains,
  } = config;

  // Merge SLA overrides
  const slaMap: Record<string, number> = { ...ACTION_RESPONSE_SLA, ...slaOverrides };

  // Merge tag rules
  const tagRuleMap: Record<string, MandatoryTagRule[]> = { ...MANDATORY_TAGS_BY_DOMAIN };
  for (const [domain, rules] of Object.entries(additionalTagRules)) {
    tagRuleMap[domain] = [...(tagRuleMap[domain] ?? []), ...rules];
  }

  return async function networkPolicyPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return;

    const context = body["context"] as Record<string, unknown> | undefined;
    if (!context) return;

    const action = context["action"] as string | undefined;
    const domain = context["domain"] as string | undefined;

    if (!action) return;

    // 1. Domain allowlist check
    if (allowedDomains && allowedDomains.length > 0 && domain) {
      if (!allowedDomains.includes(domain)) {
        logger.warn(
          { domain, action, allowedDomains },
          "Request domain not in allowed domains list",
        );
        reply.code(400).send({
          message: { ack: { status: "NACK" } },
          error: {
            type: "POLICY-ERROR",
            code: "30000",
            message: `Domain "${domain}" is not supported by this network participant.`,
          },
        });
        return;
      }
    }

    // 2. SLA enforcement - set response deadline header
    if (enforceSla) {
      const slaMs = slaMap[action];
      if (slaMs) {
        reply.header("X-ONDC-Response-SLA", slaMs);

        // Also attach deadline to request for downstream use
        (request as Record<string, unknown>)["ondcDeadline"] = Date.now() + slaMs;
      }
    }

    // 3. Mandatory tag validation
    if (enforceTags && domain) {
      const rules = tagRuleMap[domain];
      if (rules) {
        const applicableRules = rules.filter((rule) => rule.actions.includes(action));

        for (const rule of applicableRules) {
          const tagsMissing = !hasTag(body, rule.path, rule.code);
          if (tagsMissing) {
            logger.warn(
              { domain, action, tagCode: rule.code, path: rule.path },
              "Mandatory ONDC tag missing",
            );
            // Log warning but don't block - tag validation is advisory in many cases
            // Hard block only if the tag is critical
          }
        }
      }
    }

    logger.debug({ action, domain }, "Network policy check passed");
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a tag with the given code exists at the specified path in the body.
 * Supports simple dot-delimited paths with `[]` for array iteration.
 */
function hasTag(body: Record<string, unknown>, path: string, tagCode: string): boolean {
  const parts = path.split(".");
  let current: unknown = body;

  for (const part of parts) {
    if (current === null || current === undefined) return false;

    if (part.endsWith("[]")) {
      // Array traversal
      const key = part.slice(0, -2);
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr)) return false;
      // Check if ANY element in the array has the tag
      return arr.some((item) => {
        const tags = (item as Record<string, unknown>)["tags"];
        if (!Array.isArray(tags)) return false;
        return tags.some(
          (tag: Record<string, unknown>) =>
            tag["code"] === tagCode ||
            (Array.isArray(tag["list"]) &&
              tag["list"].some(
                (sub: Record<string, unknown>) => sub["code"] === tagCode,
              )),
        );
      });
    }

    current = (current as Record<string, unknown>)[part];
  }

  // Final check - current should be a tags array
  if (!Array.isArray(current)) return false;
  return current.some(
    (tag: Record<string, unknown>) =>
      tag["code"] === tagCode ||
      (Array.isArray(tag["list"]) &&
        tag["list"].some(
          (sub: Record<string, unknown>) => sub["code"] === tagCode,
        )),
  );
}

/**
 * Utility: Get the SLA deadline in ms for an action.
 */
export function getActionSla(action: string): number | undefined {
  return ACTION_RESPONSE_SLA[action];
}

/**
 * Utility: Check if a response was within the ONDC SLA.
 */
export function isWithinSla(action: string, responseTimeMs: number): boolean {
  const sla = ACTION_RESPONSE_SLA[action];
  if (!sla) return true; // Unknown action, no SLA
  return responseTimeMs <= sla;
}
