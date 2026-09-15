import { createHash } from "node:crypto";
import { build } from "esbuild";
import { main as commandMain } from "../../../../../../../scripts/eximbay-contacted-refund-evidence-once";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EXIMBAY_REFUND_REENTRY_TARGET as target } from "../../../eximbay-refund-reentry-authority";
import { recoverContactedEvidenceAuthority, type ContactedEvidenceRow } from "../contacted-evidence-state";
import { parseContactedRefundEvidence } from "../contacted-evidence-parser";
import { deriveEximbayMerchantRefundId } from "../refund-id";
import { fingerprintEximbayCancelWire } from "../cancel-wire";
import { deriveEximbayRefundOperationFamily, fingerprintEximbayRefundObservation,
  EXIMBAY_REFUND_CANCEL_WIRE_VERSION, EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
  EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION, EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
} from "../preflight-contract";
import { readContactedEvidenceDatabase, runEximbayContactedRefundEvidenceOnce } from "../../../run-eximbay-contacted-refund-evidence-once";
import type { EximbayRefundLookupAuthority } from "../refund-lookup";

type FakeReadTransaction = { refundExecutionCommand: { findUnique: (args: unknown) => Promise<ContactedEvidenceRow | null> } };
const databaseBoundary = vi.hoisted(() => ({
  findUnique: vi.fn<(args: unknown) => Promise<ContactedEvidenceRow | null>>(),
  transaction: vi.fn<(operation: (tx: FakeReadTransaction) => Promise<ContactedEvidenceRow | null>, options: unknown) => Promise<ContactedEvidenceRow | null>>(),
  disconnect: vi.fn<() => Promise<void>>(),
}));
vi.mock("@prisma/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@prisma/client")>(),
  PrismaClient: class {
    $transaction = databaseBoundary.transaction;
    $disconnect = databaseBoundary.disconnect;
  },
}));

const secretBoundary = vi.hoisted(() => ({ readSecret: vi.fn<() => Promise<string>>().mockResolvedValue("fake-secret") }));
vi.mock("../../../eximbay-refund-canary-secret-reader", () => ({ readExactEximbayRefundCanarySecret: secretBoundary.readSecret }));

const config = { mode: "SANDBOX" as const, mid: "fake-mid", merchantAccountBindingId: "fake-merchant",
  credentialGenerationBindingId: "fake-generation" };
const env = { EXIMBAY_SANDBOX_MID: config.mid,
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE: "projects/fake-project/secrets/fake-key",
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "1",
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST: createHash("sha256").update(JSON.stringify([
    "mira-refund-eximbay-canary-secret-generation/v1", "projects/fake-project/secrets/fake-key", "1", config.credentialGenerationBindingId,
  ])).digest("hex"),
  EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING: config.merchantAccountBindingId,
  EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING: config.credentialGenerationBindingId };
const family = deriveEximbayRefundOperationFamily("fake-logical-operation", "fake-original-transaction", 100, "USD");
const refundId = deriveEximbayMerchantRefundId(family.fingerprint, 1);
const facts = { mid: config.mid, providerOrderId: "fake-provider-order", providerTransactionId: "fake-original-transaction",
  providerStatus: "SALE" as const, currency: "USD" as const, originalAmount: 100, refundableBalance: 100 };
const authority: EximbayRefundLookupAuthority = {
  targetDispatchAttemptId: "fake-dispatch", mid: config.mid, providerOrderId: facts.providerOrderId,
  originalTransactionId: facts.providerTransactionId, currency: "USD", originalAmount: 100,
  preContactRefundableBalance: 100, expectedRefundAmount: 100, expectedRefundType: "F",
  providerOperationKey: refundId, language: "EN",
};

