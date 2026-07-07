import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createMockPaymentProvider } from "../mock";
import { resolveProvider } from "../resolve";
import { PaymentMethod, PaymentMode } from "../routing";
import type {
  NormalizedProviderConfirmResult,
  NormalizedProviderWebhookEvent,
  ProviderAdapterFactory,
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
} from "../contract";
import type { PaymentInitiateInput } from "../types";

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
    expect(context.credentials).toEqual([{ name: "TOSS_SECRET_KEY", required: true, present: false }]);
    expect(context.credentials[0]).not.toHaveProperty("value");
    expect(context.liveGuard).toEqual({ kind: "blocked", liveEnabled: false, reason: "not allowlisted" });
  });

  it("keeps sandbox resolver behavior explicitly mock-backed", async () => {
    const resolved = resolveProvider(factoryContext({ provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX }));
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
        mode: PaymentMode.SANDBOX,
        providerPaymentKey: "provider_payment_final_123",
        amount: 12_000,
        currency: "KRW",
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

function voidInput(reason: string): ProviderVoidInput {
  return {
    provider: PaymentProvider.TOSS,
    providerPaymentKey: "provider_payment_final_123",
    operationKey: "void:TOSS:provider_payment_final_123",
    reason,
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
    credentials: [{ name: "TOSS_SECRET_KEY", required: true, present: false }],
    liveGuard: { kind: "allowed", liveEnabled: true },
    ...overrides,
  };
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
