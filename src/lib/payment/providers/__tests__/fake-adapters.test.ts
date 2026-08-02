import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createMockPaymentProvider } from "../mock";
import { TOSS_SANDBOX_SECRET_KEY } from "../credentials";
import { resolveInitiationProvider } from "../initiation";
import { resolveConfirmationProvider } from "../resolve";
import { PaymentMethod, PaymentMode } from "../routing";
import type {
  NormalizedProviderConfirmResult,
  NormalizedProviderWebhookEvent,
  ProviderAdapterFactory,
  ProviderAuthoritativeState,
  ProviderConfirmContractInput,
  ProviderFactoryContext,
  ProviderPaymentAdapter,
  ProviderVoidExecutor,
  ProviderVoidInput,
  ProviderVoidResult,
  ProviderWebhookCandidateMetadata,
  ProviderWebhookMetadataResult,
  ProviderWebhookParser,
  ProviderWebhookRawRequest,
  ProviderWebhookVerificationResult,
  ProviderWebhookVerifier,
  ProviderVerifiedWebhookInput,
  VerifiedProviderContext,
} from "../contract";
import type { PaymentInitiateInput, PaymentProvider as PaymentProviderPort } from "../types";

function resolveProvider(
  context: ProviderFactoryContext,
  options: Parameters<typeof resolveInitiationProvider>[1],
): PaymentProviderPort {
  const initiation = resolveInitiationProvider(context, options);
  const confirmation = resolveConfirmationProvider(context, options);
  return {
    code: initiation.code,
    initiate: (input) => initiation.initiate(input),
    confirm: (input) => confirmation.confirm(input),
  };
}

