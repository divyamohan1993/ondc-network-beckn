import { describe, it, expect } from "vitest";
import {
  OndcFeature,
  buildFeatureListTag,
  parseFeatureListTag,
  DEFAULT_BPP_FEATURES,
  DEFAULT_BAP_FEATURES,
} from "./feature-list.js";

// ---------------------------------------------------------------------------
// buildFeatureListTag
// ---------------------------------------------------------------------------

describe("buildFeatureListTag", () => {
  it('should return a tag with code "feature_list"', () => {
    const tag = buildFeatureListTag(new Set());
    expect(tag.code).toBe("feature_list");
  });

  it("should include all OndcFeature values in the list", () => {
    const allFeatures = Object.values(OndcFeature);
    const tag = buildFeatureListTag(new Set());
    const codes = tag.list.map((entry) => entry.code);
    for (const feature of allFeatures) {
      expect(codes).toContain(feature);
    }
    expect(tag.list).toHaveLength(allFeatures.length);
  });

  it('should set value "yes" for enabled features', () => {
    const enabled = new Set([OndcFeature.SEARCH, OndcFeature.CONFIRM]);
    const tag = buildFeatureListTag(enabled);

    const searchEntry = tag.list.find((e) => e.code === OndcFeature.SEARCH);
    const confirmEntry = tag.list.find((e) => e.code === OndcFeature.CONFIRM);
    expect(searchEntry?.value).toBe("yes");
    expect(confirmEntry?.value).toBe("yes");
  });

  it('should set value "no" for disabled features', () => {
    const enabled = new Set([OndcFeature.SEARCH]);
    const tag = buildFeatureListTag(enabled);

    const cancelEntry = tag.list.find((e) => e.code === OndcFeature.CANCEL);
    const igmEntry = tag.list.find((e) => e.code === OndcFeature.IGM);
    expect(cancelEntry?.value).toBe("no");
    expect(igmEntry?.value).toBe("no");
  });

  it("should mark all features as yes when all are enabled", () => {
    const allEnabled = new Set(Object.values(OndcFeature));
    const tag = buildFeatureListTag(allEnabled);
    for (const entry of tag.list) {
      expect(entry.value).toBe("yes");
    }
  });

  it("should mark all features as no when none are enabled", () => {
    const tag = buildFeatureListTag(new Set());
    for (const entry of tag.list) {
      expect(entry.value).toBe("no");
    }
  });
});

// ---------------------------------------------------------------------------
// parseFeatureListTag
// ---------------------------------------------------------------------------

describe("parseFeatureListTag", () => {
  it("should parse enabled features back into a Set", () => {
    const tag = buildFeatureListTag(new Set([OndcFeature.SEARCH, OndcFeature.TRACK]));
    const parsed = parseFeatureListTag(tag);
    expect(parsed.has(OndcFeature.SEARCH)).toBe(true);
    expect(parsed.has(OndcFeature.TRACK)).toBe(true);
    expect(parsed.has(OndcFeature.CANCEL)).toBe(false);
  });

  it("should return empty set for non-feature_list tag", () => {
    const parsed = parseFeatureListTag({ code: "other", list: [] });
    expect(parsed.size).toBe(0);
  });

  it("should ignore unknown feature codes", () => {
    const tag = {
      code: "feature_list",
      list: [{ code: "unknown_feature", value: "yes" }],
    };
    const parsed = parseFeatureListTag(tag);
    expect(parsed.size).toBe(0);
  });

  it("should roundtrip buildFeatureListTag -> parseFeatureListTag", () => {
    const original = new Set([OndcFeature.SEARCH, OndcFeature.IGM, OndcFeature.P2H2P]);
    const tag = buildFeatureListTag(original);
    const parsed = parseFeatureListTag(tag);
    expect(parsed).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_BPP_FEATURES and DEFAULT_BAP_FEATURES
// ---------------------------------------------------------------------------

describe("DEFAULT_BPP_FEATURES", () => {
  it("should be a non-empty Set", () => {
    expect(DEFAULT_BPP_FEATURES.size).toBeGreaterThan(0);
  });

  it("should contain only valid OndcFeature values", () => {
    const validFeatures = new Set(Object.values(OndcFeature));
    for (const feature of DEFAULT_BPP_FEATURES) {
      expect(validFeatures.has(feature)).toBe(true);
    }
  });

  it("should include core retail features", () => {
    expect(DEFAULT_BPP_FEATURES.has(OndcFeature.SEARCH)).toBe(true);
    expect(DEFAULT_BPP_FEATURES.has(OndcFeature.SELECT)).toBe(true);
    expect(DEFAULT_BPP_FEATURES.has(OndcFeature.INIT)).toBe(true);
    expect(DEFAULT_BPP_FEATURES.has(OndcFeature.CONFIRM)).toBe(true);
  });
});

describe("DEFAULT_BAP_FEATURES", () => {
  it("should be a non-empty Set", () => {
    expect(DEFAULT_BAP_FEATURES.size).toBeGreaterThan(0);
  });

  it("should contain only valid OndcFeature values", () => {
    const validFeatures = new Set(Object.values(OndcFeature));
    for (const feature of DEFAULT_BAP_FEATURES) {
      expect(validFeatures.has(feature)).toBe(true);
    }
  });

  it("should include core retail features", () => {
    expect(DEFAULT_BAP_FEATURES.has(OndcFeature.SEARCH)).toBe(true);
    expect(DEFAULT_BAP_FEATURES.has(OndcFeature.SELECT)).toBe(true);
    expect(DEFAULT_BAP_FEATURES.has(OndcFeature.INIT)).toBe(true);
    expect(DEFAULT_BAP_FEATURES.has(OndcFeature.CONFIRM)).toBe(true);
  });
});
