import { PaymentProvider } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  NormalizedProviderWebhookEvent,
  ProviderAuthoritativeState,
  ProviderVerifiedWebhookInput,
  ProviderWebhookRawRequest,
  ProviderWebhookVerificationResult,
  VerifiedProviderContext,
} from "../../contract";
import { PaymentMode } from "../../routing";
import { deriveTossOrderId } from "../order-id";
import {
  createTossQueryWebhookVerifier,
  createTossWebhookParser,
  type TossLookupHttpResult,
  type TossPaymentCorrelationPort,
  type TossPaymentLookupPort,
} from "../webhook";

const PAYMENT_ID = "pay_123";
const CHECKOUT_SESSION_ID = "checkout_123";
const PAYMENT_KEY = "toss_payment_key_1234567890";
const AMOUNT = 12_000;
const CURRENCY = "KRW";
const TRANSMISSION_ID = "tx_toss_123";
const EVENT_ID = "evt_toss_123";
const RECEIVED_AT = new Date("2026-07-08T01:00:00.000Z");
const LOOKED_UP_AT = new Date("2026-07-08T01:00:02.000Z");
const APPROVED_AT = new Date("2026-07-08T00:59:59.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Toss query webhook verifier", () => {
  it("extracts candidate metadata and verifies with one injected lookup call", async () => {
    const lookup = recordingLookup(response(tossPayment()));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });
    const metadata = verifier.extractCandidateMetadata(rawWebhook());

    const result = await verifier.verify(rawWebhook());
    const input = expectVerified(result);

    expect(metadata).toEqual({
      kind: "metadata",
      metadata: {
        transmissionId: TRANSMISSION_ID,
        eventId: EVENT_ID,
        eventType: "PAYMENT_STATUS_CHANGED",
      },
    });
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
    expect(input.context).toEqual(verifiedContext());
    expect(input.authoritativeState).toMatchObject({
      lookedUpAt: LOOKED_UP_AT,
      approvedAt: APPROVED_AT,
      providerPaymentKey: PAYMENT_KEY,
      status: "DONE",
      amountMinor: AMOUNT,
      currency: CURRENCY,
      raw: { orderId: deriveTossOrderId(PAYMENT_ID) },
    });
  });

  it("does not call real network APIs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("real network blocked"));
    const lookup = recordingLookup(response(tossPayment()));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    await expect(verifier.verify(rawWebhook())).resolves.toMatchObject({ kind: "verified" });

    expect(lookup.calls).toEqual([PAYMENT_KEY]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects body and lookup paymentKey mismatch without producing capture input", async () => {
    const lookup = recordingLookup(response(tossPayment({ paymentKey: "different_payment_key" })));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "RAW_BODY_MISMATCH",
      code: "TOSS.PAYMENT_KEY_MISMATCH",
    });
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("rejects lookup network timeout with no verified capture input", async () => {
    const lookup = recordingLookup({ kind: "network_timeout" });
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result).toMatchObject({ kind: "rejected", reason: "LOOKUP_UNAVAILABLE", code: "TOSS.LOOKUP_TIMEOUT" });
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("rejects lookup network errors with no verified capture input", async () => {
    const lookup = recordingLookup({ kind: "network_error" });
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result).toMatchObject({ kind: "rejected", reason: "LOOKUP_UNAVAILABLE", code: "TOSS.LOOKUP_NETWORK_ERROR" });
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("distinguishes locally invalid paymentKey from genuine Toss 400 responses", async () => {
    const lookup = recordingLookup({ kind: "local_invalid_payment_key", receivedAt: LOOKED_UP_AT });
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result).toMatchObject({ kind: "rejected", reason: "METADATA_INVALID", code: "TOSS.PAYMENT_KEY_LOCAL_INVALID" });
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("rejects non-2xx lookup with no verified capture input", async () => {
    const lookup = recordingLookup(response({ code: "FAILED_INTERNAL_SYSTEM_PROCESSING" }, { httpStatus: 502 }));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result).toMatchObject({ kind: "rejected", reason: "LOOKUP_UNAVAILABLE", code: "TOSS.LOOKUP_HTTP_ERROR" });
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("rejects thrown lookup-port failures as lookup unavailable without leaking details", async () => {
    const sentinel = "sentinel_lookup_throw_must_not_leak";
    const lookup = throwingLookup(new Error(`db pool unavailable ${sentinel}`));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result).toMatchObject({ kind: "rejected", reason: "LOOKUP_UNAVAILABLE", code: "TOSS.LOOKUP_PORT_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("rejects invalid lookup response with no verified capture input", async () => {
    const lookup = recordingLookup(response({ paymentKey: PAYMENT_KEY, status: "DONE" }));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result.kind).toBe("rejected");
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("rejects malformed JSON without lookup or capture input", async () => {
    const lookup = recordingLookup(response(tossPayment()));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify({
      body: "{malformed json",
      headers: { "tosspayments-webhook-transmission-id": TRANSMISSION_ID },
      receivedAt: RECEIVED_AT,
    });

    expect(result).toMatchObject({ kind: "rejected", reason: "METADATA_INVALID", code: "TOSS.METADATA_INVALID" });
    expect(lookup.calls).toEqual([]);
  });

  it("rejects missing Toss transmission id without lookup", async () => {
    const lookup = recordingLookup(response(tossPayment()));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });
    const metadata = verifier.extractCandidateMetadata({ ...rawWebhook(), headers: {} });

    const result = await verifier.verify({ ...rawWebhook(), headers: {} });

    expect(metadata).toMatchObject({ kind: "rejected", reason: "METADATA_INVALID" });
    expect(result).toMatchObject({ kind: "rejected", reason: "METADATA_INVALID" });
    expect(lookup.calls).toEqual([]);
  });

  it("rejects missing data.paymentKey without lookup", async () => {
    const lookup = recordingLookup(response(tossPayment()));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook({ data: { status: "DONE" } }));

    expect(result).toMatchObject({ kind: "rejected", reason: "METADATA_INVALID", code: "TOSS.PAYMENT_KEY_MISSING" });
    expect(lookup.calls).toEqual([]);
  });

  it("acks CANCEL_STATUS_CHANGED as unsupported without lookup or verified input", async () => {
    const lookup = recordingLookup(response(tossPayment()));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook({ eventType: "CANCEL_STATUS_CHANGED", data: { cancelId: "cancel_123" } }));

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "UNSUPPORTED_EVENT",
      code: "TOSS.EVENT_ACKED_UNSUPPORTED",
      httpStatus: 200,
    });
    expect(lookup.calls).toEqual([]);
  });

  it("rejects DONE lookup response without approvedAt", async () => {
    const lookup = recordingLookup(response(tossPayment({ approvedAt: undefined })));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook());

    expect(result).toMatchObject({ kind: "rejected", reason: "METADATA_INVALID", code: "TOSS.LOOKUP_MALFORMED" });
    expect(lookup.calls).toEqual([PAYMENT_KEY]);
  });

  it("acks DEPOSIT_CALLBACK as unsupported before ordinary payment lookup", async () => {
    const lookup = recordingLookup(response(tossPayment()));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });

    const result = await verifier.verify(rawWebhook({ eventType: "DEPOSIT_CALLBACK" }));

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "UNSUPPORTED_EVENT",
      code: "TOSS.EVENT_ACKED_UNSUPPORTED",
      httpStatus: 200,
    });
    expect(lookup.calls).toEqual([]);
  });
});