describe("fake provider adapter contract", () => {
  it("uses fake adapters without external provider calls", async () => {
    const adapter = createFakePaymentAdapter(PaymentProvider.TOSS);
    const initiated = await adapter.initiate(initiateInput());
    const confirmed = await adapter.confirm(confirmInput({ providerPaymentKey: "final_pay_123" }));

    expect(initiated).toMatchObject({
      kind: "redirect",
      providerRef: "pref_payment_123",
      provider: PaymentProvider.TOSS,
    });
    expect(initiated).not.toHaveProperty("providerPaymentKey");
    expect(confirmed).toMatchObject({ kind: "succeeded", providerPaymentKey: "final_pay_123" });
    expect(adapter.externalCalls()).toBe(0);
  });

  it("keeps confirm success behind a final providerPaymentKey", async () => {
    const adapter = createFakePaymentAdapter(PaymentProvider.PAYPAL);
    const missingKey = await adapter.confirm(confirmInput());
    const success = await adapter.confirm(confirmInput({ providerPaymentKey: "capture_final_456" }));

    expect(missingKey).toMatchObject({
      kind: "failed",
      classification: "PROGRAMMER_ERROR",
      normalizedCode: "PROVIDER_PROGRAMMER_ERROR",
    });
    expect(success).toMatchObject({ kind: "succeeded", providerPaymentKey: "capture_final_456" });
  });

  it("distinguishes fake webhook verification, rejection, parsed, and ignored events", async () => {
    const verifier = new FakeWebhookVerifier(PaymentProvider.TOSS);
    const parser = new FakeWebhookParser();
    const verified = await verifier.verify(webhookRaw("payment.captured"));
    const rejected = await verifier.verify(webhookRaw("payment.captured", "bad"));

    expect(verified.kind).toBe("verified");
    expect(rejected).toMatchObject({ kind: "rejected", reason: "SIGNATURE_INVALID" });
    if (verified.kind !== "verified") throw new Error("Expected verified fake webhook");

    const capture = await parser.parse(verified.input);
    const ignored = await parser.parse({
      ...verified.input,
      eventType: "payment.pending",
    });
    expect(capture.kind).toBe("capture");
    expect(ignored).toMatchObject({ kind: "ignored", reason: "payment.pending" });
  });

  it("passes query lookup authoritative state to the parser and ignores conflicting webhook body facts", async () => {
    const originalPaymentMode = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = "LIVE";
    try {
      const state = authoritativeState();
      const lookup = recordingLookup(state);
      const verifier = new FakeQueryWebhookVerifier(
        PaymentProvider.TOSS,
        PaymentMode.SANDBOX,
        "fake:toss:sandbox:credential-binding",
        lookup.lookup,
      );
      const parser = new FakeQueryWebhookParser();

      const verified = await verifier.verify(webhookRawWithBody("PAYMENT_STATUS_CHANGED", {
        checkoutSessionId: "checkout_query_123",
        providerPaymentKey: "body_payment_key_should_not_win",
        status: "READY",
        amount: 1,
        currency: "USD",
      }));

      expect(lookup.calls).toHaveLength(1);
      expect(verified.kind).toBe("verified");
      if (verified.kind !== "verified") throw new Error("Expected query-verified fake webhook");
      expect(verified.input.authoritativeState).toEqual(state);
      expect(verified.input.context).toMatchObject({
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        credentialBinding: "fake:toss:sandbox:credential-binding",
        verificationMethod: "QUERY_LOOKUP",
      });

      const parsed = await parser.parse(verified.input);

      expect(parsed.kind).toBe("capture");
      if (parsed.kind !== "capture") throw new Error("Expected query-verified fake capture");
      expect(parsed.facts).toMatchObject({
        checkoutSessionId: "checkout_query_123",
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        providerPaymentKey: state.providerPaymentKey,
        amount: state.amountMinor,
        currency: state.currency,
      });
      expect(parsed.facts.providerPaymentKey).not.toBe("body_payment_key_should_not_win");
      expect(parsed.facts.amount).not.toBe(1);
      expect(parsed.facts.currency).not.toBe("USD");
    } finally {
      restoreEnv("PAYMENT_MODE", originalPaymentMode);
    }
  });

  it("allows signature-verified fake parsing without authoritative state", async () => {
    const originalPaymentMode = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = "LIVE";
    try {
      const verifier = new FakeSignatureWebhookVerifier(
        PaymentProvider.PAYPAL,
        PaymentMode.SANDBOX,
        "fake:paypal:sandbox:webhook-id",
      );
      const parser = new FakeSignatureWebhookParser();

      const verified = await verifier.verify(webhookRawWithBody("PAYMENT.CAPTURE.COMPLETED", {
        checkoutSessionId: "checkout_signature_123",
        providerPaymentKey: "signature_capture_123",
        amount: 21_000,
        currency: "USD",
      }));

      expect(verified.kind).toBe("verified");
      if (verified.kind !== "verified") throw new Error("Expected signature-verified fake webhook");
      expect(verified.input.authoritativeState).toBeUndefined();
      expect(verified.input.context.verificationMethod).toBe("SIGNATURE");

      const parsed = await parser.parse(verified.input);

      expect(parsed.kind).toBe("capture");
      if (parsed.kind !== "capture") throw new Error("Expected signature-verified fake capture");
      expect(parsed.facts).toMatchObject({
        checkoutSessionId: "checkout_signature_123",
        provider: PaymentProvider.PAYPAL,
        mode: PaymentMode.SANDBOX,
        providerPaymentKey: "signature_capture_123",
        amount: 21_000,
        currency: "USD",
      });
    } finally {
      restoreEnv("PAYMENT_MODE", originalPaymentMode);
    }
  });

  it("keeps fake verifier rejections redacted", async () => {
    const sentinel = "sentinel_secret_config_value_must_not_leak";
    const verifier = new FakeWebhookVerifier(PaymentProvider.TOSS);

    const rejected = await verifier.verify({
      body: sentinel,
      headers: {
        "x-fake-transmission-id": "tx_fake_redacted",
        "x-fake-event-type": "payment.captured",
        "x-fake-signature": "bad",
        "x-fake-secret": sentinel,
      },
    });

    expect(rejected).toMatchObject({
      kind: "rejected",
      reason: "SIGNATURE_INVALID",
      code: "FAKE.SIGNATURE_INVALID",
      safeMessage: "Fake signature verification failed.",
    });
    expect(JSON.stringify(rejected)).not.toContain(sentinel);
    if (rejected.kind !== "rejected") throw new Error("Expected fake verifier rejection");
    const error = new Error(rejected.safeMessage);
    expect(String(error)).not.toContain(sentinel);
    expect(JSON.stringify(error)).not.toContain(sentinel);
  });

  it("distinguishes fake void result cases", async () => {
    const executor = new FakeVoidExecutor();
    const results = await Promise.all([
      executor.void(voidInput("success")),
      executor.void(voidInput("idempotent")),
      executor.void(voidInput("retryable")),
      executor.void(voidInput("terminal")),
      executor.void(voidInput("manual")),
      executor.void(voidInput("auth")),
    ]);

    expect(results.map((result) => result.kind)).toEqual([
      "succeeded",
      "idempotent_succeeded",
      "retryable",
      "terminal",
      "manual_review",
      "auth_stop",
    ]);
  });

  it("keeps adapter factory context redacted and explicit about live guard", () => {
    const factory = new FakeAdapterFactory();
    const context = factoryContext({ liveGuard: { kind: "blocked", liveEnabled: false, reason: "not allowlisted" } });
    const adapter = factory.createPaymentAdapter(context);

    expect(adapter.code).toBe(PaymentProvider.TOSS);
    expect(context.credentials).toEqual([{ name: TOSS_SANDBOX_SECRET_KEY, required: true, present: false }]);
    expect(context.credentials[0]).not.toHaveProperty("value");
    expect(context.liveGuard).toEqual({ kind: "blocked", liveEnabled: false, reason: "not allowlisted" });
  });

  it("keeps sandbox resolver behavior explicitly mock-backed", async () => {
    const resolved = resolveProvider(factoryContext({ provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX }), {});
    const explicitMock = createMockPaymentProvider(PaymentProvider.PAYPAL);

    await expect(resolved.initiate(initiateInput())).resolves.toEqual({ kind: "ready" });
    await expect(resolved.confirm(confirmInput())).resolves.toEqual({
      providerPaymentKey: "mock:checkout_123",
      amount: 12_000,
      currency: "KRW",
    });
    await expect(explicitMock.confirm(confirmInput({ provider: PaymentProvider.PAYPAL }))).resolves.toEqual({
      providerPaymentKey: "mock:checkout_123",
      amount: 12_000,
      currency: "KRW",
    });
  });
});

