import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnvironment, type EnvRequirement } from "./env-validator.js";

describe("validateEnvironment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env
    vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("passes when all required vars are present", () => {
    process.env["TEST_VAR"] = "value";
    const result = validateEnvironment(
      [{ name: "TEST_VAR", required: true }],
      false,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.values["TEST_VAR"]).toBe("value");
  });

  it("fails when required var is missing", () => {
    delete process.env["MISSING_VAR"];
    const result = validateEnvironment(
      [{ name: "MISSING_VAR", required: true, description: "test" }],
      false,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("MISSING_VAR");
  });

  it("uses default for optional var", () => {
    delete process.env["OPT_VAR"];
    const result = validateEnvironment(
      [{ name: "OPT_VAR", required: false, default: "fallback" }],
      false,
    );
    expect(result.valid).toBe(true);
    expect(result.values["OPT_VAR"]).toBe("fallback");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns for optional var without default", () => {
    delete process.env["OPT_NO_DEFAULT"];
    const result = validateEnvironment(
      [{ name: "OPT_NO_DEFAULT", required: false }],
      false,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("treats empty string as missing", () => {
    process.env["EMPTY_VAR"] = "";
    const result = validateEnvironment(
      [{ name: "EMPTY_VAR", required: true }],
      false,
    );
    expect(result.valid).toBe(false);
  });

  it("calls process.exit when exitOnError is true", () => {
    delete process.env["CRITICAL_VAR"];
    validateEnvironment(
      [{ name: "CRITICAL_VAR", required: true }],
      true,
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("handles mixed required and optional vars", () => {
    process.env["REQ_VAR"] = "present";
    delete process.env["OPT_VAR_2"];
    const result = validateEnvironment(
      [
        { name: "REQ_VAR", required: true },
        { name: "OPT_VAR_2", required: false, default: "default_val" },
      ],
      false,
    );
    expect(result.valid).toBe(true);
    expect(result.values["REQ_VAR"]).toBe("present");
    expect(result.values["OPT_VAR_2"]).toBe("default_val");
  });
});
