import { PaymentMode, PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  classifyEximbayRefundType,
  createEximbayRefundPreflightConfig,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  fingerprintEximbayRefundObservation,
  serializeEximbayRefundObservationFingerprint,
  type EximbayRefundObservationFingerprintInput,
  type EximbayRefundPreflightFacts,
} from "../preflight-contract";

const FACTS: EximbayRefundPreflightFacts = Object.freeze({
  mid: "mid-1",
  providerOrderId: "order-1",
  providerTransactionId: "transaction-1",
  providerStatus: "SALE",
  currency: "USD",
  originalAmount: 1_234,
  refundableBalance: 1_000,
});

describe("Eximbay refund preflight contract", () => {
  it("freezes the exact observation fingerprint vector", () => {
    const input: EximbayRefundObservationFingerprintInput = {
      refundAttemptId: "refund-1",
      commandId: "command-1",
      bindingId: "binding-1",
      observingLeaseGeneration: 3,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      merchantAccountBindingId: "merchant-1",
      credentialGenerationBindingId: "generation-1",
      wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
      facts: FACTS,
      observedAt: new Date("2026-08-20T01:02:03.456Z"),
    };
    expect(serializeEximbayRefundObservationFingerprint(input)).toBe(
      '["refund-eximbay-preflight-observation/v1","refund-1","command-1","binding-1",3,"EXIMBAY","SANDBOX","merchant-1","generation-1","refund-provider-eximbay-cancel-wire/v1","refund-provider-eximbay-inquiry/v1","refund-provider-eximbay-inquiry-parser/v1","mid-1","order-1","transaction-1","SALE","USD",1234,1000,"2026-08-20T01:02:03.456Z"]',
    );
    expect(fingerprintEximbayRefundObservation(input)).toBe(
      "80d4ac69b141bbbdf60a12abfffba5b8130edbb70da4ba353d8140cbd1797947",
    );
  });

  it("preserves the adjudicated 512-byte capacity without truncation", () => {
    expect(createEximbayRefundPreflightConfig({
      mode: PaymentMode.SANDBOX,
      mid: "m".repeat(512),
      merchantAccountBindingId: "merchant-1",
      credentialGenerationBindingId: "generation-1",
    }).mid).toHaveLength(512);
    expect(() => createEximbayRefundPreflightConfig({
      mode: PaymentMode.SANDBOX,
      mid: "m".repeat(513),
      merchantAccountBindingId: "merchant-1",
      credentialGenerationBindingId: "generation-1",
    })).toThrow("INVALID_EXIMBAY_REFUND_MID");
  });

  it.each([
    ["full", classifier(), { ok: true, refundType: "F" }],
    ["partial request", classifier({ requestedAmount: 400 }), { ok: true, refundType: "P" }],
    ["prior success", classifier({ successfulRefundAmount: 234, requestedAmount: 1_000 }), { ok: true, refundType: "P" }],
    ["zero balance", classifier({ observation: { ...FACTS, refundableBalance: 0 } }), { ok: false, code: "REFUND_NOT_LAWFUL" }],
    ["insufficient", classifier({ requestedAmount: 1_001, observation: FACTS }), { ok: false, code: "REFUND_NOT_LAWFUL" }],
    ["currency mismatch", classifier({ paymentCurrency: "JPY" }), { ok: false, code: "REFUND_NOT_LAWFUL" }],
    ["amount mismatch", classifier({ paymentAmount: 1_235 }), { ok: false, code: "REFUND_NOT_LAWFUL" }],
    ["ambiguous history", classifier({ historyCoherent: false }), { ok: false, code: "REFUND_NOT_LAWFUL" }],
  ])("classifies %s deterministically", (_label, input, expected) => {
    expect(classifyEximbayRefundType(input)).toEqual(expected);
  });
});

function classifier(override: Partial<Parameters<typeof classifyEximbayRefundType>[0]> = {}) {
  const successfulRefundAmount = override.successfulRefundAmount ?? 0;
  return {
    requestedAmount: 1_234,
    paymentAmount: 1_234,
    paymentCurrency: "USD",
    successfulRefundAmount,
    historyCoherent: true,
    observation: { ...FACTS, refundableBalance: 1_234 - successfulRefundAmount },
    ...override,
  };
}