interface FakePaymentAdapter extends ProviderPaymentAdapter {
  externalCalls(): number;
}

function createFakePaymentAdapter(provider: PaymentProvider): FakePaymentAdapter {
  return {
    code: provider,
    initiate: (input) => Promise.resolve({
      kind: "redirect",
      provider,
      approveUrl: "https://fake-provider.example.test/approve/pref_payment_123",
      providerRef: "pref_payment_123",
      providerOrderId: "order_123",
      idempotencyKey: input.idempotencyKey,
      diagnostics: { providerStatus: "READY", requestId: "fake_req_123" },
    }),
    confirm: async (input) => fakeConfirm(provider, input),
    externalCalls: () => 0,
  };
}

function fakeConfirm(
  provider: PaymentProvider,
  input: ProviderConfirmContractInput,
): Promise<NormalizedProviderConfirmResult> {
  if (!input.providerPaymentKey) {
    return Promise.resolve({
      kind: "failed",
      provider,
      classification: "PROGRAMMER_ERROR",
      normalizedCode: "PROVIDER_PROGRAMMER_ERROR",
      safeMessage: "Final provider payment key is required for capture success.",
      ambiguousProviderState: false,
      providerLookupRequired: false,
      idempotencyKey: input.providerConfirmIdempotencyKey,
    });
  }
  return Promise.resolve({
    kind: "succeeded",
    provider,
    providerPaymentKey: input.providerPaymentKey,
    amountMinor: input.amount,
    currency: input.currency,
    idempotencyKey: input.providerConfirmIdempotencyKey,
    providerRef: input.providerRef,
    rawProviderStatus: "COMPLETED",
  });
}

class FakeWebhookVerifier implements ProviderWebhookVerifier {
  constructor(private readonly provider: PaymentProvider) {}

  extractCandidateMetadata(raw: ProviderWebhookRawRequest): ProviderWebhookMetadataResult {
    const metadata = candidateMetadata(raw);
    if (metadata.transmissionId && metadata.eventType) return { kind: "metadata", metadata };
    return {
      kind: "rejected",
      reason: "METADATA_INVALID",
      code: "FAKE.METADATA_MISSING",
      safeMessage: "Fake metadata is missing.",
      metadata,
    };
  }

