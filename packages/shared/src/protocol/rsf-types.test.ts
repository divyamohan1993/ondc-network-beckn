import { describe, it, expect } from "vitest";
import { SettlementBasis, SettlementPhase, NocsTxnStatus } from "./rsf-types.js";

// ---------------------------------------------------------------------------
// SettlementBasis enum
// ---------------------------------------------------------------------------

describe("SettlementBasis", () => {
  it("should have Collection value", () => {
    expect(SettlementBasis.Collection).toBe("collection");
  });

  it("should have Shipment value", () => {
    expect(SettlementBasis.Shipment).toBe("shipment");
  });

  it("should have Delivery value", () => {
    expect(SettlementBasis.Delivery).toBe("delivery");
  });

  it("should have ReturnWindow value", () => {
    expect(SettlementBasis.ReturnWindow).toBe("return_window");
  });

  it("should have string values (not numeric)", () => {
    for (const value of Object.values(SettlementBasis)) {
      expect(typeof value).toBe("string");
      expect(Number.isNaN(Number(value))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SettlementPhase enum
// ---------------------------------------------------------------------------

describe("SettlementPhase", () => {
  it("should have CollectorSettlement value", () => {
    expect(SettlementPhase.CollectorSettlement).toBe("collector_settlement");
  });

  it("should have ReceiverSettlement value", () => {
    expect(SettlementPhase.ReceiverSettlement).toBe("receiver_settlement");
  });

  it("should have NetSettlement value", () => {
    expect(SettlementPhase.NetSettlement).toBe("net_settlement");
  });

  it("should have string values (not numeric)", () => {
    for (const value of Object.values(SettlementPhase)) {
      expect(typeof value).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// NocsTxnStatus enum
// ---------------------------------------------------------------------------

describe("NocsTxnStatus", () => {
  it("should have Initiated value", () => {
    expect(NocsTxnStatus.Initiated).toBe("INITIATED");
  });

  it("should have Pending value", () => {
    expect(NocsTxnStatus.Pending).toBe("PENDING");
  });

  it("should have Settled value", () => {
    expect(NocsTxnStatus.Settled).toBe("SETTLED");
  });

  it("should have Failed value", () => {
    expect(NocsTxnStatus.Failed).toBe("FAILED");
  });

  it("should have Disputed value", () => {
    expect(NocsTxnStatus.Disputed).toBe("DISPUTED");
  });

  it("should have Reversed value", () => {
    expect(NocsTxnStatus.Reversed).toBe("REVERSED");
  });

  it("should have string values (not numeric)", () => {
    for (const value of Object.values(NocsTxnStatus)) {
      expect(typeof value).toBe("string");
      expect(Number.isNaN(Number(value))).toBe(true);
    }
  });
});