describe("Toss query webhook parser", () => {
  it("uses provider approvedAt for capture time instead of lookup time", async () => {
    const parsed = await parseWithCorrelation(verifiedInput());
    const facts = expectCapture(parsed);

    expect(facts.capturedAt).toEqual(APPROVED_AT);
    expect(facts.capturedAt).not.toEqual(LOOKED_UP_AT);
  });

  it("uses lookup facts instead of conflicting webhook trigger body facts", async () => {
    const verifier = createTossQueryWebhookVerifier({
      context: verifiedContext(),
      lookup: recordingLookup(response(tossPayment())).lookup,
    });
    const verified = expectVerified(await verifier.verify(rawWebhook({
      data: {
        paymentKey: PAYMENT_KEY,
        providerPaymentKey: "body_payment_key_should_not_win",
        status: "READY",
        totalAmount: 1,
        amount: 1,
        currency: "USD",
      },
    })));
    const parsed = await parseWithCorrelation(verified);
    const facts = expectCapture(parsed);

    expect(facts).toMatchObject({
      provider: PaymentProvider.TOSS,
      providerPaymentKey: PAYMENT_KEY,
      amount: AMOUNT,
      currency: CURRENCY,
      mode: PaymentMode.SANDBOX,
    });
    expect(facts.providerPaymentKey).not.toBe("body_payment_key_should_not_win");
    expect(facts.amount).not.toBe(1);
    expect(facts.currency).not.toBe("USD");
  });

  it("uses verified context mode even when PAYMENT_MODE differs", async () => {
    const original = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = "LIVE";
    try {
      const parsed = await parseWithCorrelation(verifiedInput({ context: verifiedContext(PaymentMode.SANDBOX) }));
      expect(expectCapture(parsed).mode).toBe(PaymentMode.SANDBOX);
    } finally {
      restoreEnv("PAYMENT_MODE", original);
    }
  });

  it("captures DONE when correlation finds the checkout session", async () => {
    const correlation = recordingCorrelation({ checkoutSessionId: CHECKOUT_SESSION_ID });
    const parser = createTossWebhookParser({ correlation: correlation.correlation });

    const parsed = await parser.parse(verifiedInput());

    expect(correlation.calls).toEqual([PAYMENT_ID]);
    expect(expectCapture(parsed)).toMatchObject({
      checkoutSessionId: CHECKOUT_SESSION_ID,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerPaymentKey: PAYMENT_KEY,
      amount: AMOUNT,
      currency: CURRENCY,
    });
  });

  it("ignores DONE when payment correlation misses", async () => {
    const correlation = recordingCorrelation(null);
    const parser = createTossWebhookParser({ correlation: correlation.correlation });

    const parsed = await parser.parse(verifiedInput());

    expect(correlation.calls).toEqual([PAYMENT_ID]);
    expect(expectIgnored(parsed).reason).toBe("TOSS_PAYMENT_CORRELATION_MISSING");
  });

  it("ignores unparseable or foreign Toss orderId values", async () => {
    const parsed = await parseWithCorrelation(verifiedInput({
      authoritativeState: authoritativeState({ raw: { orderId: "foreign_order_123" } }),
    }));

    expect(expectIgnored(parsed).reason).toBe("TOSS_ORDER_ID_INVALID_PREFIX");
  });

  it.each([
    ["READY", "TOSS_STATUS_READY"],
    ["IN_PROGRESS", "TOSS_STATUS_IN_PROGRESS"],
    ["WAITING_FOR_DEPOSIT", "TOSS_STATUS_WAITING_FOR_DEPOSIT"],
    ["CANCELED", "TOSS_STATUS_CANCELED"],
    ["PARTIAL_CANCELED", "TOSS_STATUS_PARTIAL_CANCELED"],
    ["ABORTED", "TOSS_STATUS_ABORTED"],
    ["EXPIRED", "TOSS_STATUS_EXPIRED"],
  ])("ignores non-DONE Toss status %s with a distinct reason", async (status, reason) => {
    const parsed = await parseWithCorrelation(verifiedInput({
      authoritativeState: authoritativeState({ status }),
    }));

    expect(expectIgnored(parsed).reason).toBe(reason);
  });

  it("ignores unknown Toss status with a manual-review style reason", async () => {
    const parsed = await parseWithCorrelation(verifiedInput({
      authoritativeState: authoritativeState({ status: "FUTURE_UNKNOWN_STATUS" }),
    }));

    expect(expectIgnored(parsed).reason).toBe("TOSS_STATUS_UNKNOWN");
  });

  it("ignores CANCEL_STATUS_CHANGED and DEPOSIT_CALLBACK in this patch", async () => {
    const cancel = await parseWithCorrelation(verifiedInput({ eventType: "CANCEL_STATUS_CHANGED" }));
    const deposit = await parseWithCorrelation(verifiedInput({ eventType: "DEPOSIT_CALLBACK" }));

    expect(expectIgnored(cancel).reason).toBe("TOSS_CANCEL_STATUS_CHANGED_OUT_OF_SCOPE");
    expect(expectIgnored(deposit).reason).toBe("TOSS_DEPOSIT_CALLBACK_OUT_OF_SCOPE");
  });

  it("does not capture DONE authoritative state without approvedAt", async () => {
    const parsed = await parseWithCorrelation(verifiedInput({
      authoritativeState: authoritativeState({ approvedAt: undefined }),
    }));

    expect(expectIgnored(parsed).reason).toBe("TOSS_DONE_APPROVED_AT_MISSING");
  });

  it("throws clearly when authoritative state is absent", async () => {
    const parser = createTossWebhookParser({ correlation: recordingCorrelation(null).correlation });
    const input = verifiedInput({ authoritativeState: undefined });

    await expect(parser.parse(input)).rejects.toThrow("Toss query webhook missing authoritative state.");
  });

  it("does not leak sentinel lookup config or raw data through results or errors", async () => {
    const sentinel = "sentinel_lookup_config_value_must_not_leak";
    const lookup = recordingLookup(response({ ...tossPayment(), rawSecret: sentinel, card: { secret: sentinel } }));
    const verifier = createTossQueryWebhookVerifier({ context: verifiedContext(), lookup: lookup.lookup });
    const verifiedResult = await verifier.verify(rawWebhook());
    const verified = expectVerified(verifiedResult);
    const parser = createTossWebhookParser({ correlation: recordingCorrelation({ checkoutSessionId: CHECKOUT_SESSION_ID }).correlation });
    const parsed = await parser.parse(verified);

    expect(JSON.stringify(verifiedResult)).not.toContain(sentinel);
    expect(JSON.stringify(parsed)).not.toContain(sentinel);
    const parsedWithSentinelRaw = await parser.parse(verifiedInput({
      authoritativeState: authoritativeState({ raw: { orderId: deriveTossOrderId(PAYMENT_ID), sentinel } }),
    }));
    expect(JSON.stringify(parsedWithSentinelRaw)).not.toContain(sentinel);
    try {
      await parser.parse(verifiedInput({ authoritativeState: undefined }));
      throw new Error("Expected missing authoritative state to throw.");
    } catch (error) {
      expect(String(error)).not.toContain(sentinel);
    }
  });
});

