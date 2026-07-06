import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import {
  WEBHOOK_MAX_CONTENT_LENGTH_BYTES,
  rawBodyByteLength,
  recordWebhookRejection,
} from "./rejections";
import type { RawWebhookRequest } from "./verify";

export type ReadWebhookRequestResult =
  | { kind: "ok"; raw: RawWebhookRequest }
  | { kind: "rejected"; status: number };

export async function readWebhookRequest(
  client: PrismaClient,
  provider: PaymentProvider,
  request: Request,
): Promise<ReadWebhookRequestResult> {
  const receivedAt = new Date();
  const declaredLength = contentLength(request.headers);
  if (declaredLength !== null && declaredLength > WEBHOOK_MAX_CONTENT_LENGTH_BYTES) {
    await recordOversized(client, provider, request.headers, declaredLength, receivedAt);
    return { kind: "rejected", status: 413 };
  }

  const body = await request.text();
  if (rawBodyByteLength(body) > WEBHOOK_MAX_CONTENT_LENGTH_BYTES) {
    await recordWebhookRejection(client, {
      provider,
      receivedAt,
      stage: WebhookIngressRejectionStage.METADATA_EXTRACT,
      code: "BODY.TOO_LARGE",
      rawBody: body,
      candidateTransmissionId: request.headers.get("x-mira-transmission-id") ?? undefined,
      candidateEventType: request.headers.get("x-mira-event-type") ?? undefined,
      lastError: "Webhook body exceeded configured payment ingress limit",
    });
    return { kind: "rejected", status: 413 };
  }

  return { kind: "ok", raw: { body, headers: request.headers, receivedAt } };
}

async function recordOversized(
  client: PrismaClient,
  provider: PaymentProvider,
  headers: Headers,
  rawBodyBytes: number,
  receivedAt: Date,
): Promise<void> {
  await recordWebhookRejection(client, {
    provider,
    receivedAt,
    stage: WebhookIngressRejectionStage.METADATA_EXTRACT,
    code: "BODY.TOO_LARGE",
    rawBodyBytes,
    candidateTransmissionId: headers.get("x-mira-transmission-id") ?? undefined,
    candidateEventType: headers.get("x-mira-event-type") ?? undefined,
    lastError: "Webhook Content-Length exceeded configured payment ingress limit",
  });
}

function contentLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
