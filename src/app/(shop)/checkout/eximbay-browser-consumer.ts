"use client";

import type { InitiatePaymentActionResult } from "@/app/actions/payment";
import {
  createEximbayRequestPayController,
  type EximbayBrowserHandoffResult,
  type EximbayRequestPayController,
} from "@/lib/payment/eximbay/sdk-invocation";

export type CheckoutEximbayBrowserConsumer = Readonly<{
  invokeFromUserAction: () => Promise<EximbayBrowserHandoffResult>;
  dispose: () => void;
}>;

export type CheckoutEximbayBrowserConsumerCreateResult =
  | Readonly<{ ok: true; consumer: CheckoutEximbayBrowserConsumer }>
  | Readonly<{ ok: false; code: "FRESH_EXIMBAY_HANDOFF_REQUIRED" }>;

export function createCheckoutEximbayBrowserConsumer(
  execution: InitiatePaymentActionResult | null | undefined,
): CheckoutEximbayBrowserConsumerCreateResult {
  if (
    execution?.channel !== "FRESH_EXIMBAY_READY" ||
    execution.durable.kind !== "READY" ||
    execution.durable.success !== true ||
    execution.durable.provider !== "EXIMBAY"
  ) {
    return unavailable();
  }

  const created = createEximbayRequestPayController(execution.transientHandoff);
  if (!created.ok) return unavailable();
  if (execution.durable.paymentId !== execution.transientHandoff.paymentId) return unavailable();

  return Object.freeze({
    ok: true,
    consumer: createConsumer(created.controller),
  });
}

function createConsumer(controller: EximbayRequestPayController): CheckoutEximbayBrowserConsumer {
  return Object.freeze({
    invokeFromUserAction: () => controller.invoke(),
    dispose: () => controller.dispose(),
  });
}

function unavailable(): CheckoutEximbayBrowserConsumerCreateResult {
  return Object.freeze({ ok: false, code: "FRESH_EXIMBAY_HANDOFF_REQUIRED" });
}
