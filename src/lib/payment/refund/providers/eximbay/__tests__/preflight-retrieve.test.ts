import { PaymentMode, PaymentProvider } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyEximbayRefundType,
  createEximbayRefundPreflightConfig,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  serializeEximbayRefundObservationFingerprint,
  type EximbayRefundPreflightFacts,
} from "../preflight-contract";
import {
  createEximbayRefundRetrievePlan,
  executeEximbayRefundRetrieve,
  EXIMBAY_REFUND_RETRIEVE_DEADLINE_MS,
  EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_BYTES,
  EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_CHUNKS,
} from "../preflight-retrieve";

const CONFIG = createEximbayRefundPreflightConfig({
  mode: PaymentMode.SANDBOX,
  mid: "merchant-mid",
  merchantAccountBindingId: "merchant-1",
  credentialGenerationBindingId: "generation-1",
});
const UTF8 = new TextEncoder();

afterEach(() => vi.useRealTimers());

describe("provider-free Eximbay refund retrieve", () => {
  it("materializes the exact transaction-ID inquiry and admits trusted facts", async () => {
    const calls: Array<Readonly<{ input: string | URL | Request; init?: RequestInit }>> = [];
    const result = await executeEximbayRefundRetrieve(plan(), (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(response());
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe("https://api-test.eximbay.com/v1/payments/retrieve");
    expect(calls[0].init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "error",
    });
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    const requestBody = calls[0].init?.body;
    if (typeof requestBody !== "string") throw new Error("Expected a string retrieve body.");
    expect(JSON.parse(requestBody)).toEqual({
      mid: "merchant-mid",
      key_field: "transaction_id",
      payment: {
        order_id: "order-1",
        currency: "USD",
        amount: "12.34",
        transaction_id: "transaction-1",
        lang: "EN",
      },
    });
    expect(result).toEqual(admittedFacts());
  });

  it("admits both documented card-info spellings with an invariant trusted projection", async () => {
    const absent = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(response()));
    const formalDefinition = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(response({
      payment: { auth_code: "A12345", payment_method: "P000" },
      card_info: { card_number1: "4111", card_number4: "1111" },
      other_param: { param1: "merchant metadata", param2: "merchant metadata 2" },
    })));
    const englishExample = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(response({
      payment: { auth_code: "different-envelope-value", payment_method: "CARD" },
      card_info: { cardno1: "5555", cardno4: "4444" },
    })));
    expect(formalDefinition).toEqual(admittedFacts());
    expect(englishExample).toEqual(admittedFacts());
    expect(formalDefinition).toEqual(englishExample);
    expect(formalDefinition).toEqual(absent);
    if (formalDefinition.kind !== "admitted" || englishExample.kind !== "admitted") {
      throw new Error("Expected both documented card-info variants to be admitted.");
    }
    expect(classification(formalDefinition.facts)).toEqual(classification(englishExample.facts));
    expect(fingerprintPreimage(formalDefinition.facts))
      .toBe(fingerprintPreimage(englishExample.facts));
  });

  it.each(REJECTION_CASES)("rejects %s", async (_label, override, code) => {
    const result = await executeEximbayRefundRetrieve(
      plan(), () => Promise.resolve(response(override)),
    );
    expect(result).toEqual({ kind: "notAdmitted", code });
  });

  it.each([
    ["malformed JSON", "{", "INVALID_JSON"],
    ["duplicate root", '{"rescode":"0000","rescode":"0000"}', "DUPLICATE_JSON_KEY"],
    ["duplicate payment", exactBody().replace('"order_id":"order-1"', '"order_id":"order-1","order_id":"order-1"'), "DUPLICATE_JSON_KEY"],
    ["duplicate formal card field", exactBody({ card_info: { card_number1: "4111", card_number4: "1111" } }).replace('"card_number1":"4111"', '"card_number1":"4111","card_number1":"4111"'), "DUPLICATE_JSON_KEY"],
    ["duplicate English-example card field", exactBody({ card_info: { cardno1: "4111", cardno4: "1111" } }).replace('"cardno1":"4111"', '"cardno1":"4111","cardno1":"4111"'), "DUPLICATE_JSON_KEY"],
  ])("rejects %s", async (_label, body, code) => {
    const result = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(rawResponse(body)));
    expect(result).toEqual({ kind: "notAdmitted", code });
  });

  it("admits exactly the raw-byte bound and rejects an oversized stream", async () => {
    const body = exactBody();
    const exact = `${body}${" ".repeat(EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_BYTES - UTF8.encode(body).byteLength)}`;
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.resolve(rawResponse(exact)),
    )).resolves.toEqual(admittedFacts());

    let cancelled = false;
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array([32]));
      },
      cancel() { cancelled = true; },
    });
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.resolve(streamResponse(oversized)),
    )).resolves.toEqual({ kind: "notAdmitted", code: "BODY_TOO_LARGE" });
    expect(cancelled).toBe(true);
  });

  it("rejects invalid raw UTF-8 and excessive chunk fragmentation", async () => {
    const invalidUtf8 = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close(); },
    });
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.resolve(streamResponse(invalidUtf8)),
    )).resolves.toEqual({ kind: "notAdmitted", code: "INVALID_UTF8" });

    const fragmented = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index <= EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_CHUNKS; index += 1) {
          controller.enqueue(new Uint8Array([32]));
        }
      },
    });
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.resolve(streamResponse(fragmented)),
    )).resolves.toEqual({ kind: "notAdmitted", code: "TOO_MANY_RESPONSE_CHUNKS" });
  });

  it("maps transport failure and aborts the actual request signal at deadline", async () => {
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.reject(new Error("synthetic transport failure")),
    )).resolves.toEqual({ kind: "notAdmitted", code: "TRANSPORT_FAILURE" });

    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const pending = executeEximbayRefundRetrieve(plan(), (_input, init) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    await vi.advanceTimersByTimeAsync(EXIMBAY_REFUND_RETRIEVE_DEADLINE_MS + 1);
    await expect(pending).resolves.toEqual({ kind: "notAdmitted", code: "TRANSPORT_FAILURE" });
    expect(observedSignal?.aborted).toBe(true);
  });
});

