// ============================================================
// TossPaymentProvider — 외부 Toss API 경계 테스트
// ============================================================
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TossPaymentProvider } from "../toss";
import type { RefundInput } from "../types";

const TEST_SECRET = "test_sk_refund";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function mockFetch(body: unknown, status = 200): FetchMock {
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastFetchCall(fetchMock: FetchMock): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch 호출 없음");
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

function refundInput(overrides: Partial<RefundInput> = {}): RefundInput {
  return {
    orderId: "order_1",
    providerTransactionId: "pay_refund",
    amount: 85000,
    currency: "KRW",
    reason: "refund",
    idempotencyKey: "refund_key",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("TOSS_SECRET_KEY", TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("전액 취소는 cancelAmount 없이 취소 API를 호출하고 transactionKey를 매핑한다", async () => {
  const fetchMock = mockFetch({
    paymentKey: "pay_full", currency: "KRW", balanceAmount: 0,
    cancels: [{ transactionKey: "tx_cancel_full", cancelAmount: 85000, refundableAmount: 0, cancelStatus: "DONE" }],
  });
  const result = await new TossPaymentProvider().refund(refundInput({
    providerTransactionId: "pay_full", amount: undefined, reason: "auto compensation", idempotencyKey: "refund_key_1",
  }));
  const { url, init } = lastFetchCall(fetchMock);
  const body = requestBody(init);
  expect(url).toBe("https://api.tosspayments.com/v1/payments/pay_full/cancel");
  expect(init.method).toBe("POST");
  expect(headerValue(init, "Authorization")).toBe(`Basic ${Buffer.from(`${TEST_SECRET}:`).toString("base64")}`);
  expect(headerValue(init, "Idempotency-Key")).toBe("refund_key_1");
  expect(body.cancelReason).toBe("auto compensation");
  expect(body.cancelAmount).toBeUndefined();
  expect(result).toMatchObject({ providerRefundId: "tx_cancel_full", status: "SUCCEEDED", amount: 85000 });
});

it("부분 취소는 cancelAmount를 최소단위 정수 그대로 전달한다", async () => {
  const fetchMock = mockFetch({
    paymentKey: "pay_partial", currency: "KRW", balanceAmount: 75000,
    cancels: [{ transactionKey: "tx_cancel_partial", cancelAmount: 10000, refundableAmount: 75000, cancelStatus: "DONE" }],
  });
  const result = await new TossPaymentProvider().refund(refundInput({
    providerTransactionId: "pay_partial", amount: 10000, reason: "partial refund", idempotencyKey: "refund_key_2",
  }));
  const { init } = lastFetchCall(fetchMock);
  expect(requestBody(init).cancelAmount).toBe(10000);
  expect(result).toMatchObject({ providerRefundId: "tx_cancel_partial", amount: 10000, refundableAmount: 75000 });
});

it("Toss HTTP 실패는 FAILED 결과와 errorMessage로 반환한다", async () => {
  mockFetch({ message: "취소 불가" }, 400);
  const result = await new TossPaymentProvider().refund(refundInput({
    providerTransactionId: "pay_fail", reason: "refund failure", idempotencyKey: "refund_key_3",
  }));
  expect(result).toMatchObject({
    providerTransactionId: "pay_fail",
    status: "FAILED",
    amount: 85000,
    currency: "KRW",
    errorMessage: "취소 불가",
  });
});