function parseWithCorrelation(input: ProviderVerifiedWebhookInput): Promise<NormalizedProviderWebhookEvent> {
  return createTossWebhookParser({
    correlation: recordingCorrelation({ checkoutSessionId: CHECKOUT_SESSION_ID }).correlation,
  }).parse(input);
}

function verifiedContext(mode = PaymentMode.SANDBOX): VerifiedProviderContext {
  return {
    provider: PaymentProvider.TOSS,
    mode,
    credentialBinding: "toss:sandbox:test-binding",
    verificationMethod: "QUERY_LOOKUP",
  };
}

function rawWebhook(overrides: {
  eventType?: string;
  eventId?: string;
  transmissionId?: string;
  data?: Record<string, unknown>;
} = {}): ProviderWebhookRawRequest {
  return {
    body: JSON.stringify({
      eventType: overrides.eventType ?? "PAYMENT_STATUS_CHANGED",
      eventId: overrides.eventId ?? EVENT_ID,
      createdAt: "2026-07-08T00:59:00.000Z",
      data: overrides.data ?? { paymentKey: PAYMENT_KEY },
    }),
    headers: { "tosspayments-webhook-transmission-id": overrides.transmissionId ?? TRANSMISSION_ID },
    receivedAt: RECEIVED_AT,
  };
}