function fixture(): ContactedEvidenceRow {
  const time = new Date("2026-09-14T00:00:00Z");
  return {
    id: target.commandId, refundAttemptId: target.refundAttemptId, status: "WAITING_EVIDENCE",
    leaseGeneration: 6, dispatchAttempt: 1,
    eximbaySandboxCanaryApproval: { commandId: target.commandId, targetBindingDigest: target.targetBindingDigest, consumedAt: time },
    dispatchAttempts: [{ id: "fake-dispatch", commandId: target.commandId, ordinal: 1, leaseGeneration: 6,
      provider: "EXIMBAY", mode: "SANDBOX", providerOperationKey: refundId,
      requestFingerprint: fingerprintEximbayCancelWire({ mid: config.mid, merchantAccountBindingId: config.merchantAccountBindingId,
        credentialGenerationBindingId: config.credentialGenerationBindingId,
        originalTransactionId: facts.providerTransactionId, providerOrderId: facts.providerOrderId,
        currency: "USD", originalAmount: 100, refundableBalance: 100, requestedAmount: 100,
        refundType: "F", providerOperationKey: refundId, language: "EN",
      }), state: "CONTACT_MAY_HAVE_OCCURRED", contactMarkedAt: time }],
    refundAttempt: {
      id: target.refundAttemptId, orderId: target.orderId, paymentId: target.paymentId,
      provider: "EXIMBAY", mode: "SANDBOX", amount: 100, currency: "USD", status: "PROCESSING",
      providerRefundId: null, idempotencyKey: "fake-logical-operation",
      order: { id: target.orderId, paymentId: target.paymentId, status: "REFUND_PENDING", totalAmount: 100, currency: "USD" },
      payment: { id: target.paymentId, provider: "EXIMBAY", mode: "SANDBOX", amount: 100, currency: "USD",
        status: "SUCCEEDED", providerOrderId: facts.providerOrderId, providerPaymentKey: facts.providerTransactionId,
        financialSucceededAt: time },
      providerOperationBinding: {
        id: target.providerOperationBindingId, refundAttemptId: target.refundAttemptId, provider: "EXIMBAY", mode: "SANDBOX",
        providerOperationFamilyKey: family.key, operationFamilyFingerprint: family.fingerprint,
        operationFamilyKeyAlgorithmVersion: EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
        wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
        merchantAccountBindingId: config.merchantAccountBindingId,
        credentialGenerationBindingId: config.credentialGenerationBindingId,
        eximbayPreflightObservations: [{ id: "fake-observation", bindingId: target.providerOperationBindingId,
          observingLeaseGeneration: 6, ...facts, observedAt: time, createdAt: time,
          inquiryContractVersion: EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION, parserVersion: EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
          observationFingerprint: fingerprintEximbayRefundObservation({ refundAttemptId: target.refundAttemptId,
            commandId: target.commandId, bindingId: target.providerOperationBindingId, observingLeaseGeneration: 6,
            provider: "EXIMBAY", mode: "SANDBOX", merchantAccountBindingId: config.merchantAccountBindingId,
            credentialGenerationBindingId: config.credentialGenerationBindingId,
            wireContractVersion: EXIMBAY_REFUND_CANCEL_WIRE_VERSION, facts, observedAt: time }),
        }],
      },
    },
  };
}
function response(payment: Record<string, unknown> = {}) {
  return { rescode: "0000", resmsg: "Success", mid: config.mid, payment: {
    status: "REFUND", order_id: facts.providerOrderId, currency: "USD", amount: "1.00",
    transaction_id: facts.providerTransactionId, transaction_date: "20260914000000",
    refund_id: refundId, refund_transaction_id: "fake-refund-transaction", refund_amount: "1.00", ...payment,
  } };
}
function fakeFetch(body: unknown = response()) {
  return vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
}
async function run(row: ContactedEvidenceRow | null = fixture(), fetch = fakeFetch(), databaseDisconnected = true) {
  secretBoundary.readSecret.mockClear();
  const readDatabase = vi.fn().mockResolvedValue({ row, databaseDisconnected, databaseReadSucceeded: true });
  const result = await runEximbayContactedRefundEvidenceOnce(target.commandId, env, { readDatabase, fetch, readSecret: secretBoundary.readSecret });
  return { result, fetch, readDatabase };
}

