import {
  PaymentEventSource,
  PaymentEventStatus,
  Prisma,
} from "@prisma/client";
import type { PaymentEvent, PaymentProvider } from "@prisma/client";
import type { WebhookMetadata } from "./verify";

type EventClient = Pick<Prisma.TransactionClient, "paymentEvent">;
type RecordedEvent = Pick<PaymentEvent, "id" | "status" | "transmissionId">;

export interface RecordWebhookEventInput extends WebhookMetadata {
  provider: PaymentProvider;
  rawBody: string;
  receivedAt: Date;
}

export interface MarkWebhookEventInput {
  eventId: string;
  status: PaymentEventStatus;
  processedAt: Date;
  checkoutSessionId?: string;
  providerPaymentKey?: string;
  lastError?: string;
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

export async function markEvent(
  client: EventClient,
  input: MarkWebhookEventInput,
): Promise<void> {
  await client.paymentEvent.update({
    where: { id: input.eventId },
    data: markData(input),
  });
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

function markData(input: MarkWebhookEventInput): Prisma.PaymentEventUpdateInput {
  return {
    status: input.status,
    processedAt: input.processedAt,
    checkoutSessionId: input.checkoutSessionId,
    providerPaymentKey: input.providerPaymentKey,
    lastError: input.lastError,
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
  return { id: true, status: true, transmissionId: true };
}

function isUniqueConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