  verify(raw: ProviderWebhookRawRequest): Promise<ProviderWebhookVerificationResult> {
    const inspected = this.extractCandidateMetadata(raw);
    if (inspected.kind === "rejected") return Promise.resolve(inspected);
    if (!isVerifiedMetadata(inspected.metadata)) {
      return Promise.resolve({
        kind: "rejected",
        reason: "METADATA_INVALID",
        code: "FAKE.METADATA_MISSING",
        safeMessage: "Fake metadata is missing.",
        metadata: inspected.metadata,
        httpStatus: 400,
      });
    }
    if (readHeader(raw, "x-fake-signature") === "bad") {
      return Promise.resolve({
        kind: "rejected",
        reason: "SIGNATURE_INVALID",
        code: "FAKE.SIGNATURE_INVALID",
        safeMessage: "Fake signature verification failed.",
        metadata: inspected.metadata,
        httpStatus: 400,
      });
    }
    return Promise.resolve({
      kind: "verified",
      input: {
        provider: this.provider,
        transmissionId: inspected.metadata.transmissionId,
        eventType: inspected.metadata.eventType,
        body: raw.body,
        headers: raw.headers,
        receivedAt: raw.receivedAt,
        context: verifiedContext(this.provider, PaymentMode.SANDBOX, "fake:mock:credential-binding", "MOCK"),
      },
    });
  }
}

type VerifiedFakeMetadata = ProviderWebhookCandidateMetadata & {
  transmissionId: string;
  eventType: string;
};

function isVerifiedMetadata(metadata: ProviderWebhookCandidateMetadata): metadata is VerifiedFakeMetadata {
  return Boolean(metadata.transmissionId && metadata.eventType);
}

class FakeWebhookParser implements ProviderWebhookParser {
  parse(input: ProviderVerifiedWebhookInput): Promise<NormalizedProviderWebhookEvent> {
    if (input.eventType === "payment.pending") {
      return Promise.resolve({
        kind: "ignored",
        provider: input.provider,
        transmissionId: input.transmissionId,
        eventType: input.eventType,
        reason: input.eventType,
      });
    }
    return Promise.resolve({
      kind: "capture",
      facts: {
        checkoutSessionId: "checkout_123",
        provider: input.provider,
        mode: input.context.mode,
        providerPaymentKey: "provider_payment_final_123",
        amount: 12_000,
        currency: "KRW",
        receivedAt: input.receivedAt ?? new Date("2026-08-01T00:00:00.000Z"),
      },
    });
  }
}

type FakeLookupPort = (
  raw: ProviderWebhookRawRequest,
  metadata: VerifiedFakeMetadata,
) => Promise<ProviderAuthoritativeState>;

class FakeQueryWebhookVerifier implements ProviderWebhookVerifier {
  constructor(
    private readonly provider: PaymentProvider,
    private readonly mode: PaymentMode,
    private readonly credentialBinding: string,
    private readonly lookup: FakeLookupPort,
  ) {}

  extractCandidateMetadata(raw: ProviderWebhookRawRequest): ProviderWebhookMetadataResult {
    const metadata = candidateMetadata(raw);
    if (metadata.transmissionId && metadata.eventType) return { kind: "metadata", metadata };
    return {
      kind: "rejected",
      reason: "METADATA_INVALID",
      code: "FAKE.METADATA_MISSING",
      safeMessage: "Fake metadata is missing.",
      metadata,
    };
  }

  async verify(raw: ProviderWebhookRawRequest): Promise<ProviderWebhookVerificationResult> {
    const inspected = this.extractCandidateMetadata(raw);
    if (inspected.kind === "rejected") return inspected;
    if (!isVerifiedMetadata(inspected.metadata)) {
      return {
        kind: "rejected",
        reason: "METADATA_INVALID",
        code: "FAKE.METADATA_MISSING",
        safeMessage: "Fake metadata is missing.",
        metadata: inspected.metadata,
        httpStatus: 400,
      };
    }
    const authoritativeState = await this.lookup(raw, inspected.metadata);
    return {
      kind: "verified",
      input: verifiedWebhookInput(raw, inspected.metadata, {
        provider: this.provider,
        mode: this.mode,
        credentialBinding: this.credentialBinding,
        verificationMethod: "QUERY_LOOKUP",
      }, authoritativeState),
    };
  }
}

class FakeQueryWebhookParser implements ProviderWebhookParser {
  parse(input: ProviderVerifiedWebhookInput): Promise<NormalizedProviderWebhookEvent> {
    const state = input.authoritativeState;
    if (!state) return Promise.reject(new Error("Query-verified fake webhook missing authoritative state."));
    const body = parseWebhookBody(input.body);
    return Promise.resolve({
      kind: "capture",
      facts: {
        checkoutSessionId: requiredBodyString(body, "checkoutSessionId"),
        provider: input.context.provider,
        mode: input.context.mode,
        providerPaymentKey: state.providerPaymentKey,
        amount: state.amountMinor,
        currency: state.currency,
        capturedAt: state.lookedUpAt,
        receivedAt: input.receivedAt ?? state.lookedUpAt,
      },
    });
  }
}

