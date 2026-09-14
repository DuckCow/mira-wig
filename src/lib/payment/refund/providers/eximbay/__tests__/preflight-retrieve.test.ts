import { isRetrieveShapeDiagnostic } from "../retrieve-shape-diagnostic";
import { PaymentMode, PaymentProvider } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAuthenticatedEximbayRefundRestFetch,
  createEximbayRefundRestCredentials,
} from "../authenticated-transport";
import {
  classifyEximbayRefundType,
  createEximbayRefundPreflightConfig,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
  serializeEximbayRefundObservationFingerprint,
  type EximbayRefundPreflightFacts,
} from "../preflight-contract";
import {
  diagnoseEximbayRefundRetrieve,
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
const API_KEY = "synthetic-api-key-never-log";
const BASIC_AUTHORIZATION = `Basic ${Buffer.from(`${API_KEY}:`, "utf8").toString("base64")}`;

afterEach(() => vi.useRealTimers());

describe("provider-free Eximbay refund retrieve", () => {
  it("materializes the exact transaction-ID inquiry and admits trusted facts", async () => {
    const calls: Array<Readonly<{ input: string | URL | Request; init?: RequestInit }>> = [];
    const transport = createAuthenticatedEximbayRefundRestFetch(
      createEximbayRefundRestCredentials(API_KEY),
      (input, init) => {
        calls.push({ input, init });
        return Promise.resolve(response());
      },
    );
    const result = await executeEximbayRefundRetrieve(plan(), transport);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe("https://api-test.eximbay.com/v1/payments/retrieve");
    expect(calls[0].init).toMatchObject({ method: "POST", redirect: "error" });
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("Authorization")).toBe(BASIC_AUTHORIZATION);
    expect(headers.get("Content-Type")).toBe("application/json");
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
    expect(result).toMatchObject({ kind: "notAdmitted", code });
  });

  it.each([
    ["malformed JSON", "{", "INVALID_JSON"],
    ["duplicate root", '{"rescode":"0000","rescode":"0000"}', "DUPLICATE_JSON_KEY"],
    ["duplicate payment", exactBody().replace('"order_id":"order-1"', '"order_id":"order-1","order_id":"order-1"'), "DUPLICATE_JSON_KEY"],
    ["duplicate formal card field", exactBody({ card_info: { card_number1: "4111", card_number4: "1111" } }).replace('"card_number1":"4111"', '"card_number1":"4111","card_number1":"4111"'), "DUPLICATE_JSON_KEY"],
    ["duplicate English-example card field", exactBody({ card_info: { cardno1: "4111", cardno4: "1111" } }).replace('"cardno1":"4111"', '"cardno1":"4111","cardno1":"4111"'), "DUPLICATE_JSON_KEY"],
  ])("rejects %s", async (_label, body, code) => {
    const result = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(rawResponse(body)));
    expect(result).toMatchObject({ kind: "notAdmitted", code });
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
    )).resolves.toMatchObject({ kind: "notAdmitted", code: "BODY_TOO_LARGE" });
    expect(cancelled).toBe(true);
  });

  it("rejects invalid raw UTF-8 and excessive chunk fragmentation", async () => {
    const invalidUtf8 = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0xc3, 0x28])); controller.close(); },
    });
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.resolve(streamResponse(invalidUtf8)),
    )).resolves.toMatchObject({ kind: "notAdmitted", code: "INVALID_UTF8" });

    const fragmented = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index <= EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_CHUNKS; index += 1) {
          controller.enqueue(new Uint8Array([32]));
        }
      },
    });
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.resolve(streamResponse(fragmented)),
    )).resolves.toMatchObject({ kind: "notAdmitted", code: "TOO_MANY_RESPONSE_CHUNKS" });
  });

  it("retains receipt of an HTTP response even when reading its body rejects", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error("private-body-error")); },
    });
    const result = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    ));
    expect(result).toEqual({ kind: "notAdmitted", code: "TRANSPORT_FAILURE", failureKind: "EXCEPTION", responseReceived: true, httpStatus: 200 });
    expect(JSON.stringify(result)).not.toContain("private-body-error");
  });

  it("maps transport failure and aborts the actual request signal at deadline", async () => {
    await expect(executeEximbayRefundRetrieve(
      plan(), () => Promise.reject(new Error("synthetic transport failure")),
    )).resolves.toMatchObject({ kind: "notAdmitted", code: "TRANSPORT_FAILURE", failureKind: "EXCEPTION", responseReceived: false, httpStatus: null });

    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const pending = executeEximbayRefundRetrieve(plan(), (_input, init) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    await vi.advanceTimersByTimeAsync(EXIMBAY_REFUND_RETRIEVE_DEADLINE_MS + 1);
    await expect(pending).resolves.toMatchObject({ kind: "notAdmitted", code: "TRANSPORT_FAILURE", failureKind: "EXCEPTION", responseReceived: false, httpStatus: null });
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


describe("observational retrieve diagnostic parity", () => {
  it.each(REJECTION_CASES)("retains the established fixture result: %s", async (_label, override, code) => {
    const diagnostic = await diagnoseEximbayRefundRetrieve(plan(), () => Promise.resolve(response(override)));
    const financial = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(response(override)));
    expect(diagnostic.parserResult).toBe(code);
    expect(financial).toMatchObject({ kind: "notAdmitted", code });
  });
  it.each([
    [null, "ROOT_NOT_OBJECT"],
    [{ ...bodyObject(), extra: "private" }, "ROOT_KEY_SET_MISMATCH"],
    [{ ...bodyObject(), resmsg: "" }, "ROOT_REQUIRED_TEXT_INVALID"],
    [{ ...bodyObject(), payment: [] }, "PAYMENT_NOT_OBJECT"],
    [{ ...bodyObject(), card_info: [] }, "OPTIONAL_ROOT_ENVELOPE_INVALID"],
    [{ ...bodyObject(), other_param: { param1: [] } }, "OPTIONAL_ROOT_ENVELOPE_INVALID"],
    [{ ...bodyObject(), payment: { ...bodyObject().payment, extra: 1 } }, "PAYMENT_KEY_SET_MISMATCH"],
    [{ ...bodyObject(), payment: { ...bodyObject().payment, balance: undefined } }, "PAYMENT_KEY_SET_MISMATCH"],
    [{ ...bodyObject(), payment: { ...bodyObject().payment, auth_code: [] } }, "OPTIONAL_PAYMENT_ENVELOPE_INVALID"],
    [{ ...bodyObject(), mid: "" }, "IDENTITY_SHAPE_INVALID"],
    [{ ...bodyObject(), payment: { ...bodyObject().payment, transaction_date: "20260101" } }, "TRANSACTION_DATE_SHAPE_INVALID"],
    [{ ...bodyObject(), payment: { ...bodyObject().payment, balance: "bad" } }, "BALANCE_SHAPE_INVALID"],
    [{ ...bodyObject(), payment: { ...bodyObject().payment, amount: "bad" } }, "OTHER_EXACT_STRUCTURAL_FAILURE"],
  ])("reports the actual first predicate %j -> %s", async (value, failure) => {
    const body = JSON.stringify(value);
    const observation = await diagnoseEximbayRefundRetrieve(plan(), () => Promise.resolve(rawResponse(body)));
    const financial = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(rawResponse(body)));
    expect(observation.shape.firstFailure).toBe(failure);
    expect(financial.kind).toBe("notAdmitted");
    if (financial.kind === "notAdmitted") expect(observation.parserResult).toBe(financial.code);
  });
  it("retains success, value privacy, and the shared plan one-shot ceiling", async () => {
    const selected = plan();
    const transport = vi.fn(() => Promise.resolve(response({ card_info: { cardno1: "4111", cardno4: "1111" } })));
    const observation = await diagnoseEximbayRefundRetrieve(selected, transport);
    expect(observation.parserResult).toBe("ADMITTED");
    expect(observation.shape.firstFailure).toBe("UNESTABLISHED");
    expect(await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(response()))).toEqual(admittedFacts());
    expect(JSON.stringify(observation)).not.toMatch(/merchant-mid|order-1|transaction-1|4111|1111/);
    await expect(diagnoseEximbayRefundRetrieve(selected, transport)).rejects.toThrow("EXIMBAY_REFUND_RETRIEVE_PLAN_REUSED");
    await expect(executeEximbayRefundRetrieve(selected, transport)).rejects.toThrow("EXIMBAY_REFUND_RETRIEVE_PLAN_REUSED");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("never emits unknown key names, even when they contain identifiers", async () => {
    const observation = await diagnoseEximbayRefundRetrieve(plan(), () => Promise.resolve(rawResponse(JSON.stringify({
      ...bodyObject(), "private-customer-id": "private-value",
    }))));
    expect(observation.shape.root.extraKeyCount).toBe(1);
    expect(JSON.stringify(observation)).not.toContain("private");
  });
  it.each(["{", '{"rescode":"0000","rescode":"0000"}'])("keeps invalid JSON failure before structural checks", async (body) => {
    const observation = await diagnoseEximbayRefundRetrieve(plan(), () => Promise.resolve(rawResponse(body)));
    expect(observation.shape).toMatchObject({ jsonParseSuccess: false, firstFailure: "UNESTABLISHED" });
  });
});


describe("value-free optional root subpredicates", () => {
  async function observe(extra: Record<string, unknown>) {
    const body = JSON.stringify({ ...bodyObject(), ...extra });
    const transport = vi.fn(() => Promise.resolve(rawResponse(body)));
    const result = await diagnoseEximbayRefundRetrieve(plan(), transport);
    const financial = await executeEximbayRefundRetrieve(plan(), () => Promise.resolve(rawResponse(body)));
    expect(result.parserResult).toBe(financial.kind === "admitted" ? "ADMITTED" : financial.code);
    expect(isRetrieveShapeDiagnostic(result.shape)).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    return result;
  }
  it.each([
    [{ card_number1: "5826", card_number4: "9371" }, "FORMAL", true, true, true],
    [{ cardno1: "5826", cardno4: "9371" }, "LEGACY", true, true, true],
    [{ card_number1: "123", card_number4: "9371" }, "FORMAL", false, true, false],
    [{ cardno1: "5826", cardno4: "abcd" }, "LEGACY", true, false, false],
    [{ cardno1: "１２３４", cardno4: "9371" }, "LEGACY", false, true, false],
    [{ cardno1: "5826", cardno4: "9371\n" }, "LEGACY", true, false, false],
    [{ cardno1: 5826, cardno4: "9371" }, "LEGACY", false, true, false],
    [{ cardno1: "5826", card_number4: "9371" }, "INVALID", null, null, false],
    [{ cardno1: "5826", cardno4: "9371", card_number1: "5826", card_number4: "9371" }, "INVALID", null, null, false],
    [{ cardno1: "5826", cardno4: "9371", private: "value" }, "INVALID", null, null, false],
    [null, "INVALID", null, null, false],
    [[], "INVALID", null, null, false],
    [undefined, "ABSENT", null, null, true],
  ])("classifies card pair %j", async (card_info, pairKind, first, last, parserValid) => {
    const result = await observe({ card_info });
    expect(result.shape.optionalRootDetail?.cardInfo).toEqual({
      pairKind, firstFourAsciiDigits: first, lastFourAsciiDigits: last, parserValid,
    });
    expect(result.parserResult).toBe(parserValid ? "ADMITTED" : "UNKNOWN_SHAPE");
    expect(JSON.stringify(result)).not.toMatch(/5826|9371|private/);
  });
  const cases = [
    [undefined, "ABSENT", null, true], [null, "NOT_STRING", null, false],
    [19, "NOT_STRING", null, false], [[], "NOT_STRING", null, false],
    ["", "EMPTY_OR_WHITESPACE_ONLY", false, false], [" \t ", "EMPTY_OR_WHITESPACE_ONLY", false, false],
    [" leading", "TRIM_MISMATCH", false, false], ["trailing ", "TRIM_MISMATCH", false, false],
    ["a\u0000b", "CONTROL_OR_SURROGATE", false, false], ["a\u0085b", "CONTROL_OR_SURROGATE", false, false],
    ["a\ud800b", "CONTROL_OR_SURROGATE", false, false], ["a\udc00b", "CONTROL_OR_SURROGATE", false, false],
    ["q", "VALID", false, true], ["q".repeat(255), "VALID", false, true],
    ["한".repeat(85), "VALID", false, true], ["한".repeat(86), "OVER_255_UTF8_BYTES", false, false],
    ["😀".repeat(128), "OVER_255_UTF8_BYTES", false, false],
    ["q".repeat(256), "OVER_255_UTF8_BYTES", true, false],
    ["😀".repeat(256), "OVER_255_UTF8_BYTES", true, false],
  ] as const;
  describe.each(["param1", "param2"] as const)("%s", (key) => {
    it.each(cases)("classifies case %#", async (value, kind, over, parserValid) => {
      const result = await observe({ other_param: { [key]: value } });
      const detail = result.shape.optionalRootDetail?.otherParam;
      expect(detail).toMatchObject({ [`${key}Class`]: kind, [`${key}TextLengthOver255`]: over, parserValid });
      expect(result.parserResult).toBe(parserValid ? "ADMITTED" : "UNKNOWN_SHAPE");
      // The detail contains only enum strings, booleans, and null; never lengths.
      for (const field of Object.values(detail ?? {})) expect(typeof field).not.toBe("number");
      if (typeof value === "string" && value.length > 1) expect(JSON.stringify(result)).not.toContain(JSON.stringify(value));
    });
  });
  it.each([null, [], { unknownPrivateKey: "private" }])("rejects malformed other_param %j", async (other_param) => {
    const result = await observe({ other_param });
    expect(result.shape.optionalRootDetail?.otherParam.parserValid).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("observes both invalid envelopes and preserves earlier first failures", async () => {
    const extra = { card_info: { cardno1: "oops", cardno4: "9371" }, other_param: { param1: " bad", param2: "" } };
    const result = await observe(extra);
    expect(result.shape).toMatchObject({ firstFailure: "OPTIONAL_ROOT_ENVELOPE_INVALID", optionalRootDetail: {
      cardInfo: { parserValid: false }, otherParam: { parserValid: false, param1Class: "TRIM_MISMATCH", param2Class: "EMPTY_OR_WHITESPACE_ONLY" },
    } });
    for (const earlier of [{ resmsg: "" }, { payment: [] }, { unknown: true }]) {
      const first = await observe({ ...extra, ...earlier });
      expect(first.shape.firstFailure).not.toBe("OPTIONAL_ROOT_ENVELOPE_INVALID");
      expect(first.shape.optionalRootDetail).toBeNull();
    }
  });
  it("rejects private/extra detail at every level and inconsistent optional-root failure", async () => {
    const { shape } = await observe({});
    const detail = shape.optionalRootDetail;
    expect(detail).not.toBeNull();
    expect(isRetrieveShapeDiagnostic({ ...shape, firstFailure: "OPTIONAL_ROOT_ENVELOPE_INVALID" })).toBe(false);
    expect(isRetrieveShapeDiagnostic({ ...shape, optionalRootDetail: null, firstFailure: "OPTIONAL_ROOT_ENVELOPE_INVALID" })).toBe(false);
    for (const optionalRootDetail of [
      { ...detail, raw: "private" },
      { ...detail, cardInfo: { ...detail?.cardInfo, digits: "9371" } },
      { ...detail, otherParam: { ...detail?.otherParam, param1Length: 86 } },
      { ...detail, otherParam: { ...detail?.otherParam, param1Class: "private" } },
      { ...detail, otherParam: { ...detail?.otherParam, param1TextLengthOver255: 86 } },
    ]) expect(isRetrieveShapeDiagnostic({ ...shape, optionalRootDetail })).toBe(false);
  });
});
