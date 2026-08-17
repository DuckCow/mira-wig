import { describe, expect, it } from "vitest";
import {
  createEximbayProviderOrderCandidate,
  requireProviderVerifiedEximbayStatus,
  validateTrustedEximbayFacts,
} from "@/lib/payment/providers/eximbay";
import { createProviderVerifiedEximbayStatus } from "@/lib/payment/providers/eximbay/verified-status";
import {
  EXIMBAY_BF4_SCHEMA,
  EXIMBAY_BF4_VERSION,
  EximbayBf4Stage,
  exactRawSha256,
  eximbayBf4RawClaim,
  eximbayBf4RejectTombstone,
  eximbayBf4TransactionClaim,
  minimizeEximbayBf4Envelope,
  validateEximbayBf4Envelope,
  type EximbayBf4Envelope,
} from "../bf4-envelope";

const RAW = "transaction_type=PAYMENT&mid=mid&order_id=order-1&currency=USD&amount=12.34&rescode=0000&resmsg=Success&fgkey=status&transaction_id=tx-secret";
const HASH = exactRawSha256(RAW);
const RECEIVED = "2026-08-17T00:00:00.000Z";
const VERIFY = "2026-08-17T00:00:01.000Z";
const RETRIEVE = "2026-08-17T00:00:02.000Z";
const TERMINAL = "2026-08-17T00:00:03.000Z";

describe("Eximbay BF4 closed envelope", () => {
  it.each(validEnvelopes().map((envelope) => [envelope.stage, envelope]))(
    "accepts the exact valid %s stage",
    (_stage, envelope) => {
      expect(validateEximbayBf4Envelope(envelope)).toEqual(envelope);
    },
  );

  it.each([
    ["unknown key", { ...claimed(), unexpected: true }],
    ["wrong schema", { ...claimed(), schema: "wrong" }],
    ["wrong version", { ...claimed(), version: 2 }],
    ["unknown stage", { ...claimed(), stage: "UNKNOWN" }],
    ["wrong raw type", { ...claimed(), exactRawQuery: 1 }],
    ["malformed hash", { ...claimed(), exactRawSha256: "ABC" }],
    ["inconsistent disposition", { ...claimed(), verification: "ADMITTED" }],
    ["unexpected terminal candidate", { ...terminalProcessed(), candidate: { orderId: "order-1" } }],
    ["missing verify marker", {
      ...verifiedPending(),
      timestamps: { receivedAt: RECEIVED, stageChangedAt: VERIFY },
    }],
  ])("rejects %s", (_label, envelope) => {
    expect(() => validateEximbayBf4Envelope(envelope)).toThrow();
  });

  it("hashes exact UTF-8 once and keeps plaintext transaction IDs out of namespaces", () => {
    expect(HASH).toMatch(/^[0-9a-f]{64}$/u);
    expect(HASH).toBe("dc6d207dcb921f40a5bcea4bf1e1c6fb8616a2d7322110409f114cadb19f9594");
    expect(eximbayBf4TransactionClaim("tx-secret")).toMatch(/^eximbay:status:tx:v1:[0-9a-f]{64}$/u);
    expect(eximbayBf4TransactionClaim("tx-secret")).not.toContain("tx-secret");
    expect(eximbayBf4RawClaim(HASH)).toBe(`eximbay:status:raw:v1:${HASH}`);
    expect(eximbayBf4RejectTombstone(HASH)).toBe(`eximbay:status:reject:v1:${HASH}`);
  });

  it("minimizes exact raw and candidate identifiers at exact SALE ownership", () => {
    const pending = retrieveUnknown();
    const minimized = minimizeEximbayBf4Envelope(pending, {
      stage: EximbayBf4Stage.VERIFIED_SALE_PENDING_COMPLETION,
      verification: "ADMITTED",
      retrieval: "ADMITTED_SALE",
      saleFacts: saleFacts("SALE"),
      timestamps: { ...pending.timestamps, stageChangedAt: RETRIEVE },
    });

    expect(minimized.exactRawQuery).toBeUndefined();
    expect(minimized.candidate).toBeUndefined();
    expect(minimized.exactRawSha256).toBe(HASH);
    expect(minimized.saleFacts?.transactionId).toBe("tx-secret");
  });
});

describe("ProviderVerifiedEximbayStatus runtime authority", () => {
  it("rejects public plain data and admits only a factory-authorized value", () => {
    const plain = verifiedInput();
    expect(() => requireProviderVerifiedEximbayStatus(plain)).toThrowError("UNTRUSTED_VERIFIED_STATUS");

    const verified = createProviderVerifiedEximbayStatus(plain);
    expect(() => requireProviderVerifiedEximbayStatus(verified)).not.toThrow();
    expect(validateTrustedEximbayFacts(verified, {
      paymentIdentity: "payment-1",
      provider: "EXIMBAY",
      mode: "SANDBOX",
      currency: "USD",
      amountMinor: 1234,
      providerOrderCandidate: createEximbayProviderOrderCandidate("payment-1"),
      providerOrderId: "order-1",
      mid: "mid",
    })).toMatchObject({
      authority: "TRUSTED_LOCAL_COMPLETION_CANDIDATE",
      transactionId: "tx-secret",
      amountMinor: 1234,
    });
  });
});

