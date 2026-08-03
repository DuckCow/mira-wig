import { PaymentProvider as ProviderCode, WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import { ProviderCapability } from "@/lib/payment/providers/capabilities";
import type {
  ProviderVerifiedWebhookInput,
  ProviderWebhookMetadataResult,
  ProviderWebhookVerificationResult,
  ProviderWebhookVerifier,
  VerifiedProviderContext,
} from "@/lib/payment/providers/contract";
import { credentialChecksForProvider, TOSS_SANDBOX_SECRET_KEY, type ProviderEnv } from "@/lib/payment/providers/credentials";
import { ProviderResolveException, sandboxExternalCodeKeyEnabled, sandboxExternalDeploymentKeyEnabled, type SandboxExternalCodeRegistryEntry } from "@/lib/payment/providers/factory";
import { PaymentMode } from "@/lib/payment/providers/routing";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import { createTossPaymentCorrelationPort, type TossPaymentCorrelationClient } from "@/lib/payment/providers/toss/correlation";
import { createTossLookupHttpPort } from "@/lib/payment/providers/toss/lookup-http";
import { createTossQueryWebhookVerifier, createTossWebhookParser, type TossPaymentLookupPort } from "@/lib/payment/providers/toss/webhook";
import { isTerminalEventStatus, markCompleteFailed, markRetryableCompleteFailed, rawBodyFromEvent, type RecordedEvent } from "./record";
import { recordWebhookRejection, utf8StringBodyHash } from "./rejections";
import type { RawWebhookRequest, WebhookMetadata } from "./verify";
import { inspectWebhookMetadata } from "./verify";
import type {
  CompleteWebhookBodyEvidence,
  DuplicateReplayDecision,
  DuplicateReplayInput,
  WebhookHandleOptions,
  WebhookHandleResult,
  WebhookProviderPipeline,
} from "./pipeline-types";
const TOSS_SANDBOX_CREDENTIAL_BINDING = "toss:sandbox:v1";
const TOSS_WEBHOOK_VERIFICATION_METHOD = "QUERY_LOOKUP";
const TOSS_PUBLIC_WEBHOOK_CODE_REGISTRY: readonly SandboxExternalCodeRegistryEntry[] = [{
  provider: ProviderCode.TOSS,
  mode: PaymentMode.SANDBOX,
  capability: ProviderCapability.WEBHOOK_VERIFIER,
}];

export function resolveWebhookPipeline(
  client: PrismaClient,
  provider: PaymentProvider,
  options: WebhookHandleOptions,
): WebhookProviderPipeline {
  if (provider === ProviderCode.TOSS) return resolveTossWebhookPipeline(client, options);
  if (provider === ProviderCode.PAYPAL) {
    return createUnavailablePipeline(
      "PAYPAL.PUBLIC_WEBHOOK_VERIFIER_UNAVAILABLE",
      "PayPal public webhook verification is unavailable.",
    );
  }
  if (provider === ProviderCode.EXIMBAY) {
    return createUnavailablePipeline(
      "EXIMBAY.PUBLIC_WEBHOOK_UNAVAILABLE",
      "Eximbay public webhook ingress is unavailable.",
    );
  }
  return createUnavailablePipeline(
    "PROVIDER.PUBLIC_WEBHOOK_UNSUPPORTED",
    "Public webhook provider is unsupported.",
  );
}

export function verifiedProvenance(
  pipeline: WebhookProviderPipeline,
  input: ProviderVerifiedWebhookInput,
): { verifiedMode: PaymentMode | null; verifiedCredentialBinding: string | null } {
  if (pipeline.kind !== "verified") return { verifiedMode: null, verifiedCredentialBinding: null };
  return { verifiedMode: input.context.mode, verifiedCredentialBinding: input.context.credentialBinding };
}
function resolveTossWebhookPipeline(client: PrismaClient, options: WebhookHandleOptions): WebhookProviderPipeline {
  const env = options.env ?? process.env;
  const context = tossSandboxContext();
  const modeFailure = tossModeFailure(env);
  if (modeFailure) return createRejectedTossPipeline(context, modeFailure.code, modeFailure.message, 503);
  const gate = resolveSandboxWebhookGate(env, options);
  if (gate.kind === "rejected") return createRejectedTossPipeline(context, gate.code, gate.message, 503);
  const secretKey = env[TOSS_SANDBOX_SECRET_KEY]?.trim();
  if (!secretKey) return createRejectedTossPipeline(context, "SANDBOX_EXTERNAL_CREDENTIALS_MISSING", "Sandbox external webhook credentials are missing.", 503);
  try {
    return createVerifiedTossPipeline(client, context, secretKey, options);
  } catch {
    return createRejectedTossPipeline(
      context,
      "TOSS.WEBHOOK_VERIFIER_CONSTRUCTION_FAILED",
      "Toss public webhook verification is unavailable.",
      503,
    );
  }
}

function tossModeFailure(env: ProviderEnv): { code: string; message: string } | null {
  const rawMode = env.PAYMENT_MODE;
  const mode = rawMode?.trim() ?? "";
  if (mode.length === 0) {
    return {
      code: "PAYMENT_MODE.REQUIRED",
      message: "Payment mode must be explicitly configured for public webhooks.",
    };
  }
  if (mode === PaymentMode.SANDBOX) return null;
  if (mode === PaymentMode.LIVE) {
    return {
      code: "TOSS.LIVE_WEBHOOK_VERIFIER_UNAVAILABLE",
      message: "Toss live public webhook verification is unavailable.",
    };
  }
  return {
    code: "PAYMENT_MODE.INVALID",
    message: "Payment mode configuration is invalid.",
  };
}

function createVerifiedTossPipeline(client: PrismaClient, context: VerifiedProviderContext, secretKey: string, options: WebhookHandleOptions): WebhookProviderPipeline {
  const correlationClient: TossPaymentCorrelationClient = client;
  const verifier = createTossQueryWebhookVerifier({
    context,
    lookup: createTossLookupHttpPort({
      fetchFn: options.fetchFn ?? fetch,
      authorization: tossBasicAuthorization(secretKey),
      baseUrl: options.tossLookupBaseUrl,
      timeoutMs: options.tossLookupTimeoutMs,
      now: options.now,
    }),
  });
  return {
    kind: "verified",
    verifier,
    parser: createTossWebhookParser({ correlation: createTossPaymentCorrelationPort(correlationClient) }),
    resolveDuplicate: (input) => resolveVerifiedDuplicateReplay(context, verifier, input),
  };
}
function createRejectedTossPipeline(
  context: VerifiedProviderContext,
  code: string,
  safeMessage: string,
  httpStatus: number,
): WebhookProviderPipeline {
  const metadataVerifier = createTossQueryWebhookVerifier({ context, lookup: unavailableLookup });
  return {
    kind: "verified",
    verifier: {
      extractCandidateMetadata: (raw) => metadataVerifier.extractCandidateMetadata(raw),
      verify: (raw) => Promise.resolve(rejectedVerification(metadataVerifier, raw, code, safeMessage, httpStatus)),
    },
    parser: { parse: () => Promise.reject(new Error("Rejected Toss webhook pipeline cannot parse.")) },
    resolveDuplicate: () => Promise.resolve({ kind: "handled", result: { kind: "retryable", status: httpStatus } }),
  };
}

async function resolveVerifiedDuplicateReplay(
  context: VerifiedProviderContext,
  verifier: ProviderWebhookVerifier,
  input: DuplicateReplayInput,
): Promise<DuplicateReplayDecision> {
  const stored = await storedReplayInput(context.provider, input);
  if (stored.kind === "handled") return stored;
  const {
    client,
    event,
    incomingBodyEvidence,
    metadata,
    receivedAt,
    storedRawBody,
  } = stored;
  const bindingFailure = await guardStoredVerifiedBinding(client, event, context, receivedAt);
  if (bindingFailure) return { kind: "handled", result: bindingFailure };
  const verified = await verifier.verify(storedTossRaw(storedRawBody, metadata, receivedAt));
  if (verified.kind === "rejected") {
    return verifyRejectedReplay(
      client,
      context.provider,
      storedRawBody,
      incomingBodyEvidence,
      metadata,
      verified,
      receivedAt,
      event.id,
    );
  }
  if (event.verifiedMode !== verified.input.context.mode) {
    await modeCollisionRejection(
      client,
      context.provider,
      storedRawBody,
      incomingBodyEvidence,
      metadata,
      receivedAt,
    );
    return { kind: "handled", result: { kind: "verifyFailed", status: 409, eventId: event.id } };
  }
  return { kind: "reprocess", input: verified.input, eventId: event.id };
}

async function storedReplayInput(
  provider: PaymentProvider,
  input: DuplicateReplayInput,
): Promise<
  { kind: "handled"; result: WebhookHandleResult } | {
    kind: "ready";
    client: PrismaClient;
    event: RecordedEvent;
    incomingBodyEvidence: CompleteWebhookBodyEvidence | undefined;
    metadata: WebhookMetadata;
    receivedAt: Date;
    storedRawBody: string;
  }
> {
  const {
    client,
    event,
    incomingBodyEvidence,
    incomingRawBody,
    receivedAt,
  } = input;
  if (!event) return { kind: "handled", result: { kind: "retryable", status: 500 } };
  if (isTerminalEventStatus(event.status)) return { kind: "handled", result: duplicateResult(event.id) };
  const storedRawBody = rawBodyFromEvent(event);
  const metadata = metadataFromEvent(event);
  if (!storedRawBody || !metadata) return { kind: "handled", result: { kind: "retryable", status: 500, eventId: event.id } };
  if (utf8StringBodyHash(storedRawBody) !== utf8StringBodyHash(incomingRawBody)) {
    await rawMismatchRejection(
      client,
      provider,
      incomingRawBody,
      incomingBodyEvidence,
      metadata,
      receivedAt,
    );
    return { kind: "handled", result: { kind: "retryable", status: 400, eventId: event.id } };
  }
  return {
    kind: "ready",
    client,
    event,
    incomingBodyEvidence,
    metadata,
    receivedAt,
    storedRawBody,
  };
}

function checkedSandboxDeploymentKey(
  gate: SandboxGate,
  env: ProviderEnv,
): { kind: "ok"; enabled: boolean } | { kind: "rejected"; code: string; message: string } {
  try {
    return { kind: "ok", enabled: sandboxExternalDeploymentKeyEnabled(gate, env) };
  } catch (error) {
    if (error instanceof ProviderResolveException) {
      return { kind: "rejected", code: error.code, message: "Sandbox external webhook opt-in config is invalid." };
    }
    throw error;
  }
}

function resolveSandboxWebhookGate(
  env: ProviderEnv,
  options: WebhookHandleOptions,
): { kind: "enabled" } | { kind: "rejected"; code: string; message: string } {
  const gate = { provider: ProviderCode.TOSS, mode: PaymentMode.SANDBOX, capability: ProviderCapability.WEBHOOK_VERIFIER };
  const codeKeyEnabled = sandboxExternalCodeKeyEnabled(gate, sandboxWebhookRegistry(options));
  const deploymentKey = checkedSandboxDeploymentKey(gate, env);
  if (deploymentKey.kind === "rejected") return deploymentKey;
  if (!codeKeyEnabled && !deploymentKey.enabled) {
    return {
      kind: "rejected",
      code: "PUBLIC_WEBHOOK_VERIFIER_UNAVAILABLE",
      message: "Authenticated public webhook verification is unavailable.",
    };
  }
  if (codeKeyEnabled !== deploymentKey.enabled) {
    return { kind: "rejected", code: "SANDBOX_EXTERNAL_MISCONFIGURED", message: "Sandbox external webhook opt-in is incomplete." };
  }
  if (sandboxCredentialsPresent(gate, env)) return { kind: "enabled" };
  return { kind: "rejected", code: "SANDBOX_EXTERNAL_CREDENTIALS_MISSING", message: "Sandbox external webhook credentials are missing." };
}

function sandboxWebhookRegistry(
  options: WebhookHandleOptions,
): readonly SandboxExternalCodeRegistryEntry[] {
  return options.sandboxExternalCodeRegistry ?? TOSS_PUBLIC_WEBHOOK_CODE_REGISTRY;
}

function sandboxCredentialsPresent(gate: SandboxGate, env: ProviderEnv): boolean {
  const checks = credentialChecksForProvider(gate, env);
  return checks.length > 0 && checks.every((credential) => !credential.required || credential.present);
}

function tossSandboxContext(): VerifiedProviderContext {
  return {
    provider: ProviderCode.TOSS,
    mode: PaymentMode.SANDBOX,
    credentialBinding: TOSS_SANDBOX_CREDENTIAL_BINDING,
    verificationMethod: TOSS_WEBHOOK_VERIFICATION_METHOD,
  };
}

const unavailableLookup: TossPaymentLookupPort = () => Promise.resolve({ kind: "network_error" });

function createUnavailablePipeline(
  code: string,
  safeMessage: string,
): WebhookProviderPipeline {
  const verifier: ProviderWebhookVerifier = {
    extractCandidateMetadata: unavailableCandidateMetadata,
    verify: (raw) => Promise.resolve(unavailableVerification(raw, code, safeMessage)),
  };
  return {
    kind: "unavailable",
    verifier,
    parser: { parse: () => Promise.reject(new Error("Unavailable public webhook pipeline cannot parse.")) },
    resolveDuplicate: () => Promise.resolve({
      kind: "handled",
      result: { kind: "verifyFailed", status: 503 },
    }),
  };
}

function unavailableCandidateMetadata(raw: RawWebhookRequest): ProviderWebhookMetadataResult {
  const inspected = inspectWebhookMetadata(raw);
  if (inspected.kind === "ok") return { kind: "metadata", metadata: inspected.metadata };
  return {
    kind: "rejected",
    reason: "METADATA_INVALID",
    code: inspected.code,
    safeMessage: inspected.message,
    metadata: {
      transmissionId: inspected.candidateTransmissionId,
      eventType: inspected.candidateEventType,
    },
  };
}

function unavailableVerification(
  raw: RawWebhookRequest,
  code: string,
  safeMessage: string,
): ProviderWebhookVerificationResult {
  const inspected = unavailableCandidateMetadata(raw);
  if (inspected.kind === "rejected") {
    return {
      kind: "rejected",
      reason: inspected.reason,
      code: inspected.code,
      safeMessage: inspected.safeMessage,
      metadata: inspected.metadata,
      httpStatus: 400,
    };
  }
  return {
    kind: "rejected",
    reason: "AUTHENTICATION_FAILED",
    code,
    safeMessage,
    metadata: inspected.metadata,
    httpStatus: 503,
  };
}

function rejectedVerification(
  verifier: ProviderWebhookVerifier,
  raw: RawWebhookRequest,
  code: string,
  safeMessage: string,
  httpStatus: number,
): ProviderWebhookVerificationResult {
  const inspected = verifier.extractCandidateMetadata(raw);
  return { kind: "rejected", reason: "LOOKUP_UNAVAILABLE", code, safeMessage, metadata: inspected.metadata, httpStatus };
}

async function guardStoredVerifiedBinding(
  client: PrismaClient,
  event: RecordedEvent,
  context: VerifiedProviderContext,
  receivedAt: Date,
): Promise<WebhookHandleResult | null> {
  if (event.verifiedMode === null) {
    await markCompleteFailed(client, {
      eventId: event.id,
      failedAt: receivedAt,
      code: "COMPLETE.LEGACY_UNVERIFIED_EVENT",
      message: "Legacy unverified webhook event requires manual review.",
    });
    return { kind: "failed", status: 200, eventId: event.id };
  }
  if (event.verifiedCredentialBinding === context.credentialBinding) return null;
  await markRetryableCompleteFailed(client, {
    eventId: event.id,
    attemptedAt: receivedAt,
    code: "COMPLETE.CREDENTIAL_BINDING_UNAVAILABLE",
    message: "Webhook credential binding is unavailable for replay.",
  });
  return { kind: "retryable", status: 500, eventId: event.id };
}

async function verifyRejectedReplay(
  client: PrismaClient,
  provider: PaymentProvider,
  rawBody: string,
  completeBodyEvidence: CompleteWebhookBodyEvidence | undefined,
  metadata: WebhookMetadata,
  verified: Extract<ProviderWebhookVerificationResult, { kind: "rejected" }>,
  receivedAt: Date,
  eventId: string,
): Promise<DuplicateReplayDecision> {
  await recordWebhookRejection(client, {
    provider,
    receivedAt,
    stage: WebhookIngressRejectionStage.VERIFY,
    code: verified.code,
    rawBody,
    completeBodyEvidence,
    candidateTransmissionId: metadata.transmissionId,
    candidateEventType: metadata.eventType,
    lastError: verified.safeMessage,
  });
  return { kind: "handled", result: { kind: "verifyFailed", status: verified.httpStatus ?? 400, eventId } };
}

function duplicateResult(eventId: string): WebhookHandleResult {
  return { kind: "duplicate", status: 200, eventId };
}

function metadataFromEvent(event: RecordedEvent): WebhookMetadata | null {
  if (!event.transmissionId) return null;
  return { transmissionId: event.transmissionId, eventType: event.eventType };
}

function storedTossRaw(body: string, metadata: WebhookMetadata, receivedAt: Date): RawWebhookRequest {
  return { body, headers: { "tosspayments-webhook-transmission-id": metadata.transmissionId }, receivedAt };
}

function rawMismatchRejection(
  client: PrismaClient,
  provider: PaymentProvider,
  rawBody: string,
  completeBodyEvidence: CompleteWebhookBodyEvidence | undefined,
  metadata: WebhookMetadata,
  receivedAt: Date,
): Promise<void> {
  return recordWebhookRejection(client, {
    provider,
    receivedAt,
    stage: WebhookIngressRejectionStage.VERIFY,
    code: "VERIFY.RAW_MISMATCH",
    rawBody,
    completeBodyEvidence,
    candidateTransmissionId: metadata.transmissionId,
    candidateEventType: metadata.eventType,
    lastError: "Duplicate webhook raw body did not match stored authenticated event",
  });
}

function modeCollisionRejection(
  client: PrismaClient,
  provider: PaymentProvider,
  rawBody: string,
  completeBodyEvidence: CompleteWebhookBodyEvidence | undefined,
  metadata: WebhookMetadata,
  receivedAt: Date,
): Promise<void> {
  return recordWebhookRejection(client, {
    provider,
    receivedAt,
    stage: WebhookIngressRejectionStage.VERIFY,
    code: "VERIFY.MODE_COLLISION",
    rawBody,
    completeBodyEvidence,
    candidateTransmissionId: metadata.transmissionId,
    candidateEventType: metadata.eventType,
    lastError: "Duplicate webhook verified mode conflicts with persisted event provenance.",
  });
}

type SandboxGate = {
  provider: typeof ProviderCode.TOSS;
  mode: typeof PaymentMode.SANDBOX;
  capability: typeof ProviderCapability.WEBHOOK_VERIFIER;
};
