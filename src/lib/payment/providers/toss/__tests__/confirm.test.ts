import { PaymentProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type {
  NormalizedProviderConfirmResult,
  ProviderConfirmFailed,
  ProviderConfirmSucceeded,
} from "@/lib/payment/providers/contract";
import { createMockPaymentProvider } from "../../mock";
import { resolveProvider } from "../../resolve";
import { PaymentMode } from "../../routing";
import {
  buildTossConfirmRequest,
  normalizeTossConfirmResponse,
  type TossConfirmRequest,
  type TossConfirmRequestBuildInput,
  type TossConfirmRequestBuildResult,
} from "../confirm";
import { classifyTossConfirmError } from "../errors";
import { deriveTossOrderId } from "../order-id";
import {
  buildTossSafeDiagnostics,
  hashTossIdempotencyKey,
  maskTossPaymentKey,
  tossProviderDiagnostics,
} from "../redaction";

const PAYMENT_ID = "pay_123";
const PAYMENT_KEY = "toss_payment_key_1234567890";
const IDEMPOTENCY_KEY = "confirm:TOSS:pay_123";
const AMOUNT = 12_000;
const RECEIVED_AT = new Date("2026-07-07T01:00:00.000Z");
const APPROVED_AT = "2026-07-07T00:59:59.000Z";

describe("Toss confirm request builder", () => {
  it("builds the locked confirm request from local payment fields", () => {
    const request = expectBuilt(buildTossConfirmRequest(baseBuildInput()));

    expect(request).toEqual({
      method: "POST",
      path: "/v1/payments/confirm",
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
      body: {
        paymentKey: PAYMENT_KEY,
        orderId: deriveTossOrderId(PAYMENT_ID),
        amount: AMOUNT,
      },
    });
    expect(request.headers).not.toHaveProperty("Authorization");
  });

  it("derives orderId from paymentId and does not accept callback amount input", () => {
    const input = { ...baseBuildInput(), callbackAmount: AMOUNT + 1 };

    const request = expectBuilt(buildTossConfirmRequest(input));

    expect(request.body.orderId).toBe(deriveTossOrderId(PAYMENT_ID));
    expect(request.body.amount).toBe(AMOUNT);
    expect(request.body).not.toHaveProperty("callbackAmount");
  });

  it("fails before HTTP when providerRef is missing", () => {
    const failure = expectBuildFailure(buildTossConfirmRequest(baseBuildInput({ providerRef: null })));

    expect(failure.classification).toBe("PROGRAMMER_ERROR");
    expect(failure.normalizedCode).toBe("PROVIDER_PROGRAMMER_ERROR");
  });

  it("fails before HTTP when the confirm idempotency key is missing", () => {
    const failure = expectBuildFailure(buildTossConfirmRequest(baseBuildInput({ providerConfirmIdempotencyKey: null })));

    expect(failure.classification).toBe("PROGRAMMER_ERROR");
    expect(failure.normalizedCode).toBe("PROVIDER_PROGRAMMER_ERROR");
  });

  it("fails before HTTP for non-KRW currency in D1", () => {
    const failure = expectBuildFailure(buildTossConfirmRequest(baseBuildInput({ currency: "USD" })));

    expect(failure.classification).toBe("STOP");
    expect(failure.normalizedCode).toBe("PROVIDER_UNSUPPORTED_CONTEXT");
  });

  it.each([
    ["negative", -1],
    ["decimal", 1000.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("fails before HTTP for %s amount", (_caseName, amount) => {
    const failure = expectBuildFailure(buildTossConfirmRequest(baseBuildInput({ amount })));

    expect(failure.classification).toBe("PROGRAMMER_ERROR");
    expect(failure.normalizedCode).toBe("PROVIDER_PROGRAMMER_ERROR");
  });
});

describe("Toss confirm response normalizer", () => {
  it("normalizes DONE with matching identity, amount, and currency to success", () => {
    const success = expectSuccess(normalizeTossConfirmResponse(baseNormalizeInput()));

    expect(success).toMatchObject({
      kind: "succeeded",
      provider: PaymentProvider.TOSS,
      providerPaymentKey: PAYMENT_KEY,
      amountMinor: AMOUNT,
      currency: "KRW",
      rawProviderStatus: "DONE",
      providerRef: PAYMENT_KEY,
      providerOrderId: deriveTossOrderId(PAYMENT_ID),
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(success.capturedAt?.toISOString()).toBe(APPROVED_AT);
    expect(success.approvedAt?.toISOString()).toBe(APPROVED_AT);
  });

  it("uses receivedAt as a diagnostic fallback when DONE omits approvedAt", () => {
    const success = expectSuccess(normalizeTossConfirmResponse(
      baseNormalizeInput({ tossPayment: tossDone({ approvedAt: undefined }) }),
    ));

    expect(success.capturedAt).toEqual(RECEIVED_AT);
    expect(success.approvedAt).toBeUndefined();
    expect(success.diagnostics?.safeMessage).toBe("Toss approvedAt missing; receivedAt fallback used.");
  });

  it("allows absent Toss currency only when the local currency is KRW", () => {
    const success = expectSuccess(normalizeTossConfirmResponse(
      baseNormalizeInput({ tossPayment: tossDone({ currency: undefined }) }),
    ));

    expect(success.currency).toBe("KRW");
  });

  it.each([
    ["non-DONE status", tossDone({ status: "IN_PROGRESS" })],
    ["paymentKey mismatch", tossDone({ paymentKey: "different_payment_key" })],
    ["orderId mismatch", tossDone({ orderId: deriveTossOrderId("other_payment") })],
    ["amount mismatch", tossDone({ totalAmount: AMOUNT + 1 })],
    ["currency mismatch", tossDone({ currency: "USD" })],
    ["malformed object", { status: "DONE" }],
    ["invalid approvedAt", tossDone({ approvedAt: "not-a-date" })],
  ])("does not succeed for %s", (_caseName, tossPayment) => {
    const failure = expectFailure(normalizeTossConfirmResponse(baseNormalizeInput({ tossPayment })));

    expect(failure.kind).toBe("failed");
    expect(failure.classification).not.toBe("RETRYABLE");
  });

  it("fails before normalization if local currency is not KRW", () => {
    const failure = expectFailure(normalizeTossConfirmResponse(baseNormalizeInput({ currency: "USD" })));

    expect(failure.classification).toBe("STOP");
    expect(failure.normalizedCode).toBe("PROVIDER_UNSUPPORTED_CONTEXT");
  });
});

describe("Toss confirm error classifier", () => {
  it("classifies timeout and retryable provider states as retryable", () => {
    expect(classifyTossConfirmError({ kind: "network_timeout", idempotencyKey: IDEMPOTENCY_KEY }))
      .toMatchObject({ kind: "failed", taxonomy: "RETRYABLE", normalizedCode: "PROVIDER_TIMEOUT" });
    expect(classifyTossConfirmError({ kind: "toss_error", httpStatus: 502, idempotencyKey: IDEMPOTENCY_KEY }))
      .toMatchObject({ kind: "failed", taxonomy: "RETRYABLE", normalizedCode: "PROVIDER_UNAVAILABLE" });
    expect(classifyTossConfirmError({ kind: "toss_error", code: "PROVIDER_ERROR", idempotencyKey: IDEMPOTENCY_KEY }))
      .toMatchObject({ kind: "failed", taxonomy: "RETRYABLE" });
    expect(classifyTossConfirmError({ kind: "toss_error", code: "IDEMPOTENT_REQUEST_PROCESSING", idempotencyKey: IDEMPOTENCY_KEY }))
      .toMatchObject({ kind: "failed", taxonomy: "RETRYABLE" });
  });

  it.each([
    "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING",
    "FAILED_INTERNAL_SYSTEM_PROCESSING",
  ])("classifies %s as retryable", (code) => {
    expect(classifyTossConfirmError({ kind: "toss_error", code, idempotencyKey: IDEMPOTENCY_KEY }))
      .toMatchObject({ kind: "failed", taxonomy: "RETRYABLE", normalizedCode: "PROVIDER_UNAVAILABLE" });
  });

  it("classifies auth and key failures as stop", () => {
    for (const code of ["INVALID_API_KEY", "UNAUTHORIZED_KEY", "INCORRECT_BASIC_AUTH_FORMAT"]) {
      expect(classifyTossConfirmError({ kind: "toss_error", code }))
        .toMatchObject({ kind: "failed", taxonomy: "STOP", normalizedCode: "PROVIDER_AUTH_FAILED" });
    }
  });

  it("classifies malformed local request as programmer error", () => {
    expect(classifyTossConfirmError({ kind: "local_malformed", reason: "missing providerRef" }))
      .toMatchObject({ kind: "failed", taxonomy: "PROGRAMMER_ERROR", normalizedCode: "PROVIDER_PROGRAMMER_ERROR" });
  });

  it("keeps already-processed and unknown states in manual review", () => {
    expect(classifyTossConfirmError({ kind: "toss_error", code: "ALREADY_PROCESSED_PAYMENT" }))
      .toMatchObject({ kind: "failed", taxonomy: "MANUAL_REVIEW", providerLookupRequired: true });
    expect(classifyTossConfirmError({ kind: "toss_error", code: "UNKNOWN_PAYMENT_ERROR" }))
      .toMatchObject({ kind: "failed", taxonomy: "MANUAL_REVIEW", providerLookupRequired: true });
    expect(classifyTossConfirmError({ kind: "toss_error", code: "UNSEEN_TOSS_CODE" }))
      .toMatchObject({ kind: "failed", taxonomy: "MANUAL_REVIEW", providerLookupRequired: true });
  });

  it("classifies declines and expired sessions as terminal", () => {
    expect(classifyTossConfirmError({ kind: "toss_error", code: "REJECT_CARD_PAYMENT" }))
      .toMatchObject({ kind: "failed", taxonomy: "TERMINAL", normalizedCode: "PROVIDER_DECLINED" });
    expect(classifyTossConfirmError({ kind: "toss_error", code: "NOT_FOUND_PAYMENT_SESSION" }))
      .toMatchObject({ kind: "failed", taxonomy: "TERMINAL", normalizedCode: "PROVIDER_EXPIRED" });
  });

  it("only reports idempotent success when matching success evidence was separately proven", () => {
    expect(classifyTossConfirmError({ kind: "idempotent_success", idempotencyKey: IDEMPOTENCY_KEY }))
      .toEqual({
        kind: "idempotent_success",
        taxonomy: "IDEMPOTENT_SUCCESS",
        safeMessage: "Same idempotency key returned matching Toss success evidence.",
        idempotencyKey: IDEMPOTENCY_KEY,
      });
    expect(classifyTossConfirmError({ kind: "toss_error", code: "ALREADY_PROCESSED_PAYMENT" }))
      .toMatchObject({ kind: "failed", taxonomy: "MANUAL_REVIEW" });
  });
});

describe("Toss redaction helpers", () => {
  it("masks paymentKey and hashes idempotency key", () => {
    expect(maskTossPaymentKey(PAYMENT_KEY)).toBe("toss_pay...7890");
    expect(hashTossIdempotencyKey(IDEMPOTENCY_KEY)).toHaveLength(12);
    expect(hashTossIdempotencyKey(IDEMPOTENCY_KEY)).not.toBe(IDEMPOTENCY_KEY);
  });

  it("builds bounded diagnostics without raw response, auth, or secrets", () => {
    const diagnostics = buildTossSafeDiagnostics({
      localPaymentId: PAYMENT_ID,
      httpStatus: 409,
      tossCode: "ALREADY_PROCESSED_PAYMENT",
      safeMessage: "x".repeat(200),
      derivedOrderId: deriveTossOrderId(PAYMENT_ID),
      paymentKey: PAYMENT_KEY,
      idempotencyKey: IDEMPOTENCY_KEY,
      providerStatus: "DONE",
    });
    const rendered = Object.values(diagnostics).map(String).join(" ");

    expect(diagnostics.safeMessage).toHaveLength(120);
    expect(rendered).not.toContain(PAYMENT_KEY);
    expect(rendered).not.toContain(IDEMPOTENCY_KEY);
    expect(diagnostics).not.toHaveProperty("rawResponse");
    expect(diagnostics).not.toHaveProperty("Authorization");
    expect(diagnostics).not.toHaveProperty("secretKey");
    expect(diagnostics).not.toHaveProperty("card");
    expect(diagnostics).not.toHaveProperty("receipt");
  });

  it("limits provider diagnostics to the shared safe contract fields", () => {
    const diagnostics = tossProviderDiagnostics({
      httpStatus: 400,
      tossCode: "INVALID_REQUEST",
      safeMessage: "safe class",
      paymentKey: PAYMENT_KEY,
      idempotencyKey: IDEMPOTENCY_KEY,
      providerStatus: "ABORTED",
    });

    expect(diagnostics).toEqual({
      providerStatus: "ABORTED",
      httpStatus: 400,
      providerCode: "INVALID_REQUEST",
      safeMessage: "safe class",
      requestId: hashTossIdempotencyKey(IDEMPOTENCY_KEY),
    });
    expect(diagnostics).not.toHaveProperty("paymentKey");
  });
});

describe("Toss confirm mapper non-wiring", () => {
  it("does not perform provider HTTP while mapping", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    buildTossConfirmRequest(baseBuildInput());
    normalizeTossConfirmResponse(baseNormalizeInput());
    classifyTossConfirmError({ kind: "toss_error", code: "PROVIDER_ERROR" });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps the sandbox resolver on the mock provider", async () => {
    const resolved = resolveProvider({ provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX });
    const explicitMock = createMockPaymentProvider(PaymentProvider.TOSS);

    await expect(resolved.confirm(mockConfirmInput())).resolves.toMatchObject({ providerPaymentKey: "mock:checkout_123" });
    await expect(explicitMock.confirm(mockConfirmInput())).resolves.toMatchObject({ providerPaymentKey: "mock:checkout_123" });
  });
});

function baseBuildInput(overrides: Partial<TossConfirmRequestBuildInput> = {}): TossConfirmRequestBuildInput {
  return {
    paymentId: PAYMENT_ID,
    providerRef: PAYMENT_KEY,
    amount: AMOUNT,
    currency: "KRW",
    providerConfirmIdempotencyKey: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

function baseNormalizeInput(overrides: Partial<Parameters<typeof normalizeTossConfirmResponse>[0]> = {}) {
  return {
    paymentId: PAYMENT_ID,
    providerRef: PAYMENT_KEY,
    providerConfirmIdempotencyKey: IDEMPOTENCY_KEY,
    amount: AMOUNT,
    currency: "KRW",
    receivedAt: RECEIVED_AT,
    tossPayment: tossDone(),
    ...overrides,
  };
}

function tossDone(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paymentKey: PAYMENT_KEY,
    orderId: deriveTossOrderId(PAYMENT_ID),
    status: "DONE",
    totalAmount: AMOUNT,
    currency: "KRW",
    approvedAt: APPROVED_AT,
    ...overrides,
  };
}

function expectBuilt(result: TossConfirmRequestBuildResult): TossConfirmRequest {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.failure.safeMessage);
  return result.request;
}

function expectBuildFailure(result: TossConfirmRequestBuildResult): ProviderConfirmFailed {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected Toss confirm request build failure");
  return result.failure;
}

function expectSuccess(result: NormalizedProviderConfirmResult): ProviderConfirmSucceeded {
  expect(result.kind).toBe("succeeded");
  if (result.kind !== "succeeded") throw new Error("Expected Toss confirm success");
  return result;
}

function expectFailure(result: NormalizedProviderConfirmResult): ProviderConfirmFailed {
  expect(result.kind).toBe("failed");
  if (result.kind !== "failed") throw new Error("Expected Toss confirm failure");
  return result;
}

function mockConfirmInput() {
  return {
    checkoutSessionId: "checkout_123",
    paymentId: PAYMENT_ID,
    provider: PaymentProvider.TOSS,
    providerRef: PAYMENT_KEY,
    providerConfirmIdempotencyKey: IDEMPOTENCY_KEY,
    amount: AMOUNT,
    currency: "KRW",
  };
}
