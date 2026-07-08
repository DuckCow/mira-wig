import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import { completeFromCapture } from "@/lib/payment/complete";
import type { CaptureFacts, CompleteFromCaptureResult } from "@/lib/payment/complete";
import { configuredPaymentMode, PaymentModeConfigException } from "@/lib/payment/mode";
import type { ProviderVerifiedWebhookInput } from "@/lib/payment/providers/contract";
import { PaymentMode } from "@/lib/payment/providers/routing";
import {
  markCompleteFailed,
  markIgnored,
  markParseFailed,
  markProcessed,
  markRetryableCompleteFailed,
  recordEvent,
} from "./record";
import { recordWebhookRejection } from "./rejections";
import {
  resolveWebhookPipeline,
  verifiedProvenance,
} from "./pipeline";
import {
  WebhookParseError,
  type WebhookHandleOptions,
  type WebhookHandleResult,
  type WebhookProviderPipeline,
} from "./pipeline-types";
import type { RawWebhookRequest, WebhookMetadata } from "./verify";

export type { WebhookHandleOptions, WebhookHandleResult } from "./pipeline-types";

type VerifiedInboundResult =
  | { kind: "handled"; result: WebhookHandleResult }
  | { kind: "verified"; input: ProviderVerifiedWebhookInput; metadata: WebhookMetadata };

export async function handleWebhook(
  client: PrismaClient,
  provider: PaymentProvider,
  raw: RawWebhookRequest,
  options: WebhookHandleOptions = {},
): Promise<WebhookHandleResult> {
  const receivedAt = raw.receivedAt ?? new Date();
  const receivedRaw = { ...raw, receivedAt };
  const pipeline = resolveWebhookPipeline(client, provider, options);
  const verified = await verifyInbound(client, provider, pipeline, receivedRaw);
  if (verified.kind === "handled") return verified.result;
  return recordAndProcess(client, provider, pipeline, raw.body, verified, receivedAt);
}

async function verifyInbound(
  client: PrismaClient,
  provider: PaymentProvider,
  pipeline: WebhookProviderPipeline,
  receivedRaw: RawWebhookRequest & { receivedAt: Date },
): Promise<VerifiedInboundResult> {
  const inspected = pipeline.verifier.extractCandidateMetadata(receivedRaw);
  if (inspected.kind === "rejected") {
    await recordWebhookRejection(client, {
      provider,
      receivedAt: receivedRaw.receivedAt,
      stage: WebhookIngressRejectionStage.METADATA_EXTRACT,
      code: inspected.code,
      rawBody: receivedRaw.body,
      candidateTransmissionId: inspected.metadata.transmissionId,
      candidateEventType: inspected.metadata.eventType,
      lastError: inspected.safeMessage,
    });
    return { kind: "handled", result: { kind: "verifyFailed", status: 400 } };
  }

  const metadata = requiredMetadata(inspected.metadata);
  if (!metadata) {
    return { kind: "handled", result: await metadataFailure(client, provider, receivedRaw.body, inspected.metadata, receivedRaw.receivedAt) };
  }
  const verified = await pipeline.verifier.verify(receivedRaw);
  if (verified.kind === "rejected") {
    await recordWebhookRejection(client, {
      provider,
      receivedAt: receivedRaw.receivedAt,
      stage: WebhookIngressRejectionStage.VERIFY,
      code: verified.code,
      rawBody: receivedRaw.body,
      candidateTransmissionId: metadata.transmissionId,
      candidateEventType: metadata.eventType,
      lastError: verified.safeMessage,
    });
    return { kind: "handled", result: { kind: "verifyFailed", status: verified.httpStatus ?? 400 } };
  }
  return { kind: "verified", input: verified.input, metadata };
}

async function recordAndProcess(
  client: PrismaClient,
  provider: PaymentProvider,
  pipeline: WebhookProviderPipeline,
  rawBody: string,
  verified: { input: ProviderVerifiedWebhookInput; metadata: WebhookMetadata },
  receivedAt: Date,
): Promise<WebhookHandleResult> {
  const recorded = await recordEvent(client, {
    provider,
    ...verified.metadata,
    ...verifiedProvenance(pipeline, verified.input),
    rawBody,
    receivedAt,
  });
  if (recorded.kind === "duplicate") {
    const replay = await pipeline.resolveDuplicate({
      client,
      provider,
      event: recorded.event,
      incomingRawBody: rawBody,
      receivedAt,
    });
    if (replay.kind === "handled") return replay.result;
    return processRecorded(client, pipeline, replay.input, replay.eventId, receivedAt);
  }
  return processRecorded(client, pipeline, verified.input, recorded.event.id, receivedAt);
}

