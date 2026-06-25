// ============================================================
// PayPalPaymentProvider — 외부 PayPal API 경계 테스트
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPaymentProvider } from "../index";
import { formatPayPalAmount, parsePayPalAmount, PayPalPaymentProvider } from "../paypal";
import type { ConfirmInput, InitiateInput, RefundInput } from "../types";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockFetch(...responses: Response[]): FetchMock {
  const fetchMock = vi.fn<typeof fetch>();
  for (const item of responses) fetchMock.mockResolvedValueOnce(item);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function fetchCall(fetchMock: FetchMock, index: number): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`fetch 호출 없음: ${index}`);
  const [url, init] = call;
  if (typeof url !== "string" || !init) throw new Error("fetch 호출 형식 오류");
  return { url, init };
}

function requestBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") throw new Error("JSON body 없음");
  const parsed: unknown = JSON.parse(init.body);
  if (!isRecord(parsed)) throw new Error("JSON body 형식 오류");
  return parsed;
}

function headerValue(init: RequestInit, key: string): string {
  if (!isStringRecord(init.headers)) throw new Error("headers 형식 오류");
  return init.headers[key] ?? "";
}

function oauthResponse() {
  return response({ access_token: "access_token_1", expires_in: 3600 });
}

function initiateInput(overrides: Partial<InitiateInput> = {}): InitiateInput {
  return { orderId: "order_1", amount: 7799, currency: "USD", idempotencyKey: "idem_create", ...overrides };
}

function confirmInput(overrides: Partial<ConfirmInput> = {}): ConfirmInput {
  return { orderId: "order_1", amount: 7799, providerTransactionId: "paypal_order_1", idempotencyKey: "idem_capture", ...overrides };
}

