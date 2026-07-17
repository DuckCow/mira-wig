import { isDeepStrictEqual } from "util";
import { describe, expect, it } from "vitest";
import { rejectDuplicateTossCancellationKeys } from "../refund-cancellation-json-scanner";
import {
  normalizeTossRefundCancellationSuccess,
  TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES,
} from "../refund-cancellation-response";

const EXPECTATION = Object.freeze({ paymentKey: "toss-payment-1", fullAmount: 85_000 });
const FAILURE_CODE = "INVALID_TOSS_REFUND_CANCELLATION_SUCCESS";

describe("Toss cancellation success candidate", () => {
  it("normalizes coherent property-order-independent success to a minimal frozen shape", () => {
    const body = successBody();
    const raw = JSON.stringify({
      cancels: body.cancels,
      balanceAmount: body.balanceAmount,
      totalAmount: body.totalAmount,
      status: body.status,
      currency: body.currency,
      paymentKey: body.paymentKey,
    });
    const result = normalizeTossRefundCancellationSuccess(raw, EXPECTATION);
    if (!result.ok) throw new Error("Expected coherent cancellation success.");

    expect(isDeepStrictEqual(Object.keys(result.candidate), [
      "paymentKey", "currency", "paymentStatus", "totalAmount", "balanceAmount",
      "transactionKey", "cancelStatus", "cancelAmount", "cancelReason",
    ])).toBe(true);
    expect(Object.isFrozen(result) && Object.isFrozen(result.candidate)).toBe(true);
    expect(result.candidate.paymentStatus === "CANCELED").toBe(true);
    expect(result.candidate.cancelStatus === "DONE").toBe(true);
  });

  it.each([
    ["payment key", { paymentKey: "different" }],
    ["currency", { currency: "USD" }],
    ["payment status", { status: "DONE" }],
    ["total amount", { totalAmount: 84_999 }],
    ["balance amount", { balanceAmount: 1 }],
    ["cancels array", { cancels: null }],
    ["exactly one cancellation", { cancels: [] }],
    ["sole cancellation object", { cancels: ["not-an-object"] }],
  ])("rejects a mismatched %s with a static failure", (_name, override) => {
    expectFailure(JSON.stringify({ ...successBody(), ...override }));
  });

  it.each([
    ["transaction key", { transactionKey: "" }],
    ["transaction control", { transactionKey: "bad\nkey" }],
    ["cancel status", { cancelStatus: "CANCELED" }],
    ["cancel amount", { cancelAmount: 84_999 }],
    ["cancel reason", { cancelReason: "other" }],
  ])("rejects a mismatched nested %s with a static failure", (_name, override) => {
    expectFailure(JSON.stringify(successBody({ cancelOverride: override })));
  });

  it("requires cancelStatus rather than a nested status alias", () => {
    const cancellation = successCancellation();
    const { cancelStatus: _omitted, ...withoutCancelStatus } = cancellation;
    expectFailure(JSON.stringify(successBody({
      cancels: [{ ...withoutCancelStatus, status: "DONE" }],
    })));
  });

  it("accepts payment and transaction key maxima and rejects overflow", () => {
    const maxPaymentKey = "가".repeat(200);
    const maxTransactionKey = "나".repeat(512);
    const accepted = normalizeTossRefundCancellationSuccess(JSON.stringify(successBody({
      paymentKey: maxPaymentKey,
      cancelOverride: { transactionKey: maxTransactionKey },
    })), { paymentKey: maxPaymentKey, fullAmount: 85_000 });
    const paymentOverflow = normalizeTossRefundCancellationSuccess(JSON.stringify(successBody({
      paymentKey: "가".repeat(201),
    })), { paymentKey: "가".repeat(201), fullAmount: 85_000 });
    const transactionOverflow = normalizeTossRefundCancellationSuccess(JSON.stringify(successBody({
      cancelOverride: { transactionKey: "나".repeat(513) },
    })), EXPECTATION);

    expect(accepted.ok).toBe(true);
    expect(paymentOverflow.ok).toBe(false);
    expect(transactionOverflow.ok).toBe(false);
  });

  it.each([0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    "rejects invalid expected amount %s",
    (fullAmount) => {
      const result = normalizeTossRefundCancellationSuccess(
        JSON.stringify(successBody({ totalAmount: fullAmount })),
        { paymentKey: EXPECTATION.paymentKey, fullAmount },
      );
      expect(result.ok).toBe(false);
    },
  );

  it("ignores unexpected extras while prototype-pollution-shaped keys remain inert", () => {
    const raw = '{"__proto__":{"polluted":true},"paymentKey":"toss-payment-1",'
      + '"currency":"KRW","status":"CANCELED","totalAmount":85000,'
      + '"balanceAmount":0,"cancels":[{"constructor":{"prototype":{"polluted":true}},'
      + '"transactionKey":"toss-cancel-transaction-1","cancelStatus":"DONE",'
      + '"cancelAmount":85000,"cancelReason":"Mira merchant refund","extra":true}],'
      + '"receipt":{"url":"ignored"}}';
    const result = normalizeTossRefundCancellationSuccess(raw, EXPECTATION);

    expect(result.ok).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
  });

  it("rejects more than one cancellation even when each entry is coherent", () => {
    expectFailure(JSON.stringify(successBody({
      cancels: [successCancellation(), successCancellation()],
    })));
  });
});

describe("targeted Toss cancellation JSON duplicate scanner", () => {
  it.each([
    '{"paymentKey":"a","paymentKey":"b"}',
    '{"paymentKey":"a","\\u0070aymentKey":"b"}',
  ])("rejects literal or escaped protected root duplicates", (raw) => {
    expect(scannerRejected(raw)).toBe(true);
  });

  it.each([
    '{"cancels":[{"transactionKey":"a","transactionKey":"b"}]}',
    '{"cancels":[{"cancelStatus":"DONE","cancel\\u0053tatus":"DONE"}]}',
    '{"cancels":[{"cancelAmount":1,"cancelAmount":1}]}',
    '{"cancels":[{"cancelReason":"a","cancel\\u0052eason":"b"}]}',
  ])("rejects literal or escaped protected nested duplicates", (raw) => {
    expect(scannerRejected(raw)).toBe(true);
  });

  it("tolerates nested non-target duplicates and handles escaped quote/backslash values", () => {
    const raw = JSON.stringify(successBody({
      extra: { repeated: "first", slash: "\\", quote: '"' },
    })).replace('"slash":"\\\\"', '"repeated":"second","slash":"\\\\"');
    const result = normalizeTossRefundCancellationSuccess(raw, EXPECTATION);

    expect(result.ok).toBe(true);
  });

  it.each([
    '{"paymentKey":"bad\\x"}',
    '{"paymentKey":"bad\\u12xz"}',
    '{"paymentKey":"unterminated}',
    '{"paymentKey":"a"',
  ])("rejects malformed escapes and unterminated JSON", (raw) => {
    expect(scannerRejected(raw)).toBe(true);
  });

  it("accepts depth 64 and rejects depth 65", () => {
    const atBoundary = nestedArrayJson(63);
    const overBoundary = nestedArrayJson(64);

    expect(scannerRejected(atBoundary)).toBe(false);
    expect(scannerRejected(overBoundary)).toBe(true);
  });

  it("accepts exactly 64 KiB and rejects one byte more", () => {
    const base = successBody({ padding: "" });
    const baseLength = Buffer.byteLength(JSON.stringify(base), "utf8");
    const exact = JSON.stringify(successBody({
      padding: "x".repeat(TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES - baseLength),
    }));
    const oversized = exact.replace(/"}$/, 'x"}');

    expect(Buffer.byteLength(exact, "utf8")
      === TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES).toBe(true);
    expect(normalizeTossRefundCancellationSuccess(exact, EXPECTATION).ok).toBe(true);
    expect(Buffer.byteLength(oversized, "utf8")
      === TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES + 1).toBe(true);
    expect(normalizeTossRefundCancellationSuccess(oversized, EXPECTATION).ok).toBe(false);
  });
});

function successBody(options: Readonly<Record<string, unknown>> = {}) {
  const {
    cancelOverride = {},
    cancels,
    ...rootOverride
  } = options;
  return {
    paymentKey: EXPECTATION.paymentKey,
    currency: "KRW",
    status: "CANCELED",
    totalAmount: EXPECTATION.fullAmount,
    balanceAmount: 0,
    cancels: cancels ?? [successCancellation(recordValue(cancelOverride))],
    ...rootOverride,
  };
}

function successCancellation(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    transactionKey: "toss-cancel-transaction-1",
    cancelStatus: "DONE",
    cancelAmount: EXPECTATION.fullAmount,
    cancelReason: "Mira merchant refund",
    ...overrides,
  };
}

function expectFailure(raw: string): void {
  const result = normalizeTossRefundCancellationSuccess(raw, EXPECTATION);
  expect(result.ok).toBe(false);
  expect(!result.ok && result.code === FAILURE_CODE).toBe(true);
  expect(Object.isFrozen(result)).toBe(true);
}

function scannerRejected(raw: string): boolean {
  try {
    rejectDuplicateTossCancellationKeys(raw);
    return false;
  } catch {
    return true;
  }
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return {};
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedArrayJson(depth: number): string {
  return `{"extra":${"[".repeat(depth)}0${"]".repeat(depth)}}`;
}
