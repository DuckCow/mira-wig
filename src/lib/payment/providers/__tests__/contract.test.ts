import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  PROVIDER_DIAGNOSTIC_FIELDS,
  type NormalizedProviderInitiateResult,
  type ProviderConfirmFailed,
  type ProviderConfirmSucceeded,
  type ProviderDiagnostics,
  type ProviderErrorCode,
  type ProviderFailureClass,
  type ProviderVoidResult,
} from "../contract";

describe("provider adapter contract types", () => {
  it("allows initiate providerRef without a final providerPaymentKey", () => {
    const result = {
      kind: "redirect",
      provider: PaymentProvider.TOSS,
      approveUrl: "https://pay.example.test/approve/pref_123",
      providerRef: "pref_123",
      providerOrderId: "order_123",
      idempotencyKey: "initiate:session_123:attempt_1",
      diagnostics: { providerStatus: "READY", requestId: "req_123" },
    } satisfies NormalizedProviderInitiateResult;

    expect(result.providerRef).toBe("pref_123");
    expect(result).not.toHaveProperty("providerPaymentKey");
  });

  it("requires confirm success to carry the final providerPaymentKey", () => {
    const result = {
      kind: "succeeded",
      provider: PaymentProvider.PAYPAL,
      providerPaymentKey: "capture_final_123",
      providerRef: "order_pref_123",
      amountMinor: 12_000,
      currency: "USD",
      capturedAt: new Date("2026-08-01T00:00:00.000Z"),
      approvedAt: new Date("2026-08-01T00:00:01.000Z"),
      idempotencyKey: "confirm:PAYPAL:payment_123",
      rawProviderStatus: "COMPLETED",
    } satisfies ProviderConfirmSucceeded;

    expect(result.providerPaymentKey).toBe("capture_final_123");
    expect(result.providerRef).toBe("order_pref_123");
  });

  it("distinguishes confirm failure classes", () => {
    const failures: ProviderConfirmFailed[] = [
      confirmFailure("RETRYABLE", "PROVIDER_TIMEOUT"),
      confirmFailure("TERMINAL", "PROVIDER_DECLINED"),
      confirmFailure("MANUAL_REVIEW", "PROVIDER_STATE_AMBIGUOUS", true, true),
      confirmFailure("STOP", "PROVIDER_AUTH_FAILED"),
      confirmFailure("PROGRAMMER_ERROR", "PROVIDER_PROGRAMMER_ERROR"),
    ];

    expect(failures.map((failure) => failure.classification)).toEqual([
      "RETRYABLE",
      "TERMINAL",
      "MANUAL_REVIEW",
      "STOP",
      "PROGRAMMER_ERROR",
    ]);
    expect(failures[2]?.providerLookupRequired).toBe(true);
  });

  it("keeps diagnostics to a redacted allowlisted shape", () => {
    const diagnostics = {
      providerStatus: "DECLINED",
      httpStatus: 402,
      providerCode: "CARD_DECLINED",
      safeMessage: "Card declined by provider.",
      requestId: "req_safe_123",
    } satisfies ProviderDiagnostics;

    expect(Object.keys(diagnostics).sort()).toEqual([...PROVIDER_DIAGNOSTIC_FIELDS].sort());
    expect(PROVIDER_DIAGNOSTIC_FIELDS).not.toContain("authorization");
    expect(PROVIDER_DIAGNOSTIC_FIELDS).not.toContain("signature");
    expect(PROVIDER_DIAGNOSTIC_FIELDS).not.toContain("rawBody");
  });

  it("distinguishes real-provider void result taxonomy", () => {
    const results: ProviderVoidResult[] = [
      { kind: "succeeded" },
      { kind: "idempotent_succeeded", providerStatus: "ALREADY_CANCELED" },
      { kind: "retryable", normalizedCode: "PROVIDER_UNAVAILABLE", safeMessage: "Safe retryable message." },
      { kind: "terminal", normalizedCode: "PROVIDER_CANCELED", safeMessage: "Safe terminal message." },
      {
        kind: "manual_review",
        normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
        safeMessage: "Safe manual review message.",
        ambiguousProviderState: true,
      },
      { kind: "auth_stop", normalizedCode: "PROVIDER_AUTH_FAILED", safeMessage: "Safe auth stop message." },
      { kind: "invalid_request_stop", normalizedCode: "PROVIDER_INVALID_REQUEST", safeMessage: "Safe invalid request message." },
      {
        kind: "ambiguous_state",
        normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
        safeMessage: "Safe ambiguous state message.",
        providerLookupRequired: true,
      },
    ];

    expect(results.map((result) => result.kind)).toEqual([
      "succeeded",
      "idempotent_succeeded",
      "retryable",
      "terminal",
      "manual_review",
      "auth_stop",
      "invalid_request_stop",
      "ambiguous_state",
    ]);
  });
});

function confirmFailure(
  classification: ProviderFailureClass,
  normalizedCode: ProviderErrorCode,
  ambiguousProviderState = false,
  providerLookupRequired = false,
): ProviderConfirmFailed {
  return {
    kind: "failed",
    provider: PaymentProvider.TOSS,
    classification,
    normalizedCode,
    safeMessage: "Safe provider failure message.",
    ambiguousProviderState,
    providerLookupRequired,
    diagnostics: { providerCode: normalizedCode },
  };
}
