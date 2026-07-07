import { PaymentProvider } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as tossSuccessRoute } from "@/app/api/payments/toss/success/route";
import type {
  NormalizedProviderConfirmResult,
  ProviderConfirmFailed,
  ProviderConfirmSucceeded,
  ProviderFactoryContext,
} from "@/lib/payment/providers/contract";
import { TOSS_SANDBOX_SECRET_KEY } from "../../credentials";
import { TOSS_SANDBOX_EXTERNAL_ENABLED } from "../../factory";
import { createMockPaymentProvider } from "../../mock";
import { resolveProvider } from "../../resolve";
import { PaymentMethod, PaymentMode } from "../../routing";
import type { PaymentConfirmInput, PaymentInitiateInput, PaymentConfirmResult } from "../../types";
import {
  createTossConfirmFetchClient,
  createTossConfirmAdapter,
  createTossSandboxPaymentProvider,
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
const ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED = process.env[TOSS_SANDBOX_EXTERNAL_ENABLED];
const ORIGINAL_TOSS_SANDBOX_SECRET_KEY = process.env[TOSS_SANDBOX_SECRET_KEY];

describe("Toss confirm fake HTTP adapter seam", () => {
  beforeEach(() => {
    delete process.env[TOSS_SANDBOX_EXTERNAL_ENABLED];
    delete process.env[TOSS_SANDBOX_SECRET_KEY];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreEnv(TOSS_SANDBOX_EXTERNAL_ENABLED, ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED);
    restoreEnv(TOSS_SANDBOX_SECRET_KEY, ORIGINAL_TOSS_SANDBOX_SECRET_KEY);
  });

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

  it("builds Basic auth only inside the fetch HTTP client request", async () => {
    const rawSecret = "test_sk_fetch_secret_should_not_leak";
    const fetchCalls: FetchCall[] = [];
    const fetchFn: typeof fetch = (input, init) => {
      fetchCalls.push({ input, init });
      return Promise.resolve(new Response(JSON.stringify(tossDone()), { status: 200 }));
    };
    const client = createTossConfirmFetchClient({
      secretKey: rawSecret,
      fetchFn,
      origin: "https://api.toss.example.test",
    });

    const result = await client(tossConfirmRequest());
    const call = onlyFetchCall(fetchCalls);

    expect(result).toMatchObject({ kind: "response", httpStatus: 200 });
    expect(fetchInputUrl(call.input)).toBe("https://api.toss.example.test/v1/payments/confirm");
    expect(call.init).toMatchObject({
      method: "POST",
      body: JSON.stringify(tossConfirmRequest().body),
    });
    expect(headerValue(call.init?.headers, "Authorization")).toMatch(/^Basic /);
    expect(headerValue(call.init?.headers, "Content-Type")).toBe("application/json");
    expect(headerValue(call.init?.headers, "Idempotency-Key")).toBe(IDEMPOTENCY_KEY);
    expect(JSON.stringify([result, call.init])).not.toContain(rawSecret);
  });

  it("aborts a hung Toss confirm fetch by timeout and normalizes the adapter failure", async () => {
    vi.useFakeTimers();
    const rawSecret = "test_sk_timeout_secret_should_not_leak";
    const fetchCalls: FetchCall[] = [];
    const fetchFn: typeof fetch = (input, init) => {
      fetchCalls.push({ input, init });
      return new Promise<Response>(() => undefined);
    };
    const adapter = createTossConfirmAdapter({
      httpClient: createTossConfirmFetchClient({
        secretKey: rawSecret,
        fetchFn,
        origin: "https://api.toss.example.test",
        timeoutMs: 5,
      }),
    });

    const pending = adapter.confirm(confirmInput());
    await vi.advanceTimersByTimeAsync(5);
    const failure = expectFailure(await pending);
    const call = onlyFetchCall(fetchCalls);
    const rendered = JSON.stringify(failure);

    expect(signalFromInit(call.init).aborted).toBe(true);
    expect(failure).toMatchObject({
      classification: "RETRYABLE",
      normalizedCode: "PROVIDER_TIMEOUT",
      ambiguousProviderState: true,
    });
    expect(rendered).not.toContain(rawSecret);
    expect(rendered).not.toContain("Authorization");
    expect(rendered).not.toContain("Basic");
    expect(rendered).not.toContain(PAYMENT_KEY);
    expect(rendered).not.toContain("paymentKey");
  });

  it("keeps non-timeout fetch rejection on the existing retryable network path", async () => {
    const rawSecret = "test_sk_rejected_fetch_should_not_leak";
    const fetchFn: typeof fetch = () => Promise.reject(new TypeError(`fake socket closed ${rawSecret}`));
    const adapter = createTossConfirmAdapter({
      httpClient: createTossConfirmFetchClient({
        secretKey: rawSecret,
        fetchFn,
        origin: "https://api.toss.example.test",
        timeoutMs: 100,
      }),
    });

    const failure = expectFailure(await adapter.confirm(confirmInput()));
    const rendered = JSON.stringify(failure);

    expect(failure).toMatchObject({
      classification: "RETRYABLE",
      normalizedCode: "PROVIDER_TIMEOUT",
    });
    expect(rendered).not.toContain(rawSecret);
    expect(rendered).not.toContain("fake socket closed");
  });

  it("keeps Toss SANDBOX mock-backed by default even when sandbox credentials are present", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(tossDone())));
    const resolved = resolveProvider(sandboxContext({ credentials: [presentSandboxCredential()] }));

    await expect(resolved.confirm(confirmInput())).resolves.toMatchObject({ providerPaymentKey: "mock:checkout_123" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("selects the Toss SANDBOX confirm adapter only when deployment opt-in and credentials are present", async () => {
    process.env[TOSS_SANDBOX_EXTERNAL_ENABLED] = "ENABLED";
    process.env[TOSS_SANDBOX_SECRET_KEY] = "test_sk_default_resolver_should_not_leak";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(tossDone()), { status: 200 }));
    const resolved = resolveProvider(sandboxContext({ credentials: [presentSandboxCredential()] }));

    await expect(resolved.initiate(initiateInput())).resolves.toEqual({ kind: "ready" });
    expect(fetchSpy).not.toHaveBeenCalled();

    const success = expectProviderSuccess(await resolved.confirm(confirmInput()));

    expect(success.providerPaymentKey).toBe(PAYMENT_KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(success)).not.toContain(process.env[TOSS_SANDBOX_SECRET_KEY]);
  });

  it("keeps the Toss sandbox payment provider on fake HTTP ports in tests", async () => {
    const fake = recordingClient(response(tossDone()));
    const provider = createTossSandboxPaymentProvider({ httpClient: fake.client });

    await expect(provider.initiate(initiateInput())).resolves.toEqual({ kind: "ready" });
    const success = expectProviderSuccess(await provider.confirm(confirmInput()));

    expect(success.providerPaymentKey).toBe(PAYMENT_KEY);
    expect(fake.calls).toHaveLength(1);
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
    const resolved = resolveProvider(sandboxContext());
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

function sandboxContext(overrides: Partial<ProviderFactoryContext> = {}): ProviderFactoryContext {
  return {
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    market: "KR",
    method: PaymentMethod.CARD,
    currency: "KRW",
    ruleId: "d1a.kr.card.krw",
    credentials: [],
    liveGuard: { kind: "blocked" as const, liveEnabled: false as const, reason: "not live mode" },
    ...overrides,
  };
}

interface RecordingClient {
  calls: TossConfirmHttpRequest[];
  client: TossConfirmHttpClient;
}

interface FetchCall {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
}

function onlyFetchCall(calls: readonly FetchCall[]): FetchCall {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error("Expected one fake fetch call");
  return call;
}

function fetchInputUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function headerValue(headers: HeadersInit | undefined, key: string): string | null {
  return new Headers(headers).get(key);
}

function signalFromInit(init: RequestInit | undefined): AbortSignal {
  const signal = init?.signal;
  expect(signal).toBeInstanceOf(AbortSignal);
  if (!(signal instanceof AbortSignal)) throw new Error("Expected fake fetch to receive an AbortSignal");
  return signal;
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

function initiateInput(overrides: Partial<PaymentInitiateInput> = {}): PaymentInitiateInput {
  return {
    checkoutSessionId: CHECKOUT_SESSION_ID,
    paymentId: PAYMENT_ID,
    provider: PaymentProvider.TOSS,
    amount: AMOUNT,
    currency: "KRW",
    idempotencyKey: "initiate:checkout_123:payment_123",
    ...overrides,
  };
}

function tossConfirmRequest(): TossConfirmHttpRequest {
  return {
    method: "POST",
    path: "/v1/payments/confirm",
    headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
    body: {
      paymentKey: PAYMENT_KEY,
      orderId: deriveTossOrderId(PAYMENT_ID),
      amount: AMOUNT,
    },
  };
}

function presentSandboxCredential() {
  return { name: TOSS_SANDBOX_SECRET_KEY, required: true, present: true };
}

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = original;
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

function expectProviderSuccess(result: PaymentConfirmResult): ProviderConfirmSucceeded {
  expect("kind" in result && result.kind === "succeeded").toBe(true);
  if (!("kind" in result) || result.kind !== "succeeded") throw new Error("Expected provider success");
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
