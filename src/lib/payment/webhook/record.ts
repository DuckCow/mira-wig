import {
  PaymentEventFailureStage,
  PaymentEventSource,
  PaymentEventStatus,
  Prisma,
} from "@prisma/client";
import type { PaymentEvent, PaymentProvider } from "@prisma/client";
import type { WebhookMetadata } from "./verify";

type EventClient = Pick<Prisma.TransactionClient, "paymentEvent">;

export type RecordedEvent = Pick<
  PaymentEvent,
  | "id"
  | "status"
  | "transmissionId"
  | "eventType"
  | "raw"
  | "attemptCount"
  | "lastAttemptAt"
>;

export interface RecordWebhookEventInput extends WebhookMetadata {
  provider: PaymentProvider;
  rawBody: string;
  receivedAt: Date;
}

export type RecordWebhookEventResult =
  | { kind: "created"; event: RecordedEvent }
  | { kind: "duplicate"; event: RecordedEvent | null };

export async function recordEvent(
  client: EventClient,
  input: RecordWebhookEventInput,
): Promise<RecordWebhookEventResult> {
  try {
    const event = await client.paymentEvent.create({ data: eventCreateData(input), select: eventSelect() });
    return { kind: "created", event };
  } catch (e) {
    if (isUniqueConflict(e)) return { kind: "duplicate", event: await findExisting(client, input) };
    throw e;
  }
}

export async function markProcessed(
  client: EventClient,
  input: {
    eventId: string;
    processedAt: Date;
    checkoutSessionId: string;
    providerPaymentKey: string;
  },
): Promise<void> {
  await client.paymentEvent.update({
    where: { id: input.eventId },
    data: {
      status: PaymentEventStatus.PROCESSED,
      processedAt: input.processedAt,
      checkoutSessionId: input.checkoutSessionId,
      providerPaymentKey: input.providerPaymentKey,
      attemptCount: 0,
      lastAttemptAt: null,
      failureStage: null,
      failureCode: null,
      lastError: null,
    },
  });
}

export async function markIgnored(
  client: EventClient,
  input: { eventId: string; processedAt: Date; reason: string },
): Promise<void> {
  await client.paymentEvent.update({
    where: { id: input.eventId },
    data: {
      status: PaymentEventStatus.IGNORED,
      processedAt: input.processedAt,
      attemptCount: 0,
      lastAttemptAt: null,
      failureStage: null,
      failureCode: null,
      lastError: input.reason,
    },
  });
}

export async function markParseFailed(
  client: EventClient,
  input: { eventId: string; failedAt: Date; code: string; message: string },
): Promise<void> {
  await client.paymentEvent.update({
    where: { id: input.eventId },
    data: {
      status: PaymentEventStatus.FAILED,
      processedAt: input.failedAt,
      attemptCount: 0,
      lastAttemptAt: null,
      failureStage: PaymentEventFailureStage.PARSE,
      failureCode: input.code,
      lastError: input.message,
    },
  });
}

export async function markRetryableCompleteFailed(
  client: EventClient,
  input: { eventId: string; attemptedAt: Date; code: string; message: string },
): Promise<void> {
  await client.paymentEvent.update({
    where: { id: input.eventId },
    data: {
      status: PaymentEventStatus.RETRYABLE_FAILED,
      processedAt: null,
      attemptCount: { increment: 1 },
      lastAttemptAt: input.attemptedAt,
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: input.code,
      lastError: input.message,
    },
  });
}

export function isTerminalEventStatus(status: PaymentEventStatus): boolean {
  return status === PaymentEventStatus.PROCESSED
    || status === PaymentEventStatus.IGNORED
    || status === PaymentEventStatus.FAILED;
}

export function rawBodyFromEvent(event: Pick<RecordedEvent, "raw">): string | null {
  return typeof event.raw === "string" ? event.raw : null;
}

function eventCreateData(input: RecordWebhookEventInput): Prisma.PaymentEventCreateInput {
  return {
    provider: input.provider,
    source: PaymentEventSource.WEBHOOK,
    transmissionId: input.transmissionId,
    eventType: input.eventType,
    raw: input.rawBody,
    receivedAt: input.receivedAt,
  };
}

async function findExisting(
  client: EventClient,
  input: RecordWebhookEventInput,
): Promise<RecordedEvent | null> {
  return client.paymentEvent.findFirst({
    where: { provider: input.provider, transmissionId: input.transmissionId },
    select: eventSelect(),
  });
}

function eventSelect(): Prisma.PaymentEventSelect {
  return {
    id: true,
    status: true,
    transmissionId: true,
    eventType: true,
    raw: true,
    attemptCount: true,
    lastAttemptAt: true,
  };
}

function isUniqueConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