function validEnvelopes(): EximbayBf4Envelope[] {
  return [
    claimed(),
    verifyUnknown(),
    verifiedPending(),
    retrieveUnknown(),
    salePending(),
    nonSale(),
    saleMismatch(),
    completionRetryable(),
    terminalProcessed(),
    terminalRejectedSale(),
    terminalRejectedDefinitive(),
  ];
}

function claimed(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.CLAIMED_PRE_VERIFY,
    exactRawQuery: RAW,
    candidate: candidate(),
    verification: "NOT_ATTEMPTED",
    retrieval: "NOT_ATTEMPTED",
    timestamps: { receivedAt: RECEIVED, stageChangedAt: RECEIVED },
  });
}

function verifyUnknown(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
    exactRawQuery: RAW,
    candidate: candidate(),
    verification: "OUTCOME_UNKNOWN",
    retrieval: "NOT_ATTEMPTED",
    timestamps: verifyTimestamps(),
  });
}

function verifiedPending(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.VERIFIED_PENDING_RETRIEVE,
    exactRawQuery: RAW,
    candidate: candidate(),
    verification: "ADMITTED",
    retrieval: "NOT_ATTEMPTED",
    timestamps: verifyTimestamps(),
  });
}

function retrieveUnknown(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
    exactRawQuery: RAW,
    candidate: candidate(),
    verification: "ADMITTED",
    retrieval: "OUTCOME_UNKNOWN",
    timestamps: retrieveTimestamps(),
  });
}

function salePending(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.VERIFIED_SALE_PENDING_COMPLETION,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE",
    saleFacts: saleFacts("SALE"),
    timestamps: retrieveTimestamps(),
  });
}

function nonSale(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.VERIFIED_NON_SALE_REQUIRES_ADJUDICATION,
    exactRawQuery: RAW,
    candidate: candidate(),
    verification: "ADMITTED",
    retrieval: "ADMITTED_NON_SALE",
    saleFacts: saleFacts("AUTH"),
    timestamps: retrieveTimestamps(),
    diagnostic: "NON_SALE",
  });
}

function saleMismatch(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
    exactRawQuery: RAW,
    candidate: candidate(),
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE_MISMATCH",
    saleFacts: saleFacts("SALE"),
    timestamps: retrieveTimestamps(),
    diagnostic: "SALE_MONEY_MISMATCH",
  });
}

function completionRetryable(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.COMPLETION_RETRYABLE,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE",
    saleFacts: saleFacts("SALE"),
    timestamps: retrieveTimestamps(),
    diagnostic: "COMPLETION_RETRYABLE",
  });
}

function terminalProcessed(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.TERMINAL_PROCESSED,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE",
    saleFacts: saleFacts("SALE"),
    timestamps: terminalTimestamps(),
  });
}

function terminalRejectedSale(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.TERMINAL_REJECTED,
    verification: "ADMITTED",
    retrieval: "ADMITTED_SALE",
    saleFacts: saleFacts("SALE"),
    timestamps: terminalTimestamps(),
    diagnostic: "COMPLETION_TERMINAL",
  });
}

function terminalRejectedDefinitive(): EximbayBf4Envelope {
  return envelope({
    stage: EximbayBf4Stage.TERMINAL_REJECTED,
    verification: "DEFINITIVELY_REJECTED",
    retrieval: "NOT_ATTEMPTED",
    timestamps: {
      receivedAt: RECEIVED,
      stageChangedAt: TERMINAL,
      verifyContactMarkedAt: VERIFY,
      terminalAt: TERMINAL,
    },
    diagnostic: "DEFINITIVE_REJECT",
  });
}

function envelope(
  input: Omit<EximbayBf4Envelope, "schema" | "version" | "exactRawSha256">,
): EximbayBf4Envelope {
  return validateEximbayBf4Envelope({
    schema: EXIMBAY_BF4_SCHEMA,
    version: EXIMBAY_BF4_VERSION,
    exactRawSha256: HASH,
    ...input,
  });
}

function candidate() {
  return { orderId: "order-1", transactionId: "tx-secret", resultCode: "0000" };
}

function saleFacts(status: "SALE" | "AUTH") {
  return {
    mid: "mid",
    providerOrderId: "order-1",
    transactionId: "tx-secret",
    currency: "USD",
    amountWire: "12.34",
    amountMinor: 1234,
    status,
    transactionDate: "20260817000000",
  };
}

function verifyTimestamps() {
  return { receivedAt: RECEIVED, stageChangedAt: VERIFY, verifyContactMarkedAt: VERIFY };
}

function retrieveTimestamps() {
  return {
    ...verifyTimestamps(),
    stageChangedAt: RETRIEVE,
    retrieveContactMarkedAt: RETRIEVE,
  };
}

function terminalTimestamps() {
  return { ...retrieveTimestamps(), stageChangedAt: TERMINAL, terminalAt: TERMINAL };
}

function verifiedInput() {
  return {
    transactionType: "PAYMENT",
    rescode: "0000",
    status: "SALE",
    mid: "mid",
    orderId: "order-1",
    currency: "USD",
    amount: "12.34",
    transactionId: "tx-secret",
    correlation: { paymentIdentity: "payment-1", provider: "EXIMBAY", mode: "SANDBOX" },
  };
}