function plan() {
  return createEximbayRefundRetrievePlan(CONFIG, {
    providerOrderId: "order-1",
    providerTransactionId: "transaction-1",
    currency: "USD",
    originalAmount: 1_234,
  });
}

function response(override: ResponseOverride = {}): Response { return rawResponse(exactBody(override)); }
function rawResponse(body: BodyInit): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function streamResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}

function exactBody(override: ResponseOverride = {}): string {
  const base = bodyObject();
  const payment = Object.fromEntries(Object.entries({ ...base.payment, ...override.payment })
    .filter((entry) => entry[1] !== undefined));
  return JSON.stringify({ ...base, ...override, payment });
}

function bodyObject() {
  return {
    rescode: "0000", resmsg: "ok", mid: "merchant-mid",
    payment: {
      order_id: "order-1", currency: "USD", amount: "12.34",
      transaction_id: "transaction-1", status: "SALE",
      transaction_date: "20260820010203", balance: "10.00",
    },
  };
}

function admittedFacts() {
  return {
    kind: "admitted",
    facts: {
      mid: "merchant-mid", providerOrderId: "order-1", providerTransactionId: "transaction-1",
      providerStatus: "SALE", currency: "USD", originalAmount: 1_234, refundableBalance: 1_000,
    },
  };
}

function classification(observation: EximbayRefundPreflightFacts) {
  return classifyEximbayRefundType({
    requestedAmount: 1_234,
    paymentAmount: 1_234,
    paymentCurrency: "USD",
    successfulRefundAmount: 0,
    historyCoherent: true,
    observation,
  });
}

function fingerprintPreimage(facts: EximbayRefundPreflightFacts): string {
  return serializeEximbayRefundObservationFingerprint({
    refundAttemptId: "refund-1",
    commandId: "command-1",
    bindingId: "binding-1",
    observingLeaseGeneration: 1,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    merchantAccountBindingId: "merchant-1",
    credentialGenerationBindingId: "generation-1",
    wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    facts,
    observedAt: new Date("2026-08-20T01:02:03.456Z"),
  });
}

type ResponseOverride = Readonly<{
  mid?: string;
  payment?: Readonly<Record<string, string | undefined>>;
  card_info?: unknown;
  other_param?: unknown;
  unknown?: unknown;
}>;

const REJECTION_CASES: ReadonlyArray<readonly [string, ResponseOverride, string]> = [
  ["MID mismatch", { mid: "other" }, "IDENTITY_MISMATCH"],
  ["order mismatch", { payment: { order_id: "other" } }, "IDENTITY_MISMATCH"],
  ["transaction mismatch", { payment: { transaction_id: "other" } }, "IDENTITY_MISMATCH"],
  ["currency mismatch", { payment: { currency: "JPY" } }, "MONEY_MISMATCH"],
  ["amount mismatch", { payment: { amount: "12.35" } }, "MONEY_MISMATCH"],
  ["missing balance", { payment: { balance: undefined } }, "UNKNOWN_SHAPE"],
  ["negative balance", { payment: { balance: "-0.01" } }, "INVALID_BALANCE"],
  ["excess balance", { payment: { balance: "12.35" } }, "INVALID_BALANCE"],
  ["unknown status", { payment: { status: "CAPTURED" } }, "UNSUPPORTED_STATUS"],
  ["malformed card_info", { card_info: "41111111" }, "UNKNOWN_SHAPE"],
  ["mixed card spellings", { card_info: { card_number1: "4111", cardno4: "1111" } }, "UNKNOWN_SHAPE"],
  ["both complete card pairs", { card_info: {
    card_number1: "4111", card_number4: "1111", cardno1: "4111", cardno4: "1111",
  } }, "UNKNOWN_SHAPE"],
  ["unknown card alias", { card_info: { card_number1: "4111", card_last4: "1111" } }, "UNKNOWN_SHAPE"],
  ["malformed English-example card value", {
    card_info: { cardno1: "555", cardno4: "4444" },
  }, "UNKNOWN_SHAPE"],
  ["unknown root key", { unknown: "value" }, "UNKNOWN_SHAPE"],
  ["unknown payment key", { payment: { unknown: "value" } }, "UNKNOWN_SHAPE"],
];
