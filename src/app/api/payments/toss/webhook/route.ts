import { PaymentProvider } from "@prisma/client";
import { db } from "@/lib/db";
import { handleWebhook } from "@/lib/payment/webhook/handle";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handleWebhook(db, PaymentProvider.TOSS, {
    body: await request.text(),
    headers: request.headers,
  });
  return Response.json({ ok: result.status < 400, kind: result.kind }, { status: result.status });
}
