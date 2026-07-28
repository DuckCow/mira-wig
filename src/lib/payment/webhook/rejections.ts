import { createHash } from "crypto";
import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, Prisma } from "@prisma/client";
import type { CompleteWebhookBodyEvidence } from "./pipeline-types";

export const WEBHOOK_RAW_PREFIX_CHARS = 512;
export const WEBHOOK_MAX_CONTENT_LENGTH_BYTES = 64 * 1024;
export const WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND = 65_537;

type RejectionClient = Pick<Prisma.TransactionClient, "webhookIngressRejection">;

interface WebhookRejectionBase {
  provider: PaymentProvider;
  receivedAt: Date;
  stage: WebhookIngressRejectionStage;
  code: string;
  candidateTransmissionId?: string;
  candidateEventType?: string;
  lastError?: string;
}

export type WebhookRejectionInput = WebhookRejectionBase & (
  | {
    rawBody: string;
    completeBodyEvidence?: CompleteWebhookBodyEvidence;
    rawBodyBytes?: never;
    rawBodyPrefix?: never;
  }
  | {
    rawBody?: never;
    completeBodyEvidence?: never;
    rawBodyBytes: number;
    rawBodyPrefix?: string;
  }
);

export async function recordWebhookRejection(
  client: RejectionClient,
  input: WebhookRejectionInput,
): Promise<void> {
  const summary = rawSummary(input);
  await client.webhookIngressRejection.create({
    data: {
      provider: input.provider,
      stage: input.stage,
      code: postgresqlSafeText(input.code),
      candidateTransmissionId: postgresqlSafeOptionalText(input.candidateTransmissionId),
      candidateEventType: postgresqlSafeOptionalText(input.candidateEventType),
      rawBodyBytes: summary.bytes,
      rawBodyHash: summary.hash,
      rawBodyPrefix: summary.prefix,
      lastError: postgresqlSafeOptionalText(input.lastError),
      receivedAt: input.receivedAt,
    },
  });
}

export function utf8StringBodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function utf8StringBodyByteLength(body: string): number {
  return Buffer.byteLength(body, "utf8");
}

function rawSummary(input: WebhookRejectionInput) {
  if (input.rawBody === undefined) {
    return {
      bytes: input.rawBodyBytes,
      hash: null,
      prefix: boundedPostgresqlSafePrefix(input.rawBodyPrefix),
    };
  }
  if (input.completeBodyEvidence) {
    return {
      bytes: input.completeBodyEvidence.rawBodyBytes,
      hash: input.completeBodyEvidence.rawBodyHash,
      prefix: boundedPostgresqlSafePrefix(input.rawBody),
    };
  }
  return {
    bytes: utf8StringBodyByteLength(input.rawBody),
    hash: utf8StringBodyHash(input.rawBody),
    prefix: boundedPostgresqlSafePrefix(input.rawBody),
  };
}

function boundedPostgresqlSafePrefix(value: string | undefined): string | null {
  if (value === undefined) return null;
  return postgresqlSafeText(value.slice(0, WEBHOOK_RAW_PREFIX_CHARS));
}

function postgresqlSafeOptionalText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : postgresqlSafeText(value);
}

function postgresqlSafeText(value: string): string {
  return value.replaceAll("\u0000", "\uFFFD");
}
