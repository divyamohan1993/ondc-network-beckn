/**
 * ONDC Feature List - declares supported flows per network participant.
 * Required in on_search catalog responses and during subscription.
 */

export enum OndcFeature {
  // Retail flows
  SEARCH = "search",
  SELECT = "select",
  INIT = "init",
  CONFIRM = "confirm",
  STATUS = "status",
  TRACK = "track",
  CANCEL = "cancel",
  UPDATE = "update",
  RATING = "rating",
  SUPPORT = "support",
  // IGM
  IGM = "igm",
  // RSF
  RSF = "rsf",
  // Cancellation types
  BUYER_CANCEL = "buyer_cancel",
  SELLER_CANCEL = "seller_cancel",
  FORCE_CANCEL = "force_cancel",
  // Return types
  BUYER_RETURN = "buyer_return",
  SELLER_RETURN = "seller_return",
  // Fulfillment routing
  P2P = "p2p",
  P2H2P = "p2h2p",
}

export interface FeatureListEntry {
  code: string;
  value: string; // "yes" or "no"
}

/**
 * Build a feature list tag for on_search responses.
 * @param enabledFeatures - Set of enabled features
 * @returns Tag object with code "feature_list" and feature entries
 */
export function buildFeatureListTag(enabledFeatures: Set<OndcFeature>): {
  code: string;
  list: FeatureListEntry[];
} {
  const allFeatures = Object.values(OndcFeature);
  return {
    code: "feature_list",
    list: allFeatures.map((feature) => ({
      code: feature,
      value: enabledFeatures.has(feature) ? "yes" : "no",
    })),
  };
}

/**
 * Parse a feature list tag back into a Set of enabled features.
 * @param tag - Tag object with code "feature_list" and list entries
 * @returns Set of enabled OndcFeature values
 */
export function parseFeatureListTag(tag: {
  code: string;
  list: FeatureListEntry[];
}): Set<OndcFeature> {
  if (tag.code !== "feature_list") return new Set();
  const validFeatures = new Set<string>(Object.values(OndcFeature));
  const enabled = new Set<OndcFeature>();
  for (const entry of tag.list) {
    if (entry.value === "yes" && validFeatures.has(entry.code)) {
      enabled.add(entry.code as OndcFeature);
    }
  }
  return enabled;
}

/**
 * Default feature set for a standard BPP.
 */
export const DEFAULT_BPP_FEATURES = new Set<OndcFeature>([
  OndcFeature.SEARCH, OndcFeature.SELECT, OndcFeature.INIT,
  OndcFeature.CONFIRM, OndcFeature.STATUS, OndcFeature.TRACK,
  OndcFeature.CANCEL, OndcFeature.UPDATE, OndcFeature.RATING,
  OndcFeature.SUPPORT, OndcFeature.IGM, OndcFeature.RSF,
  OndcFeature.BUYER_CANCEL, OndcFeature.SELLER_CANCEL,
  OndcFeature.BUYER_RETURN, OndcFeature.P2P,
]);

/**
 * Default feature set for a standard BAP.
 */
export const DEFAULT_BAP_FEATURES = new Set<OndcFeature>([
  OndcFeature.SEARCH, OndcFeature.SELECT, OndcFeature.INIT,
  OndcFeature.CONFIRM, OndcFeature.STATUS, OndcFeature.TRACK,
  OndcFeature.CANCEL, OndcFeature.UPDATE, OndcFeature.RATING,
  OndcFeature.SUPPORT, OndcFeature.IGM, OndcFeature.RSF,
  OndcFeature.BUYER_CANCEL, OndcFeature.BUYER_RETURN,
]);
