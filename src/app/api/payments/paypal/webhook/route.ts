import type { NextRequest } from "next/server";
import { handlePaymentWebhook } from "@/lib/payment/webhook-handler";
import { paypalWebhookStrategy } from "@/lib/payment/paypal-webhook-strategy";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return handlePaymentWebhook(request, paypalWebhookStrategy());
}
