import "server-only";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  recoverPaymentFromWebhook,
  type RecoverPaymentFromWebhookInput,
} from "./webhook-recovery";

type WebhookHeaders = Headers | Record<string, string>;
type RawWebhookInput = { headers: WebhookHeaders; rawBody: string };

export type NormalizedWebhookEvent = {
  eventId: string;
  eventType: string;
  orderId: string;
  providerTransactionId: string;
  status: string;
  amount?: number;
  currency?: string;
  providerWebhookSecret?: string;
  occurredAt?: Date;
  raw: unknown;
};

export type WebhookParseResult =
  | { ok: true; event: NormalizedWebhookEvent }
  | { ok: false; status?: number; error: string };

export type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export type WebhookValidationInput = RawWebhookInput & {
  event: NormalizedWebhookEvent;
};

export interface WebhookValidationStrategy {
  readonly provider: string;
  parse(input: RawWebhookInput): Promise<WebhookParseResult>;
  authenticateDelivery(input: WebhookValidationInput): Promise<ValidationResult>;
  authorizeEvent(input: WebhookValidationInput): Promise<ValidationResult>;
  toRecoveryInput(event: NormalizedWebhookEvent): RecoverPaymentFromWebhookInput | null;
}

type WebhookRequest = {
  headers: Headers;
  text(): Promise<string>;
};

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

async function eventAlreadyReceived(transmissionId: string): Promise<boolean> {
  const existing = await db.paymentWebhookEvent.findUnique({
    where: { transmissionId },
    select: { id: true },
  });
  return existing !== null;
}

async function createReceivedEvent(
  event: NormalizedWebhookEvent,
  provider: string,
): Promise<"created" | "duplicate"> {
  try {
    await db.paymentWebhookEvent.create({
      data: {
        provider,
        transmissionId: event.eventId,
        eventType: event.eventType,
        orderId: event.orderId,
        providerTransactionId: event.providerTransactionId,
        status: event.status,
      },
    });
    return "created";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
}

async function markProcessed(transmissionId: string): Promise<void> {
  await db.paymentWebhookEvent.update({
    where: { transmissionId },
    data: { processedAt: new Date() },
  });
}

async function handleRecovery(
  event: NormalizedWebhookEvent,
  strategy: WebhookValidationStrategy,
): Promise<NextResponse> {
  const input = strategy.toRecoveryInput(event);
  if (!input || input.status !== "DONE") {
    await markProcessed(event.eventId);
    return json(200, { ok: true, ignored: true });
  }
  const result = await recoverPaymentFromWebhook(input);
  if (result.status === "failed") return json(500, { error: result.error });
  await markProcessed(event.eventId);
  return json(200, { ok: true, result: result.status });
}

export async function handlePaymentWebhook(
  request: WebhookRequest,
  strategy: WebhookValidationStrategy,
): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const parsed = await strategy.parse({ headers: request.headers, rawBody });
    if (!parsed.ok) return json(parsed.status ?? 400, { error: parsed.error });

    const input = { headers: request.headers, rawBody, event: parsed.event };
    const delivery = await strategy.authenticateDelivery(input);
    if (!delivery.ok) return json(delivery.status, { error: delivery.error });

    if (await eventAlreadyReceived(parsed.event.eventId)) return json(200, { ok: true, duplicate: true });
    if (await createReceivedEvent(parsed.event, strategy.provider) === "duplicate") {
      return json(200, { ok: true, duplicate: true });
    }

    const authorization = await strategy.authorizeEvent(input);
    if (!authorization.ok) return json(authorization.status, { error: authorization.error });

    return await handleRecovery(parsed.event, strategy);
  } catch (error) {
    console.error("PAYMENT_WEBHOOK_HANDLER_ERROR", { provider: strategy.provider, error });
    return json(500, { error: "internal_error" });
  }
}
