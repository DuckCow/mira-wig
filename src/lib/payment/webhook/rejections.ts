import { createHash } from "crypto";
import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, Prisma } from "@prisma/client";

export const WEBHOOK_RAW_PREFIX_CHARS = 512;
export const WEBHOOK_MAX_CONTENT_LENGTH_BYTES = 64 * 1024;

type RejectionClient = Pick<Prisma.TransactionClient, "webhookIngressRejection">;

export interface WebhookRejectionInput {
  provider: PaymentProvider;
  receivedAt: Date;
  stage: WebhookIngressRejectionStage;
  code: string;
  rawBody?: string;
  rawBodyBytes?: number;
  candidateTransmissionId?: string;
  candidateEventType?: string;
  lastError?: string;
}

export async function recordWebhookRejection(
  client: RejectionClient,
  input: WebhookRejectionInput,
): Promise<void> {
  const summary = rawSummary(input);
  await client.webhookIngressRejection.create({
    data: {
      provider: input.provider,
      stage: input.stage,
      code: input.code,
      candidateTransmissionId: input.candidateTransmissionId,
      candidateEventType: input.candidateEventType,
      rawBodyBytes: summary.bytes,
      rawBodyHash: summary.hash,
      rawBodyPrefix: summary.prefix,
      lastError: input.lastError,
      receivedAt: input.receivedAt,
    },
  });
}

export function rawBodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function rawBodyByteLength(body: string): number {
  return Buffer.byteLength(body, "utf8");
}

function rawSummary(input: WebhookRejectionInput) {
  if (input.rawBody === undefined) {
    return {
      bytes: input.rawBodyBytes ?? 0,
      hash: null,
      prefix: null,
    };
  }
  return {
    bytes: rawBodyByteLength(input.rawBody),
    hash: rawBodyHash(input.rawBody),
    prefix: input.rawBody.slice(0, WEBHOOK_RAW_PREFIX_CHARS),
  };
}