class FakeSignatureWebhookVerifier implements ProviderWebhookVerifier {
  constructor(
    private readonly provider: PaymentProvider,
    private readonly mode: PaymentMode,
    private readonly credentialBinding: string,
  ) {}

  extractCandidateMetadata(raw: ProviderWebhookRawRequest): ProviderWebhookMetadataResult {
    const metadata = candidateMetadata(raw);
    if (metadata.transmissionId && metadata.eventType) return { kind: "metadata", metadata };
    return {
      kind: "rejected",
      reason: "METADATA_INVALID",
      code: "FAKE.METADATA_MISSING",
      safeMessage: "Fake metadata is missing.",
      metadata,
    };
  }

  verify(raw: ProviderWebhookRawRequest): Promise<ProviderWebhookVerificationResult> {
    const inspected = this.extractCandidateMetadata(raw);
    if (inspected.kind === "rejected") return Promise.resolve(inspected);
    if (!isVerifiedMetadata(inspected.metadata)) {
      return Promise.resolve({
        kind: "rejected",
        reason: "METADATA_INVALID",
        code: "FAKE.METADATA_MISSING",
        safeMessage: "Fake metadata is missing.",
        metadata: inspected.metadata,
        httpStatus: 400,
      });
    }
    return Promise.resolve({
      kind: "verified",
      input: verifiedWebhookInput(raw, inspected.metadata, {
        provider: this.provider,
        mode: this.mode,
        credentialBinding: this.credentialBinding,
        verificationMethod: "SIGNATURE",
      }),
    });
  }
}

class FakeSignatureWebhookParser implements ProviderWebhookParser {
  parse(input: ProviderVerifiedWebhookInput): Promise<NormalizedProviderWebhookEvent> {
    const body = parseWebhookBody(input.body);
    return Promise.resolve({
      kind: "capture",
      facts: {
        checkoutSessionId: requiredBodyString(body, "checkoutSessionId"),
        provider: input.context.provider,
        mode: input.context.mode,
        providerPaymentKey: requiredBodyString(body, "providerPaymentKey"),
        amount: requiredBodyNumber(body, "amount"),
        currency: requiredBodyString(body, "currency"),
        receivedAt: input.receivedAt ?? new Date("2026-08-01T00:00:00.000Z"),
      },
    });
  }
}

class FakeVoidExecutor implements ProviderVoidExecutor {
  void(input: ProviderVoidInput): Promise<ProviderVoidResult> {
    if (input.reason === "success") return Promise.resolve({ kind: "succeeded" });
    if (input.reason === "idempotent") return Promise.resolve({ kind: "idempotent_succeeded", providerStatus: "ALREADY_CANCELED" });
    if (input.reason === "retryable") {
      return Promise.resolve({ kind: "retryable", normalizedCode: "PROVIDER_UNAVAILABLE", safeMessage: "Safe fake void retry." });
    }
    if (input.reason === "terminal") {
      return Promise.resolve({ kind: "terminal", normalizedCode: "PROVIDER_CANCELED", safeMessage: "Safe fake void terminal." });
    }
    if (input.reason === "manual") {
      return Promise.resolve({
        kind: "manual_review",
        normalizedCode: "PROVIDER_STATE_AMBIGUOUS",
        safeMessage: "Safe fake void manual review.",
        ambiguousProviderState: true,
      });
    }
    return Promise.resolve({ kind: "auth_stop", normalizedCode: "PROVIDER_AUTH_FAILED", safeMessage: "Safe fake auth stop." });
  }
}

class FakeAdapterFactory implements ProviderAdapterFactory {
  createPaymentAdapter(input: ProviderFactoryContext): ProviderPaymentAdapter {
    return createFakePaymentAdapter(input.provider);
  }

  createWebhookVerifier(input: ProviderFactoryContext): ProviderWebhookVerifier {
    return new FakeWebhookVerifier(input.provider);
  }

  createWebhookParser(_input: ProviderFactoryContext): ProviderWebhookParser {
    return new FakeWebhookParser();
  }

  createVoidExecutor(_input: ProviderFactoryContext): ProviderVoidExecutor {
    return new FakeVoidExecutor();
  }
}

function initiateInput(): PaymentInitiateInput {
  return {
    checkoutSessionId: "checkout_123",
    paymentId: "payment_123",
    provider: PaymentProvider.TOSS,
    amount: 12_000,
    currency: "KRW",
    idempotencyKey: "initiate:checkout_123:attempt_1",
  };
}