async function processRecorded(
  client: PrismaClient,
  pipeline: WebhookProviderPipeline,
  input: ProviderVerifiedWebhookInput,
  eventId: string,
  receivedAt: Date,
): Promise<WebhookHandleResult> {
  try {
    if (pipeline.kind === "verified") {
      const guarded = await guardConfiguredMode(client, eventId, receivedAt, input.context.mode);
      if (guarded) return guarded;
    }
    const parsed = await pipeline.parser.parse(input);
    if (parsed.kind === "ignored") return ignoreRecorded(client, eventId, receivedAt, parsed.reason);
    if (parsed.kind === "capture") return completeRecorded(client, eventId, receivedAt, parsed.facts);
    throw new WebhookParseError("PARSE.UNSUPPORTED_EVENT", "Webhook event kind is unsupported");
  } catch (e) {
    if (e instanceof PaymentModeConfigException) {
      return retryableCompleteFailure(
        client,
        eventId,
        receivedAt,
        "Payment processing is temporarily unavailable.",
        "COMPLETE.CONFIG_UNAVAILABLE",
      );
    }
    const failure = parseFailure(e);
    await markParseFailed(client, { eventId, failedAt: receivedAt, code: failure.code, message: failure.message });
    return { kind: "failed", status: 200, eventId };
  }
}

async function guardConfiguredMode(
  client: PrismaClient,
  eventId: string,
  receivedAt: Date,
  verifiedMode: PaymentMode,
): Promise<WebhookHandleResult | null> {
  try {
    if (configuredPaymentMode() === verifiedMode) return null;
    return retryableCompleteFailure(
      client,
      eventId,
      receivedAt,
      "Payment processing mode is temporarily unavailable.",
      "COMPLETE.MODE_DIVERGENCE",
    );
  } catch (error) {
    if (error instanceof PaymentModeConfigException) {
      return retryableCompleteFailure(
        client,
        eventId,
        receivedAt,
        "Payment processing is temporarily unavailable.",
        "COMPLETE.CONFIG_UNAVAILABLE",
      );
    }
    throw error;
  }
}

async function completeRecorded(
  client: PrismaClient,
  eventId: string,
  attemptedAt: Date,
  facts: CaptureFacts,
): Promise<WebhookHandleResult> {
  try {
    const result = await completeFromCapture(client, facts);
    if (result.kind === "retryableFailure") {
      return retryableCompleteFailure(client, eventId, attemptedAt, result.message, `COMPLETE.${result.code}`);
    }
    if (result.kind === "compensationSkipped") {
      return terminalCompleteFailure(client, eventId, attemptedAt, result.failure.message, `COMPLETE.${result.failure.code}`);
    }
    await markProcessedEvent(client, eventId, attemptedAt, facts, result);
    return { kind: "processed", status: 200, eventId };
  } catch (e) {
    return retryableCompleteFailure(client, eventId, attemptedAt, errorMessage(e), "COMPLETE.EXCEPTION");
  }
}

async function markProcessedEvent(
  client: PrismaClient,
  eventId: string,
  processedAt: Date,
  facts: CaptureFacts,
  _result: CompleteFromCaptureResult,
): Promise<void> {
  await markProcessed(client, {
    eventId,
    processedAt,
    checkoutSessionId: facts.checkoutSessionId,
    providerPaymentKey: facts.providerPaymentKey,
  });
}

async function ignoreRecorded(
  client: PrismaClient,
  eventId: string,
  processedAt: Date,
  reason: string,
): Promise<WebhookHandleResult> {
  await markIgnored(client, { eventId, processedAt, reason });
  return { kind: "ignored", status: 200, eventId };
}

async function terminalCompleteFailure(
  client: PrismaClient,
  eventId: string,
  failedAt: Date,
  message: string,
  code: string,
): Promise<WebhookHandleResult> {
  await markCompleteFailed(client, { eventId, failedAt, code, message });
  return { kind: "failed", status: 200, eventId };
}

async function retryableCompleteFailure(
  client: PrismaClient,
  eventId: string,
  attemptedAt: Date,
  message: string,
  code: string,
): Promise<WebhookHandleResult> {
  await markRetryableCompleteFailed(client, { eventId, attemptedAt, code, message });
  return { kind: "retryable", status: 500, eventId };
}

async function metadataFailure(
  client: PrismaClient,
  provider: PaymentProvider,
  rawBody: string,
  metadata: { transmissionId?: string; eventType?: string },
  receivedAt: Date,
): Promise<WebhookHandleResult> {
  await recordWebhookRejection(client, {
    provider,
    receivedAt,
    stage: WebhookIngressRejectionStage.METADATA_EXTRACT,
    code: "METADATA.MISSING_REQUIRED",
    rawBody,
    candidateTransmissionId: metadata.transmissionId,
    candidateEventType: metadata.eventType,
    lastError: "Webhook metadata result is missing required metadata.",
  });
  return { kind: "verifyFailed", status: 400 };
}

function requiredMetadata(metadata: { transmissionId?: string; eventType?: string }): WebhookMetadata | null {
  if (metadata.transmissionId && metadata.eventType) {
    return { transmissionId: metadata.transmissionId, eventType: metadata.eventType };
  }
  return null;
}

function parseFailure(e: unknown): { code: string; message: string } {
  if (e instanceof WebhookParseError) return { code: e.code, message: e.message };
  return { code: "PARSE.UNKNOWN", message: errorMessage(e) };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Webhook processing failed";
}