function tossPayment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paymentKey: PAYMENT_KEY,
    orderId: deriveTossOrderId(PAYMENT_ID),
    status: "DONE",
    totalAmount: AMOUNT,
    currency: CURRENCY,
    approvedAt: APPROVED_AT.toISOString(),
    ...overrides,
  };
}

function response(
  body: unknown,
  options: { httpStatus?: number; receivedAt?: Date } = {},
): TossLookupHttpResult {
  return {
    kind: "response",
    httpStatus: options.httpStatus ?? 200,
    body,
    receivedAt: options.receivedAt ?? LOOKED_UP_AT,
  };
}

function authoritativeState(overrides: Partial<ProviderAuthoritativeState> = {}): ProviderAuthoritativeState {
  return {
    lookedUpAt: LOOKED_UP_AT,
    approvedAt: APPROVED_AT,
    providerPaymentKey: PAYMENT_KEY,
    status: "DONE",
    amountMinor: AMOUNT,
    currency: CURRENCY,
    raw: { orderId: deriveTossOrderId(PAYMENT_ID) },
    ...overrides,
  };
}

function verifiedInput(overrides: Partial<ProviderVerifiedWebhookInput> = {}): ProviderVerifiedWebhookInput {
  const raw = rawWebhook({ eventType: overrides.eventType });
  return {
    ...raw,
    provider: PaymentProvider.TOSS,
    transmissionId: TRANSMISSION_ID,
    eventType: "PAYMENT_STATUS_CHANGED",
    context: verifiedContext(),
    authoritativeState: authoritativeState(),
    ...overrides,
  };
}

function recordingLookup(result: TossLookupHttpResult): { calls: string[]; lookup: TossPaymentLookupPort } {
  const calls: string[] = [];
  return {
    calls,
    lookup: (paymentKey) => {
      calls.push(paymentKey);
      return Promise.resolve(result);
    },
  };
}

function throwingLookup(error: Error): { calls: string[]; lookup: TossPaymentLookupPort } {
  const calls: string[] = [];
  return {
    calls,
    lookup: (paymentKey) => {
      calls.push(paymentKey);
      return Promise.reject(error);
    },
  };
}

function recordingCorrelation(
  result: { checkoutSessionId: string } | null,
): { calls: string[]; correlation: TossPaymentCorrelationPort } {
  const calls: string[] = [];
  return {
    calls,
    correlation: (paymentId) => {
      calls.push(paymentId);
      return Promise.resolve(result);
    },
  };
}

function expectVerified(result: ProviderWebhookVerificationResult): ProviderVerifiedWebhookInput {
  if (result.kind !== "verified") throw new Error("Expected verified Toss webhook result.");
  return result.input;
}

function expectCapture(event: NormalizedProviderWebhookEvent) {
  if (event.kind !== "capture") throw new Error("Expected Toss capture event.");
  return event.facts;
}

function expectIgnored(event: NormalizedProviderWebhookEvent) {
  if (event.kind !== "ignored") throw new Error("Expected Toss ignored event.");
  return event;
}

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = original;
}
