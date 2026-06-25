import type { NextRequest } from "next/server";
import { handlePaymentWebhook } from "@/lib/payment/webhook-handler";
import { tossWebhookStrategy } from "@/lib/payment/toss-webhook-strategy";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return handlePaymentWebhook(request, tossWebhookStrategy());
}
