import { db } from "@/lib/db";
import { persistTossCallbackProviderRef, type TossCallbackResult } from "@/lib/payment/providers/toss/callback";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const result = await persistTossCallbackProviderRef(db, {
    paymentKey: url.searchParams.get("paymentKey"),
    orderId: url.searchParams.get("orderId"),
    amount: url.searchParams.get("amount"),
  });
  return Response.json(toBody(result), { status: httpStatus(result) });
}

function toBody(result: TossCallbackResult) {
  return {
    ok: result.ok,
    status: result.status,
    paymentId: result.paymentId,
    confirm: "blocked_until_real_toss_adapter",
  };
}

function httpStatus(result: TossCallbackResult): number {
  if (result.ok && result.status === "ALREADY_COMPLETED") return 200;
  if (result.ok) return 202;
  if (result.status === "INVALID_REQUEST") return 400;
  if (result.status === "NOT_FOUND") return 404;
  if (result.status === "STOP") return 500;
  return 409;
}