describe("exact contacted dispatch read-only evidence", () => {
  it("recovers the persisted dispatch key without allocating a new identity", () => {
    expect(recoverContactedEvidenceAuthority(fixture(), config)).toEqual(authority);
    const source = readFileSync("src/lib/payment/refund/providers/eximbay/contacted-evidence-state.ts", "utf8");
    expect(source).not.toMatch(/deriveEximbayMerchantRefundId|randomUUID/u);
  });
  const mutations: [string, (r: ContactedEvidenceRow) => void][] = [
    ["missing dispatch", r => { r.dispatchAttempts = []; }],
    ["ambiguous dispatch", r => { r.dispatchAttempts.push({ ...r.dispatchAttempts[0], id: "second" }); }],
    ["generation", r => { r.leaseGeneration = 5; }],
    ["dispatch generation", r => { r.dispatchAttempts[0].leaseGeneration = 5; }],
    ["digest", r => { if (r.eximbaySandboxCanaryApproval) r.eximbaySandboxCanaryApproval.targetBindingDigest = "0".repeat(64); }],
    ["provider", r => { r.dispatchAttempts[0].provider = "TOSS"; }],
    ["mode", r => { r.dispatchAttempts[0].mode = "LIVE"; }],
    ["payment", r => { r.refundAttempt.payment.id = "wrong"; }],
    ["order", r => { r.refundAttempt.order.id = "wrong"; }],
    ["amount", r => { r.refundAttempt.amount = 101; }],
    ["currency", r => { r.refundAttempt.currency = "JPY"; }],
    ["marker", r => { r.dispatchAttempts[0].contactMarkedAt = null; }],
    ["wire fingerprint", r => { r.dispatchAttempts[0].requestFingerprint = "0".repeat(64); }],
    ["different persisted key", r => { r.dispatchAttempts[0].providerOperationKey = deriveEximbayMerchantRefundId(family.fingerprint, 2); }],
    ["original transaction", r => { r.refundAttempt.payment.providerPaymentKey = "different"; }],
    ["binding", r => { r.refundAttempt.providerOperationBinding = null; }],
    ["observation", r => { if (r.refundAttempt.providerOperationBinding) r.refundAttempt.providerOperationBinding.eximbayPreflightObservations = []; }],
  ];
  it.each(mutations)("refuses %s without contacting provider", async (_name, mutate) => {
    const row = fixture(); mutate(row);
    const { result, fetch } = await run(row);
    expect(result.inquiryCount).toBe(0); expect(fetch).not.toHaveBeenCalled();
    expect(secretBoundary.readSecret).not.toHaveBeenCalled();
  });
  it("stops on missing command", async () => { expect((await run(null)).result.firstFailure).toBe("TARGET_UNAVAILABLE"); });
  it("stops on failed disconnect", async () => {
    const { result, fetch } = await run(fixture(), fakeFetch(), false);
    expect(result.firstFailure).toBe("DATABASE_DISCONNECT_FAILED"); expect(fetch).not.toHaveBeenCalled();
  });
  it("sends exactly one refund-id inquiry with the persisted ID after database cleanup", async () => {
    const { result, fetch, readDatabase } = await run();
    expect(result).toMatchObject({ parserResult: "MATCHED_REFUND_TRANSACTION", inquiryCount: 1, databaseDisconnected: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api-test.eximbay.com/v1/payments/retrieve");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    if (typeof init?.body !== "string") throw new Error("expected string request body");
    expect(JSON.parse(init.body)).toEqual({ mid: config.mid, key_field: "refund_id", payment: {
      order_id: facts.providerOrderId, currency: "USD", amount: "1.00", lang: "EN",
      transaction_id: facts.providerTransactionId, refund_id: refundId,
    } });
    expect(readDatabase.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    const safe = JSON.stringify(result);
    for (const raw of [refundId, facts.providerOrderId, facts.providerTransactionId, "fake-refund-transaction", "fake-secret", config.mid]) {
      expect(safe).not.toContain(raw);
    }
    expect(safe).not.toMatch(/length|bytes|authorization|body/iu);
  });
  it.each(["latest", "", " 1"])("rejects non-exact secret version %s before DB/secret/provider", async version => {
    const readDatabase = vi.fn(); const fetch = fakeFetch(); const readSecret = vi.fn();
    const result = await runEximbayContactedRefundEvidenceOnce(target.commandId, {
      ...env, MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: version,
    }, { readDatabase, fetch, readSecret });
    expect(result.firstFailure).toBe("CONFIG_INVALID");
    expect(readDatabase).not.toHaveBeenCalled(); expect(readSecret).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses a changed secret generation digest", async () => {
    const readDatabase = vi.fn(); const fetch = fakeFetch(); const readSecret = vi.fn();
    const result = await runEximbayContactedRefundEvidenceOnce(target.commandId, {
      ...env, MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST: "0".repeat(64),
    }, { readDatabase, fetch, readSecret });
    expect(result.firstFailure).toBe("CONFIG_INVALID"); expect(readSecret).not.toHaveBeenCalled();
    expect(readDatabase).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("reports credential failure without provider contact or raw error output", async () => {
    secretBoundary.readSecret.mockRejectedValueOnce(new Error("private-secret-error"));
    const { result, fetch } = await run();
    expect(result).toMatchObject({ firstFailure: "CREDENTIAL_UNAVAILABLE", inquiryCount: 0 });
    expect(fetch).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("private-secret-error");
  });
  it("does not retry or query by another key on transport failure", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("private-provider-error"));
    const out = await run(fixture(), fetch);
    expect(fetch).toHaveBeenCalledTimes(1); expect(out.result.inquiryCount).toBe(1);
    expect(JSON.stringify(out.result)).not.toContain("private-provider-error");
  });
  it("counts malformed JSON as one inquiry", async () => {
    const fetch = fakeFetch(); fetch.mockResolvedValue(new Response("{", { headers: { "content-type": "application/json" } }));
    expect((await run(fixture(), fetch)).result).toMatchObject({ inquiryCount: 1, jsonValid: false, firstFailure: "INVALID_JSON" });
  });
  it("rejects non-2xx without a fallback", async () => {
    const fetch = fakeFetch(); fetch.mockResolvedValue(new Response("private", { status: 503 }));
    expect((await run(fixture(), fetch)).result).toMatchObject({ inquiryCount: 1, httpStatus: 503, firstFailure: "NON_2XX" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects an arbitrary command selector before any capability", async () => {
    const readDatabase = vi.fn(); const fetch = fakeFetch();
    const result = await runEximbayContactedRefundEvidenceOnce("other", env, { readDatabase, fetch, readSecret: secretBoundary.readSecret });
    expect(result.inquiryCount).toBe(0); expect(readDatabase).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
});

describe("separate refund inquiry evidence parser", () => {
  it("accepts absent auth_code and matches REFUND", () => {
    const result = parseContactedRefundEvidence(response(), authority);
    expect(result.parserResult).toBe("MATCHED_REFUND_TRANSACTION");
    expect(result.shapeDiagnostic).toMatchObject({
      root: { valueClass: "VALID", exactKeysValid: true },
      payment: { valueClass: "VALID", exactKeysValid: true, fields: { auth_code: "ABSENT" } },
    });
  });
  it("accepts an exact empty auth_code as semantic absence", () => {
    const result = parseContactedRefundEvidence(response({ auth_code: "" }), authority);
    expect(result).toMatchObject({ parserResult: "MATCHED_REFUND_TRANSACTION", firstFailure: null,
      shapeDiagnostic: { payment: { fields: { auth_code: "EMPTY_OR_WHITESPACE_ONLY" } } } });
  });
  it("accepts a safe blank auth_code without rewriting its diagnostic class", () => {
    const result = parseContactedRefundEvidence(response({ auth_code: " \u00a0" }), authority);
    expect(result).toMatchObject({ parserResult: "MATCHED_REFUND_TRANSACTION", firstFailure: null,
      shapeDiagnostic: { payment: { fields: { auth_code: "EMPTY_OR_WHITESPACE_ONLY" } } } });
  });
  it("preserves valid nonblank auth_code behavior", () => {
    const result = parseContactedRefundEvidence(response({ auth_code: "A12345" }), authority);
    expect(result).toMatchObject({ parserResult: "MATCHED_REFUND_TRANSACTION", firstFailure: null,
      shapeDiagnostic: { payment: { fields: { auth_code: "VALID" } } } });
  });
  it("rejects a non-string auth_code", () => {
    const result = parseContactedRefundEvidence(response({ auth_code: 12345 }), authority);
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "PAYMENT_FIELD_INVALID",
      shapeDiagnostic: { payment: { fields: { auth_code: "NOT_STRING" } } } });
  });
  it.each([
    ["leading", " A12345"],
    ["trailing", "A12345 "],
  ])("preserves rejection of %s whitespace on nonblank auth_code", (_position, authCode) => {
    const result = parseContactedRefundEvidence(response({ auth_code: authCode }), authority);
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "PAYMENT_FIELD_INVALID",
      shapeDiagnostic: { payment: { fields: { auth_code: "TRIM_MISMATCH" } } } });
  });
  it("rejects a control character in blank auth_code", () => {
    const result = parseContactedRefundEvidence(response({ auth_code: "\t" }), authority);
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "PAYMENT_FIELD_INVALID",
      shapeDiagnostic: { payment: { fields: { auth_code: "EMPTY_OR_WHITESPACE_ONLY" } } } });
  });
  it("rejects an unpaired surrogate in auth_code", () => {
    const result = parseContactedRefundEvidence(response({ auth_code: "\ud800" }), authority);
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "PAYMENT_FIELD_INVALID",
      shapeDiagnostic: { payment: { fields: { auth_code: "CONTROL_OR_SURROGATE" } } } });
  });
  it("preserves the 512-byte auth_code boundary", () => {
    expect(parseContactedRefundEvidence(response({ auth_code: "x".repeat(512) }), authority).parserResult)
      .toBe("MATCHED_REFUND_TRANSACTION");
    expect(parseContactedRefundEvidence(response({ auth_code: " ".repeat(512) }), authority).parserResult)
      .toBe("MATCHED_REFUND_TRANSACTION");
  });
  it("rejects oversized nonblank and blank auth_code values", () => {
    for (const authCode of ["x".repeat(513), " ".repeat(513)]) {
      const result = parseContactedRefundEvidence(response({ auth_code: authCode }), authority);
      expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "PAYMENT_FIELD_INVALID" });
    }
  });
  it("lets REFUND with blank auth_code proceed past payment shape validation", () => {
    const result = parseContactedRefundEvidence(response({ auth_code: "" }), authority);
    expect(result).toMatchObject({ parserResult: "MATCHED_REFUND_TRANSACTION", firstFailure: null,
      providerStatusClass: "REFUND", providerResponseSuccess: true });
  });
  it("lets PARTIAL_REFUND with blank auth_code proceed past payment shape validation", () => {
    const partial = { ...authority, originalAmount: 200, preContactRefundableBalance: 200, expectedRefundType: "P" as const };
    const result = parseContactedRefundEvidence(response({
      status: "PARTIAL_REFUND", amount: "2.00", auth_code: "",
    }), partial);
    expect(result).toMatchObject({ parserResult: "MATCHED_REFUND_TRANSACTION", firstFailure: null,
      providerStatusClass: "PARTIAL_REFUND", providerResponseSuccess: true });
  });
  it.each([
    ["refund ID", { refund_id: "wrong" }, "IDENTITY_MISMATCH"],
    ["original transaction", { transaction_id: "wrong" }, "IDENTITY_MISMATCH"],
    ["currency", { currency: "JPY" }, "MONEY_MISMATCH"],
    ["amount", { refund_amount: "1.01" }, "MONEY_MISMATCH"],
    ["provider status", { status: "SALE" }, "UNESTABLISHED"],
  ])("preserves %s mismatch after admitting blank auth_code", (_name, patch, expected) => {
    expect(parseContactedRefundEvidence(response({ ...patch, auth_code: "" }), authority).parserResult)
      .toBe(expected);
  });
  it("matches PARTIAL_REFUND only for a partial operation", () => {
    const partial = { ...authority, originalAmount: 200, preContactRefundableBalance: 200, expectedRefundType: "P" as const };
    expect(parseContactedRefundEvidence(response({ status: "PARTIAL_REFUND", amount: "2.00" }), partial).parserResult).toBe("MATCHED_REFUND_TRANSACTION");
    expect(parseContactedRefundEvidence(response({ status: "PARTIAL_REFUND" }), authority).parserResult).toBe("UNESTABLISHED");
  });
  it.each([
    ["refund_id", "wrong", "IDENTITY_MISMATCH"], ["transaction_id", "wrong", "IDENTITY_MISMATCH"],
    ["order_id", "wrong", "IDENTITY_MISMATCH"], ["currency", "JPY", "MONEY_MISMATCH"],
    ["refund_amount", "1.01", "MONEY_MISMATCH"], ["amount", "1.01", "MONEY_MISMATCH"],
    ["balance", "1.00", "MONEY_MISMATCH"], ["status", "SALE", "UNESTABLISHED"],
  ])("rejects %s mismatch", (key, value, expected) => {
    expect(parseContactedRefundEvidence(response({ [key]: value }), authority).parserResult).toBe(expected);
  });
  it("requires refund transaction ID", () => {
    const value: Record<string, unknown> = response().payment; delete value.refund_transaction_id;
    expect(parseContactedRefundEvidence({ ...response(), payment: value }, authority).firstFailure).toBe("REFUND_TRANSACTION_ID_MISSING");
  });
  it("admits exact NONE only without contradictory refund fields", () => {
    const payment: Record<string, unknown> = response({ status: "NONE" }).payment;
    for (const field of ["refund_id", "refund_amount", "refund_transaction_id"]) delete payment[field];
    expect(parseContactedRefundEvidence({ ...response(), payment }, authority).parserResult).toBe("NO_MATCHING_REFUND_TRANSACTION");
    expect(parseContactedRefundEvidence(response({ status: "NONE" }), authority).parserResult).toBe("UNESTABLISHED");
  });
  it("classifies provider errors without exposing message/code", () => {
    const out = parseContactedRefundEvidence({ rescode: "9999", resmsg: "private-message" }, authority);
    expect(out.parserResult).toBe("PROVIDER_DEFINITIVE_ERROR"); expect(JSON.stringify(out)).not.toMatch(/9999|private-message/u);
  });
  it.each([
    [null, "ROOT_NOT_OBJECT"],
    [[], "ROOT_NOT_OBJECT"],
    [{}, "RESCODE_INVALID"],
    [{ ...response(), payment: [] }, "PAYMENT_NOT_OBJECT"],
    [{ ...response(), extra: "value" }, "ROOT_UNKNOWN_KEY"],
  ])("rejects unknown shape %# with an exact diagnostic", (value, firstFailure) => {
    const result = parseContactedRefundEvidence(value, authority);
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure });
    expect(result.shapeDiagnostic).not.toBeNull();
  });
  it.each([
    ["root not object", null, "ROOT_NOT_OBJECT"],
    ["unknown root key", { ...response(), private_root_value: "do-not-emit" }, "ROOT_UNKNOWN_KEY"],
    ["payment not object", { ...response(), payment: "do-not-emit" }, "PAYMENT_NOT_OBJECT"],
    ["unknown payment key", response({ private_payment_value: "do-not-emit" }), "PAYMENT_UNKNOWN_KEY"],
    ["missing required payment field", (() => {
      const payment: Record<string, unknown> = response().payment; delete payment.order_id;
      return { ...response(), payment };
    })(), "PAYMENT_REQUIRED_FIELD_MISSING"],
    ["blank optional payment value", response({ balance: "" }), "PAYMENT_FIELD_INVALID"],
    ["untrimmed optional payment value", response({ auth_code: " padded-private " }), "PAYMENT_FIELD_INVALID"],
    ["invalid transaction date", response({ transaction_date: "invalid-private-date" }), "TRANSACTION_DATE_INVALID"],
    ["invalid card info", { ...response(), card_info: "private-card" }, "CARD_INFO_INVALID"],
    ["invalid other param", { ...response(), other_param: "private-param" }, "OTHER_PARAM_INVALID"],
    ["mid invalid", { ...response(), mid: "" }, "MID_MISSING_OR_INVALID"],
  ])("keeps admission rejected and identifies %s", (_name, value, firstFailure) => {
    const result = parseContactedRefundEvidence(value, authority);
    expect(result.parserResult).toBe("UNKNOWN_SHAPE");
    expect(result.firstFailure).toBe(firstFailure);
  });
  it("reports only bounded unknown-key classes and canonical known-key presence", () => {
    const result = parseContactedRefundEvidence({ ...response({ z_unknown: "private" }),
      z_root_unknown: "private", card_info: { card_number4: "private", z_card_unknown: "private" },
      other_param: { param2: "", z_param_unknown: "private" } }, authority);
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "ROOT_UNKNOWN_KEY",
      shapeDiagnostic: {
        root: { exactKeysValid: false, unknownKeyClass: "ONE",
          knownKeyPresence: { rescode: true, resmsg: true, mid: true, payment: true,
            card_info: true, other_param: true }, missingRequiredKeys: [] },
        payment: { exactKeysValid: false, unknownKeyClass: "ONE",
          knownKeyPresence: { status: true, balance: false } },
        cardInfo: { present: true, objectValid: false, unknownKeyClass: "ONE",
          knownKeyPresence: { card_number4: true } },
        otherParam: { present: true, objectValid: false, unknownKeyClass: "ONE",
          knownKeyPresence: { param1: false, param2: true } },
      } });
  });
  it("reports closed value classes without exact lengths or raw values", () => {
    const untrimmed = parseContactedRefundEvidence(response({ balance: " private-balance " }), authority);
    expect(untrimmed.shapeDiagnostic).toMatchObject({
      payment: { fields: { balance: "TRIM_MISMATCH" } },
    });
    const blank = parseContactedRefundEvidence(response({ balance: "" }), authority);
    expect(blank.shapeDiagnostic).toMatchObject({
      payment: { fields: { balance: "EMPTY_OR_WHITESPACE_ONLY" } },
    });
    const invalidDate = parseContactedRefundEvidence(response({ transaction_date: "private-date" }), authority);
    expect(invalidDate.shapeDiagnostic).toMatchObject({
      payment: { fields: { transaction_date: "FORMAT_INVALID" } },
    });
    const malformedObjects = parseContactedRefundEvidence({ ...response(),
      card_info: "private-card", other_param: "private-param" }, authority);
    expect(malformedObjects.shapeDiagnostic).toMatchObject({
      cardInfo: { present: true, objectValid: false, unknownKeyClass: "NONE",
        knownKeyPresence: { card_number1: false, card_number4: false, cardno1: false, cardno4: false } },
      otherParam: { present: true, objectValid: false, unknownKeyClass: "NONE",
        knownKeyPresence: { param1: false, param2: false } },
    });
    expect(JSON.stringify([untrimmed, blank, invalidDate, malformedObjects]))
      .not.toMatch(/private-balance|private-date|private-card|private-param|length|bytes/iu);
  });
  it("admits blank optional metadata without changing identity requirements", () => {
    expect(parseContactedRefundEvidence({ ...response(), other_param: { param1: "", param2: "" } }, authority).parserResult).toBe("MATCHED_REFUND_TRANSACTION");
    expect(parseContactedRefundEvidence({ ...response({ refund_id: "wrong" }), other_param: { param1: "" } }, authority).parserResult).toBe("IDENTITY_MISMATCH");
  });
  it.each(["\u0000", "\ud800", "x".repeat(256)])("rejects unsafe/oversize optional metadata %#", value => {
    const result = parseContactedRefundEvidence({ ...response(), other_param: { param1: value } }, authority);
    expect(result.parserResult).toBe("UNKNOWN_SHAPE");
    expect(result.firstFailure).toBe("OTHER_PARAM_INVALID");
  });
  it("does not reject valid paired Unicode", () => {
    expect(parseContactedRefundEvidence({ ...response(), other_param: { param2: "😀" } }, authority).parserResult).toBe("MATCHED_REFUND_TRANSACTION");
  });
  it("keeps blank other_param metadata valid and classifies it without values", () => {
    const result = parseContactedRefundEvidence({ ...response(), other_param: { param1: "", param2: "" } }, authority);
    expect(result.parserResult).toBe("MATCHED_REFUND_TRANSACTION");
    expect(result.shapeDiagnostic?.otherParam).toMatchObject({ present: true, objectValid: true,
      fields: { param1: "VALID", param2: "VALID" } });
  });
  it("keeps the baseline admission, identity, and money result matrix unchanged", () => {
    const missingRefundTransaction: Record<string, unknown> = response().payment;
    delete missingRefundTransaction.refund_transaction_id;
    const cases: readonly [unknown, string][] = [
      [response(), "MATCHED_REFUND_TRANSACTION"],
      [response({ refund_id: "wrong-private" }), "IDENTITY_MISMATCH"],
      [response({ transaction_id: "wrong-private" }), "IDENTITY_MISMATCH"],
      [response({ currency: "JPY" }), "MONEY_MISMATCH"],
      [response({ refund_amount: "1.01" }), "MONEY_MISMATCH"],
      [response({ status: "SALE" }), "UNESTABLISHED"],
      [{ ...response(), payment: missingRefundTransaction }, "UNKNOWN_SHAPE"],
      [{ ...response(), extra: "private" }, "UNKNOWN_SHAPE"],
    ];
    expect(cases.map(([value]) => parseContactedRefundEvidence(value, authority).parserResult))
      .toEqual(cases.map(([, expected]) => expected));
  });
  it("never serializes rejected provider values or identifier-like values", () => {
    const rawValues = ["raw-refund-id", "raw-transaction-id", "raw-refund-transaction-id",
      "raw-order-id", "raw-mid", "raw-card-value", "secret-like-private-value"];
    const value = { rescode: "0000", resmsg: rawValues[6], mid: rawValues[4], payment: {
      status: "REFUND", order_id: rawValues[3], currency: "USD", amount: "1.00",
      transaction_id: rawValues[1], transaction_date: "20260914000000", refund_id: rawValues[0],
      refund_transaction_id: rawValues[2], refund_amount: "1.00", unknown_payment_key: rawValues[6],
    }, card_info: { card_number1: rawValues[5] } };
    const serialized = JSON.stringify(parseContactedRefundEvidence(value, authority));
    for (const raw of rawValues) expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain(JSON.stringify(value));
  });
  it("never serializes provider-controlled property names", () => {
    const unknownNames = [
      "4111111111111111",
      "secret-like-token-abc123",
      "transaction-id-like-20260916",
      "혼합-Unicode-秘密",
      "a",
      "Z",
    ];
    const value: Record<string, unknown> = { ...response() };
    for (const key of unknownNames) value[key] = "ignored";
    const result = parseContactedRefundEvidence(value, authority);
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "ROOT_UNKNOWN_KEY",
      shapeDiagnostic: { root: { unknownKeyClass: "MULTIPLE" } } });
    const serialized = JSON.stringify(result);
    for (const name of unknownNames) expect(serialized).not.toContain(JSON.stringify(name));
  });
  it("distinguishes one and multiple unknown keys without emitting their names", () => {
    const one = parseContactedRefundEvidence({ ...response(), arbitrary_one: "ignored" }, authority);
    const multiple = parseContactedRefundEvidence({ ...response(), arbitrary_one: "ignored",
      arbitrary_two: "ignored" }, authority);
    expect(one.shapeDiagnostic).toMatchObject({ root: { unknownKeyClass: "ONE" } });
    expect(multiple.shapeDiagnostic).toMatchObject({ root: { unknownKeyClass: "MULTIPLE" } });
    expect(JSON.stringify([one, multiple])).not.toMatch(/arbitrary_(?:one|two)/u);
  });
  it("reports canonical missing required keys and absent known optional keys", () => {
    const payment: Record<string, unknown> = response().payment;
    delete payment.order_id;
    const result = parseContactedRefundEvidence({ ...response(), payment }, authority);
    expect(result.shapeDiagnostic).toMatchObject({ payment: {
      missingRequiredKeys: ["order_id"],
      knownKeyPresence: { order_id: false, auth_code: false },
      fields: { order_id: "ABSENT", auth_code: "ABSENT" },
    } });
  });
});