function refundInput(overrides: Partial<RefundInput> = {}): RefundInput {
  return {
    orderId: "order_1",
    providerTransactionId: "capture_1",
    amount: 1000,
    currency: "USD",
    reason: "refund",
    idempotencyKey: "idem_refund",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  vi.stubEnv("PAYPAL_CLIENT_ID", "client_id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "client_secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("formatPayPalAmount", () => {
  it("USD 최소단위 정수를 소수점 2자리 문자열로 변환한다", () => {
    expect(formatPayPalAmount(7799, "USD")).toBe("77.99");
    expect(formatPayPalAmount(1, "USD")).toBe("0.01");
  });

  it("JPY는 decimal 없이 그대로 문자열화한다", () => {
    expect(formatPayPalAmount(1500, "JPY")).toBe("1500");
    expect(formatPayPalAmount(0, "JPY")).toBe("0");
  });
});

describe("parsePayPalAmount", () => {
  it("USD 표시 단위 문자열을 최소단위 정수로 변환한다", () => {
    expect(parsePayPalAmount("77.99", "USD")).toBe(7799);
    expect(parsePayPalAmount("0.01", "USD")).toBe(1);
  });

  it("JPY는 decimal 없이 그대로 최소단위 정수로 변환한다", () => {
    expect(parsePayPalAmount("1500", "JPY")).toBe(1500);
    expect(parsePayPalAmount("0", "JPY")).toBe(0);
  });
});

it("initiate는 Orders v2 create order 형식으로 호출하고 order id를 PENDING으로 반환한다", async () => {
  const fetchMock = mockFetch(oauthResponse(), response({
    id: "paypal_order_1",
    links: [{ rel: "approve", href: "https://www.paypal.com/checkoutnow?token=paypal_order_1" }],
  }, 201));
  const result = await new PayPalPaymentProvider().initiate(initiateInput());
  const oauth = fetchCall(fetchMock, 0);
  const create = fetchCall(fetchMock, 1);
  const body = requestBody(create.init);
  expect(oauth.url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
  expect(create.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
  expect(headerValue(create.init, "PayPal-Request-Id")).toBe("idem_create");
  expect(body.intent).toBe("CAPTURE");
  expect(body.purchase_units).toEqual([{
    reference_id: "order_1",
    custom_id: "order_1",
    amount: { currency_code: "USD", value: "77.99" },
  }]);
  expect(result).toEqual({
    providerTransactionId: "paypal_order_1",
    status: "PENDING",
    redirectUrl: "https://www.paypal.com/checkoutnow?token=paypal_order_1",
  });
});

it("confirm은 PayPal order capture를 호출하고 capture id를 SUCCEEDED로 반환한다", async () => {
  const fetchMock = mockFetch(oauthResponse(), response({
    id: "paypal_order_1",
    status: "COMPLETED",
    purchase_units: [{
      reference_id: "order_1",
      payments: {
        captures: [{
          id: "capture_1",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "77.99" },
        }],
      },
    }],
  }));
  const result = await new PayPalPaymentProvider().confirm(confirmInput());
  const capture = fetchCall(fetchMock, 1);
  expect(capture.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/paypal_order_1/capture");
  expect(headerValue(capture.init, "PayPal-Request-Id")).toBe("idem_capture");
  expect(result).toEqual({
    providerTransactionId: "capture_1",
    status: "SUCCEEDED",
    capturedAmount: 7799,
    capturedCurrency: "USD",
    captureReferenceId: "order_1",
  });
});

it("confirm 실패 응답은 FAILED 결과로 반환한다", async () => {
  mockFetch(oauthResponse(), response({ name: "UNPROCESSABLE_ENTITY", message: "capture failed" }, 422));
  const result = await new PayPalPaymentProvider().confirm(confirmInput());
  expect(result).toEqual({
    providerTransactionId: "paypal_order_1",
    status: "FAILED",
    errorMessage: "capture failed",
  });
});

it("refund 부분 환불은 amount를 변환해 전달하고 refund id를 매핑한다", async () => {
  const fetchMock = mockFetch(oauthResponse(), response({
    id: "refund_1",
    status: "COMPLETED",
    amount: { currency_code: "USD", value: "10.00" },
  }, 201));
  const result = await new PayPalPaymentProvider().refund(refundInput());
  const refund = fetchCall(fetchMock, 1);
  expect(refund.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/captures/capture_1/refund");
  expect(headerValue(refund.init, "PayPal-Request-Id")).toBe("idem_refund");
  expect(requestBody(refund.init)).toEqual({ amount: { currency_code: "USD", value: "10.00" } });
  expect(result).toMatchObject({ providerRefundId: "refund_1", status: "SUCCEEDED", amount: 1000, currency: "USD" });
});

it("refund 전액 환불은 빈 JSON body를 전달한다", async () => {
  const fetchMock = mockFetch(oauthResponse(), response({
    id: "refund_full",
    status: "COMPLETED",
    amount: { currency_code: "JPY", value: "1500" },
  }, 201));
  const result = await new PayPalPaymentProvider().refund(refundInput({
    amount: undefined,
    currency: "JPY",
    idempotencyKey: "idem_refund_full",
  }));
  const refund = fetchCall(fetchMock, 1);
  expect(requestBody(refund.init)).toEqual({});
  expect(result).toMatchObject({ providerRefundId: "refund_full", amount: 1500, currency: "JPY" });
});

it("refund 실패 응답은 FAILED 결과로 반환한다", async () => {
  mockFetch(oauthResponse(), response({ name: "REFUND_FAILED", message: "refund failed" }, 422));
  const result = await new PayPalPaymentProvider().refund(refundInput());
  expect(result).toMatchObject({
    providerTransactionId: "capture_1",
    status: "FAILED",
    amount: 1000,
    currency: "USD",
    errorMessage: "refund failed",
  });
});

describe("getPaymentProvider — PayPal live market gate", () => {
  it("US/JP는 PAYMENT_LIVE_MARKETS에 있을 때 PayPal을 반환한다", () => {
    vi.stubEnv("PAYMENT_LIVE_MARKETS", "US,JP");
    expect(getPaymentProvider("US").name).toBe("paypal");
    expect(getPaymentProvider("JP").name).toBe("paypal");
  });

  it("US/JP가 live 목록에 없으면 mock을 반환한다", () => {
    vi.stubEnv("PAYMENT_LIVE_MARKETS", "");
    expect(getPaymentProvider("US").name).toBe("mock");
    expect(getPaymentProvider("JP").name).toBe("mock");
  });

  it("KR live 라우팅은 Toss로 유지된다", () => {
    vi.stubEnv("PAYMENT_LIVE_MARKETS", "KR");
    vi.stubEnv("TOSS_SECRET_KEY", "test_secret");
    expect(getPaymentProvider("KR").name).toBe("toss");
  });
});
