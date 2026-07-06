import { PaymentProvider } from "@prisma/client";
import { db } from "@/lib/db";
import { handleWebhook } from "@/lib/payment/webhook/handle";
import { readWebhookRequest } from "@/lib/payment/webhook/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const inbound = await readWebhookRequest(db, PaymentProvider.TOSS, request);
  if (inbound.kind === "rejected") {
    return Response.json({ ok: false, kind: "verifyFailed" }, { status: inbound.status });
  }
  const result = await handleWebhook(db, PaymentProvider.TOSS, inbound.raw);
  return Response.json({ ok: result.status < 400, kind: result.kind }, { status: result.status });
}
