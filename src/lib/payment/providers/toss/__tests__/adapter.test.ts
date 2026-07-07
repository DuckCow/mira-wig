import { PaymentProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { GET as tossSuccessRoute } from "@/app/api/payments/toss/success/route";
import type { NormalizedProviderConfirmResult, ProviderConfirmFailed, ProviderConfirmSucceeded } from "@/lib/payment/providers/contract";
import { createMockPaymentProvider } from "../../mock";
import { resolveProvider } from "../../resolve";
import { PaymentMode } from "../../routing";
import type { PaymentConfirmInput } from "../../types";
import {
  createTossConfirmAdapter,
  type TossConfirmHttpClient,
  type TossConfirmHttpRequest,
  type TossConfirmHttpResult,
} from "../adapter";
import { deriveTossOrderId } from "../order-id";

const PAYMENT_ID = "pay_123";
const CHECKOUT_SESSION_ID = "checkout_123";
const PAYMENT_KEY = "toss_payment_key_1234567890";
const IDEMPOTENCY_KEY = "confirm:TOSS:pay_123";
const AMOUNT = 12_000;
const APPROVED_AT = "2026-07-07T00:59:59.000Z";

describe("Toss confirm fake HTTP adapter seam", () => {
  it("builds the Toss confirm request and passes it to the fake HTTP client", async () => {
    const fake = recordingClient(response(tossDone()));
    const adapter = createTossConfirmAdapter({ httpClient: fake.client });

    await adapter.confirm(confirmInput());

    expect(fake.calls).toEqual([{
      method: "POST",
      path: "/v1/payments/confirm",
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
      body: {
        paymentKey: PAYMENT_KEY,
        orderId: deriveTossOrderId(PAYMENT_ID),
        amount: AMOUNT,
      },
    }]);
    expect(fake.calls[0]?.headers).not.toHaveProperty("Authorization");
  });

  it("returns normalized success for a valid fake DONE response", async () => {
    const adapter = createTossConfirmAdapter({ httpClient: recordingClient(response(tossDone())).client });

    const success = expectSuccess(await adapter.confirm(confirmInput()));

    expect(success).toMatchObject({
      provider: PaymentProvider.TOSS,
      providerPaymentKey: PAYMENT_KEY,
      providerRef: PAYMENT_KEY,
      providerOrderId: deriveTossOrderId(PAYMENT_ID),
      amountMinor: AMOUNT,
      currency: "KRW",
      idempotencyKey: IDEMPOTENCY_KEY,
      rawProviderStatus: "DONE",
    });
    expect(success.capturedAt?.toISOString()).toBe(APPROVED_AT);
  });

  it("returns manual review instead of success for a mismatch response", async () => {
    const adapter = createTossConfirmAdapter({
      httpClient: recordingClient(response(tossDone({ totalAmount: AMOUNT + 1 }))).client,
    });

    const failure = expectFailure(await adapter.confirm(confirmInput()));

    expect(failure).toMatchObject({
      classification: "MANUAL_REVIEW",
      normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
      providerLookupRequired: true,
    });
    expect(failure).not.toHaveProperty("providerPaymentKey");
  });

  it.each([
    ["IDEMPOTENT_REQUEST_PROCESSING", "RETRYABLE"],
    ["PROVIDER_ERROR", "RETRYABLE"],
    ["ALREADY_PROCESSED_PAYMENT", "MANUAL_REVIEW"],
    ["INVALID_API_KEY", "STOP"],
    ["REJECT_CARD_PAYMENT", "TERMINAL"],
    ["UNSEEN_TOSS_CODE", "MANUAL_REVIEW"],
  ])("maps Toss error %s to %s", async (code, classification) => {
    const adapter = createTossConfirmAdapter({
      httpClient: recordingClient(response({ code, message: "raw provider message" }, { httpStatus: 409 })).client,
    });

    const failure = expectFailure(await adapter.confirm(confirmInput()));

    expect(failure.classification).toBe(classification);
    expect(failure.providerErrorCode).toBe(code);
    expect(failure.idempotencyKey).toBe(IDEMPOTENCY_KEY);
  });

  it("maps HTTP 5xx to retryable without needing a Toss error code", async () => {
    const adapter = createTossConfirmAdapter({
      httpClient: recordingClient(response({ message: "provider unavailable" }, { httpStatus: 502 })).client,
    });

    const failure = expectFailure(await adapter.confirm(confirmInput()));

    expect(failure).toMatchObject({
      classification: "RETRYABLE",
      normalizedCode: "PROVIDER_UNAVAILABLE",
      httpStatus: 502,
    });
  });

  it("maps timeout and thrown network failures to retryable", async () => {
    const timeout = createTossConfirmAdapter({ httpClient: recordingClient({ kind: "network_timeout" }).client });
    const thrown = createTossConfirmAdapter({ httpClient: throwingClient().client });

    expect(expectFailure(await timeout.confirm(confirmInput()))).toMatchObject({
      classification: "RETRYABLE",
      normalizedCode: "PROVIDER_TIMEOUT",
    });
    expect(expectFailure(await thrown.confirm(confirmInput()))).toMatchObject({
      classification: "RETRYABLE",
      normalizedCode: "PROVIDER_TIMEOUT",
    });
  });

  it("fails before fake HTTP when providerRef is missing", async () => {
    const fake = recordingClient(response(tossDone()));
    const adapter = createTossConfirmAdapter({ httpClient: fake.client });

    const failure = expectFailure(await adapter.confirm(confirmInput({ providerRef: undefined })));

    expect(failure.classification).toBe("PROGRAMMER_ERROR");
    expect(fake.calls).toHaveLength(0);
  });

  it("fails before fake HTTP when the confirm idempotency key is missing", async () => {
    const fake = recordingClient(response(tossDone()));
    const adapter = createTossConfirmAdapter({ httpClient: fake.client });

    const failure = expectFailure(await adapter.confirm(confirmInput({ providerConfirmIdempotencyKey: "" })));

    expect(failure.classification).toBe("PROGRAMMER_ERROR");
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    ["non-KRW currency", { currency: "USD" }, "STOP"],
    ["negative amount", { amount: -1 }, "PROGRAMMER_ERROR"],
    ["decimal amount", { amount: 1000.5 }, "PROGRAMMER_ERROR"],
  ])("fails before fake HTTP for %s", async (_caseName, overrides, classification) => {
    const fake = recordingClient(response(tossDone()));
    const adapter = createTossConfirmAdapter({ httpClient: fake.client });

    const failure = expectFailure(await adapter.confirm(confirmInput(overrides)));

    expect(failure.classification).toBe(classification);
    expect(fake.calls).toHaveLength(0);
  });

  it("keeps Authorization, secrets, raw bodies, and full paymentKey out of diagnostics", async () => {
    const rawSecret = "test_sk_should_not_leak";
    const adapter = createTossConfirmAdapter({
      httpClient: recordingClient(response({
        code: "ALREADY_PROCESSED_PAYMENT",
        message: `Authorization Basic ${rawSecret} ${PAYMENT_KEY}`,
        paymentKey: PAYMENT_KEY,
      }, { httpStatus: 409 })).client,
    });

    const failure = expectFailure(await adapter.confirm(confirmInput()));
    const success = expectSuccess(await createTossConfirmAdapter({
      httpClient: recordingClient(response(tossDone())).client,
    }).confirm(confirmInput()));
    const rendered = JSON.stringify([failure.diagnostics, success.diagnostics]);

    expect(rendered).not.toContain("Authorization");
    expect(rendered).not.toContain("Basic");
    expect(rendered).not.toContain(rawSecret);
    expect(rendered).not.toContain(PAYMENT_KEY);
    expect(rendered).not.toContain(IDEMPOTENCY_KEY);
    expect(rendered).not.toContain("raw request");
    expect(rendered).not.toContain("raw response");
    expect(rendered).not.toContain("card");
    expect(rendered).not.toContain("receipt");
  });

  it("does not call global fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const adapter = createTossConfirmAdapter({ httpClient: recordingClient(response(tossDone())).client });

    await adapter.confirm(confirmInput());

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps resolveProvider(TOSS, SANDBOX) mock-backed", async () => {
    const resolved = resolveProvider({ provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX });
    const explicitMock = createMockPaymentProvider(PaymentProvider.TOSS);

    await expect(resolved.confirm(confirmInput())).resolves.toMatchObject({ providerPaymentKey: "mock:checkout_123" });
    await expect(explicitMock.confirm(confirmInput())).resolves.toMatchObject({ providerPaymentKey: "mock:checkout_123" });
  });

  it("keeps the Toss success route non-completing", async () => {
    const responseValue = await tossSuccessRoute(new Request("http://localhost/api/payments/toss/success"));
    const body = await readJson(responseValue);

    expect(responseValue.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      status: "INVALID_REQUEST",
      confirm: "blocked_until_real_toss_adapter",
    });
  });
});

