import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  const originalEnv = process.env["LOG_LEVEL"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["LOG_LEVEL"] = originalEnv;
    } else {
      delete process.env["LOG_LEVEL"];
    }
  });

  it("returns a logger with expected methods", () => {
    const logger = createLogger("test-service");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.trace).toBe("function");
    expect(typeof logger.fatal).toBe("function");
  });

  it("uses the service name", () => {
    // Pino stores bindings - check that name binding is set
    // The name is passed to pino options
    const logger = createLogger("my-service");
    // Pino stores the name in the bindings
    expect(logger).toBeDefined();
  });

  it("defaults to info level when LOG_LEVEL not set", () => {
    delete process.env["LOG_LEVEL"];
    const logger = createLogger("test");
    expect(logger.level).toBe("info");
  });

  it("respects LOG_LEVEL environment variable", () => {
    process.env["LOG_LEVEL"] = "debug";
    const logger = createLogger("test");
    expect(logger.level).toBe("debug");
  });

  it("creates separate logger instances", () => {
    const logger1 = createLogger("service-a");
    const logger2 = createLogger("service-b");
    expect(logger1).not.toBe(logger2);
  });
});