function confirmInput(overrides: Partial<ProviderConfirmContractInput> = {}): ProviderConfirmContractInput {
  return {
    checkoutSessionId: "checkout_123",
    paymentId: "payment_123",
    provider: PaymentProvider.TOSS,
    amount: 12_000,
    currency: "KRW",
    providerConfirmIdempotencyKey: "confirm:TOSS:payment_123",
    ...overrides,
  };
}

function webhookRaw(eventType: string, signature = "valid"): ProviderWebhookRawRequest {
  return {
    body: "fake-body",
    headers: {
      "x-fake-transmission-id": "tx_fake_123",
      "x-fake-event-type": eventType,
      "x-fake-signature": signature,
    },
    receivedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

function webhookRawWithBody(
  eventType: string,
  body: Record<string, unknown>,
  signature = "valid",
): ProviderWebhookRawRequest {
  return {
    body: JSON.stringify(body),
    headers: {
      "x-fake-transmission-id": `tx_fake_${eventType}`,
      "x-fake-event-type": eventType,
      "x-fake-signature": signature,
    },
    receivedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

function voidInput(reason: string): ProviderVoidInput {
  return {
    provider: PaymentProvider.TOSS,
    providerPaymentKey: "provider_payment_final_123",
    operationKey: "void:TOSS:provider_payment_final_123",
    reason,
  };
}

function authoritativeState(
  overrides: Partial<ProviderAuthoritativeState> = {},
): ProviderAuthoritativeState {
  return {
    lookedUpAt: new Date("2026-08-01T00:01:00.000Z"),
    providerPaymentKey: "lookup_payment_key_123",
    status: "DONE",
    amountMinor: 45_000,
    currency: "KRW",
    raw: { safe: "lookup result" },
    ...overrides,
  };
}

function recordingLookup(state: ProviderAuthoritativeState) {
  const calls: Array<{ raw: ProviderWebhookRawRequest; metadata: VerifiedFakeMetadata }> = [];
  return {
    calls,
    lookup: (raw: ProviderWebhookRawRequest, metadata: VerifiedFakeMetadata) => {
      calls.push({ raw, metadata });
      return Promise.resolve(state);
    },
  };
}

function factoryContext(overrides: Partial<ProviderFactoryContext> = {}): ProviderFactoryContext {
  return {
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    market: "KR",
    method: PaymentMethod.CARD,
    currency: "KRW",
    ruleId: "d1a.kr.card.krw",
    credentials: [{ name: TOSS_SANDBOX_SECRET_KEY, required: true, present: false }],
    liveGuard: { kind: "allowed", liveEnabled: true },
    ...overrides,
  };
}

function verifiedContext(
  provider: PaymentProvider,
  mode: PaymentMode,
  credentialBinding: string,
  verificationMethod: VerifiedProviderContext["verificationMethod"],
): VerifiedProviderContext {
  return { provider, mode, credentialBinding, verificationMethod };
}

function verifiedWebhookInput(
  raw: ProviderWebhookRawRequest,
  metadata: VerifiedFakeMetadata,
  context: VerifiedProviderContext,
  authoritativeState?: ProviderAuthoritativeState,
): ProviderVerifiedWebhookInput {
  const input: ProviderVerifiedWebhookInput = {
    provider: context.provider,
    transmissionId: metadata.transmissionId,
    eventType: metadata.eventType,
    body: raw.body,
    headers: raw.headers,
    receivedAt: raw.receivedAt,
    context,
  };
  if (authoritativeState) input.authoritativeState = authoritativeState;
  return input;
}

function candidateMetadata(raw: ProviderWebhookRawRequest): ProviderWebhookCandidateMetadata {
  return {
    transmissionId: readHeader(raw, "x-fake-transmission-id"),
    eventType: readHeader(raw, "x-fake-event-type"),
  };
}

function readHeader(raw: ProviderWebhookRawRequest, key: string): string | undefined {
  if (!raw.headers) return undefined;
  if (raw.headers instanceof Headers) return raw.headers.get(key) ?? undefined;
  return raw.headers[key] ?? raw.headers[key.toLowerCase()];
}

function parseWebhookBody(body: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  if (isRecord(parsed)) return parsed;
  throw new Error("Fake webhook body must be an object.");
}

function requiredBodyString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Fake webhook body missing ${key}.`);
}

function requiredBodyNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new Error(`Fake webhook body missing ${key}.`);
}

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = original;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