interface RecordingClient {
  calls: TossConfirmHttpRequest[];
  client: TossConfirmHttpClient;
}

function recordingClient(result: TossConfirmHttpResult): RecordingClient {
  const calls: TossConfirmHttpRequest[] = [];
  return {
    calls,
    client: (request) => {
      calls.push(request);
      return Promise.resolve(result);
    },
  };
}

function throwingClient(): RecordingClient {
  const calls: TossConfirmHttpRequest[] = [];
  return {
    calls,
    client: (request) => {
      calls.push(request);
      return Promise.reject(new Error("fake network failure"));
    },
  };
}

function response(
  body: unknown,
  overrides: Partial<Extract<TossConfirmHttpResult, { kind: "response" }>> = {},
): TossConfirmHttpResult {
  return { kind: "response", httpStatus: 200, body, ...overrides };
}

function confirmInput(overrides: Partial<PaymentConfirmInput> = {}): PaymentConfirmInput {
  return {
    checkoutSessionId: CHECKOUT_SESSION_ID,
    paymentId: PAYMENT_ID,
    provider: PaymentProvider.TOSS,
    providerRef: PAYMENT_KEY,
    providerConfirmIdempotencyKey: IDEMPOTENCY_KEY,
    amount: AMOUNT,
    currency: "KRW",
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

function expectSuccess(result: NormalizedProviderConfirmResult): ProviderConfirmSucceeded {
  expect(result.kind).toBe("succeeded");
  if (result.kind !== "succeeded") throw new Error("Expected Toss adapter success");
  return result;
}

function expectFailure(result: NormalizedProviderConfirmResult): ProviderConfirmFailed {
  expect(result.kind).toBe("failed");
  if (result.kind !== "failed") throw new Error("Expected Toss adapter failure");
  return result;
}

async function readJson(responseValue: Response): Promise<Record<string, unknown>> {
  const body: unknown = await responseValue.json();
  if (isRecord(body)) return body;
  throw new Error("Route response body must be an object");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
