import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payment";
import { recoverPaymentFromWebhook } from "@/lib/payment/webhook-recovery";
import type { WebhookResult } from "@/lib/payment/types";

export const runtime = "nodejs";

type VerifiedWebhook = Extract<WebhookResult, { verified: true }>;
type IdentifiedWebhook = VerifiedWebhook & {
  eventId: string;
  orderId: string;
  providerTransactionId: string;
  status: string;
};
type RecoverableWebhook = IdentifiedWebhook & {
  amount: number;
  currency: string;
  providerWebhookSecret: string;
};

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

function hasEventId(event: VerifiedWebhook): event is VerifiedWebhook & { eventId: string } {
  return typeof event.eventId === "string" && event.eventId.length > 0;
}

function hasIdentity(event: VerifiedWebhook): event is IdentifiedWebhook {
  return hasEventId(event)
    && typeof event.orderId === "string"
    && typeof event.providerTransactionId === "string"
    && typeof event.status === "string";
}

function hasRecoveryFields(event: IdentifiedWebhook): event is RecoverableWebhook {
  return typeof event.amount === "number"
    && typeof event.currency === "string"
    && typeof event.providerWebhookSecret === "string";
}

async function eventAlreadyReceived(transmissionId: string): Promise<boolean> {
  const existing = await db.paymentWebhookEvent.findUnique({
    where: { transmissionId },
    select: { id: true },
  });
  return existing !== null;
}

async function createReceivedEvent(event: IdentifiedWebhook): Promise<"created" | "duplicate"> {
  try {
    await db.paymentWebhookEvent.create({
      data: {
        provider: "toss",
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

async function loadPaymentForVerification(event: IdentifiedWebhook) {
  return db.payment.findFirst({
    where: { orderId: event.orderId, providerTransactionId: event.providerTransactionId },
    orderBy: { createdAt: "desc" },
    select: { amount: true, currency: true, providerWebhookSecret: true },
  });
}

async function verifySecret(event: IdentifiedWebhook): Promise<NextResponse | null> {
  const payment = await loadPaymentForVerification(event);
  if (!payment) return json(401, { error: "payment_not_found" });
  if (!payment.providerWebhookSecret) {
    console.error("TOSS_WEBHOOK_SECRET_MISSING", {
      orderId: event.orderId,
      providerTransactionId: event.providerTransactionId,
    });
    return json(409, { error: "missing_stored_secret" });
  }
  if (event.providerWebhookSecret !== payment.providerWebhookSecret) return json(401, { error: "invalid_secret" });
  if (!hasRecoveryFields(event)) return json(400, { error: "missing_recovery_fields" });
  if (event.amount !== payment.amount || event.currency !== payment.currency) {
    return json(400, { error: "amount_or_currency_mismatch" });
  }
  return null;
}

async function handleVerifiedEvent(event: IdentifiedWebhook): Promise<NextResponse> {
  if (await eventAlreadyReceived(event.eventId)) return json(200, { ok: true, duplicate: true });
  if (await createReceivedEvent(event) === "duplicate") return json(200, { ok: true, duplicate: true });
  const verificationError = await verifySecret(event);
  if (verificationError) return verificationError;
  if (!hasRecoveryFields(event)) return json(400, { error: "missing_recovery_fields" });
  if (event.status !== "DONE") {
    await markProcessed(event.eventId);
    return json(200, { ok: true, ignored: true });
  }
  const result = await recoverPaymentFromWebhook({
    orderId: event.orderId,
    paymentKey: event.providerTransactionId,
    amount: event.amount,
    currency: event.currency,
    status: event.status,
    provider: "toss",
    providerWebhookSecret: event.providerWebhookSecret,
  });
  if (result.status === "failed") return json(500, { error: result.error });
  await markProcessed(event.eventId);
  return json(200, { ok: true, result: result.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const provider = getPaymentProvider("KR");
    if (!provider.handleWebhook) return json(500, { error: "toss_webhook_provider_unavailable" });
    const event = await provider.handleWebhook({ headers: request.headers, rawBody });
    if (!event.verified) return json(400, { error: event.reason });
    if (!hasIdentity(event)) return json(400, { error: "missing_webhook_identity" });
    return await handleVerifiedEvent(event);
  } catch (error) {
    console.error("TOSS_WEBHOOK_ROUTE_ERROR", { error });
    return json(500, { error: "internal_error" });
  }
}