describe("real database read helper at the fake database boundary", () => {
  it("uses only findUnique in a repeatable-read snapshot and disconnects", async () => {
    const row = fixture();
    databaseBoundary.findUnique.mockReset().mockResolvedValue(row);
    databaseBoundary.disconnect.mockReset().mockResolvedValue();
    databaseBoundary.transaction.mockReset().mockImplementation(operation => operation({
      refundExecutionCommand: { findUnique: databaseBoundary.findUnique },
    }));
    const result = await readContactedEvidenceDatabase({ DATABASE_URL: "postgresql://fake@localhost/fake" });
    expect(result).toEqual({ row, databaseDisconnected: true, databaseReadSucceeded: true });
    expect(databaseBoundary.findUnique).toHaveBeenCalledTimes(1);
    expect(databaseBoundary.findUnique.mock.calls[0][0]).toMatchObject({ where: { id: target.commandId } });
    expect(databaseBoundary.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" });
    expect(databaseBoundary.disconnect).toHaveBeenCalledTimes(1);
    // No mutation, lease, authorization, transition, email, or reconciliation delegates exist in this fake.
    expect(recoverContactedEvidenceAuthority(result.row!, config)).toEqual(authority);
  });
  it("reports a database error and still disconnects", async () => {
    databaseBoundary.transaction.mockRejectedValue(new Error("private-database-error"));
    databaseBoundary.disconnect.mockReset().mockResolvedValue();
    expect(await readContactedEvidenceDatabase({ DATABASE_URL: "postgresql://fake@localhost/fake" }))
      .toEqual({ row: null, databaseDisconnected: true, databaseReadSucceeded: false });
    expect(databaseBoundary.disconnect).toHaveBeenCalledTimes(1);
  });
  it("does not turn failed cleanup into success", async () => {
    databaseBoundary.transaction.mockResolvedValue(fixture());
    databaseBoundary.disconnect.mockRejectedValue(new Error("private-disconnect-error"));
    expect((await readContactedEvidenceDatabase({ DATABASE_URL: "postgresql://fake@localhost/fake" })).databaseDisconnected).toBe(false);
  });
});


describe("command integration and mutation reachability", () => {
  it("executes the CLI with fake DB/provider and emits only sanitized evidence", async () => {
    databaseBoundary.findUnique.mockReset().mockResolvedValue(fixture());
    databaseBoundary.disconnect.mockReset().mockResolvedValue();
    databaseBoundary.transaction.mockReset().mockImplementation(operation => operation({
      refundExecutionCommand: { findUnique: databaseBoundary.findUnique },
    }));
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubEnv("DATABASE_URL", "postgresql://fake@localhost/fake");
    const fetch = fakeFetch(); vi.stubGlobal("fetch", fetch);
    const previous = process.argv;
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      process.argv = ["node", "eximbay-contacted-refund-evidence-once.ts", target.commandId];
      expect(await commandMain()).toBe(0);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0]).toContain('"parserResult":"MATCHED_REFUND_TRANSACTION"');
      expect(write.mock.calls[0][0]).not.toContain(refundId);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(databaseBoundary.disconnect.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    } finally {
      process.argv = previous; write.mockRestore(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
    }
  });
  it("rejects invalid CLI arity without capabilities", async () => {
    const previous = process.argv;
    databaseBoundary.transaction.mockClear();
    try {
      process.argv = ["node", "command"];
      expect(await commandMain()).toBe(64);
      expect(databaseBoundary.transaction).not.toHaveBeenCalled();
    } finally { process.argv = previous; }
  });
  it("emits only sanitized shape diagnostics for a rejected provider response", async () => {
    const rawValues = [refundId, facts.providerOrderId, facts.providerTransactionId,
      "rejected-refund-transaction", "private-card-value", "secret-like-private-value", config.mid];
    const rejected = { ...response({ unknown_payment_key: rawValues[5] }),
      card_info: { card_number1: rawValues[4] } };
    const { result } = await run(fixture(), fakeFetch(rejected));
    expect(result).toMatchObject({ parserResult: "UNKNOWN_SHAPE", firstFailure: "PAYMENT_UNKNOWN_KEY",
      shapeDiagnostic: { payment: { unknownKeyClass: "ONE" } } });
    const serialized = JSON.stringify(result);
    for (const raw of rawValues) expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain(JSON.stringify(rejected));
  });
  it("has no financial mutation, authorization, lease, cancel, reconciliation, or email path in compiled command", async () => {
    const compiled = await build({ entryPoints: ["scripts/eximbay-contacted-refund-evidence-once.ts"],
      bundle: true, packages: "external", platform: "node", format: "esm", write: false, treeShaking: true });
    const code = compiled.outputFiles[0].text;
    expect(code).not.toMatch(/executeEximbayCancel|createEximbayCancelPlan|persistResolution|reconcile/u);
    expect(code).not.toMatch(/requestRefundAuthorizationAdmission|continueLeasedEximbay|runWithRefundProviderContactAdmission/u);
    expect(code).not.toMatch(/\.\$(?:executeRaw|queryRaw)|FOR UPDATE|sendEmail|SendEmail|sendMail/u);
    expect(code).not.toMatch(/\.(?:create|createMany|updateMany|upsert|delete|deleteMany)\(/u);
    // The only update calls in the compiled closure are SHA-256 hash accumulation.
    for (const line of code.split("\n").filter(line => /\.update\(/u.test(line))) expect(line).toMatch(/createHash/u);
    expect(code).not.toContain("deriveEximbayMerchantRefundId");
    expect(code).not.toContain("preflight-retrieve.ts");
  });
  it("times out the one request without retry", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(abortableFakeFetch);
    try {
      const pending = run(fixture(), fetch);
      await vi.advanceTimersByTimeAsync(25_000);
      const { result } = await pending;
      expect(result).toMatchObject({ inquiryCount: 1, firstFailure: "TRANSPORT_FAILURE" });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

function abortableFakeFetch(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("fake timeout")), { once: true });
  });
}
