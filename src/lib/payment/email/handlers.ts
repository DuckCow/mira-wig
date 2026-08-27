import type { OutboxHandler, OutboxRegistry } from "@/lib/payment/outbox";
import { TransactionalEmailDeliveryError } from "./delivery-error";
import type { TransactionalEmailPort, TransactionalEmailSendInput } from "./port";
import type { TransactionalEmailProjectionSource } from "./projection";
import { buildOrderPaidEmail, buildRefundSucceededEmail } from "./templates";
import {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  orderPaidEmailDedupKey,
  parseOrderPaidEmailPayload,
  parseRefundSucceededEmailPayload,
  refundSucceededEmailDedupKey,
} from "./topics";

export interface TransactionalEmailHandlerDependencies {
  source: TransactionalEmailProjectionSource;
  port: TransactionalEmailPort;
  publicOrigin: string;
}

export function createTransactionalEmailHandlers(
  dependencies: TransactionalEmailHandlerDependencies,
): OutboxRegistry {
  const origin = requirePublicOrigin(dependencies.publicOrigin);
  return Object.freeze({
    [CUSTOMER_ORDER_PAID_EMAIL_V1]: orderPaidHandler(dependencies, origin),
    [CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1]: refundSucceededHandler(dependencies, origin),
  });
}

function orderPaidHandler(
  dependencies: TransactionalEmailHandlerDependencies,
  origin: string,
): OutboxHandler {
  return async (payload, context) => {
    const parsed = parseOrderPaidEmailPayload(payload);
    if (!parsed) return terminal("ORDER_PAID_EMAIL_PAYLOAD_INVALID");
    const idempotencyKey = orderPaidEmailDedupKey(parsed.orderId);
    if (context.dedupKey !== idempotencyKey) return terminal("ORDER_PAID_EMAIL_DEDUP_INVALID");
    const projection = await dependencies.source.loadOrderPaid(parsed.orderId);
    if (!projection.ok) return terminal(projection.reason);
    const content = buildOrderPaidEmail(
      projection.value,
      orderDetailUrl(origin, projection.value.orderId),
    );
    return sendThroughPort(dependencies.port, {
      idempotencyKey,
      to: projection.value.to,
      subject: content.subject,
      text: content.text,
    });
  };
}

function refundSucceededHandler(
  dependencies: TransactionalEmailHandlerDependencies,
  origin: string,
): OutboxHandler {
  return async (payload, context) => {
    const parsed = parseRefundSucceededEmailPayload(payload);
    if (!parsed) return terminal("REFUND_SUCCEEDED_EMAIL_PAYLOAD_INVALID");
    const idempotencyKey = refundSucceededEmailDedupKey(parsed.refundAttemptId);
    if (context.dedupKey !== idempotencyKey) return terminal("REFUND_SUCCEEDED_EMAIL_DEDUP_INVALID");
    const projection = await dependencies.source.loadRefundSucceeded(parsed.refundAttemptId);
    if (!projection.ok) return terminal(projection.reason);
    const content = buildRefundSucceededEmail(
      projection.value,
      orderDetailUrl(origin, projection.value.orderId),
    );
    return sendThroughPort(dependencies.port, {
      idempotencyKey,
      to: projection.value.to,
      subject: content.subject,
      text: content.text,
    });
  };
}

async function sendThroughPort(
  port: TransactionalEmailPort,
  input: TransactionalEmailSendInput,
) {
  try {
    await port.send(input);
  } catch (error) {
    if (error instanceof TransactionalEmailDeliveryError
      && error.disposition === "PERMANENT") {
      return terminal(error.safeCode);
    }
    throw error;
  }
}

function requirePublicOrigin(value: string): string {
  if (value !== value.trim()) throw new Error("PUBLIC_MIRA_ORIGIN_INVALID");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PUBLIC_MIRA_ORIGIN_INVALID");
  }
  if (!isValidPublicOrigin(parsed, value)) throw new Error("PUBLIC_MIRA_ORIGIN_INVALID");
  return parsed.origin;
}

function isValidPublicOrigin(parsed: URL, value: string): boolean {
  return [
    parsed.protocol === "https:",
    parsed.username === "",
    parsed.password === "",
    parsed.pathname === "/",
    parsed.search === "",
    parsed.hash === "",
    value === parsed.origin || value === `${parsed.origin}/`,
  ].every(Boolean);
}

function orderDetailUrl(origin: string, orderId: string): string {
  return `${origin}/orders/${encodeURIComponent(orderId)}`;
}

function terminal(reason: string) {
  return Object.freeze({ outcome: "terminal_failed" as const, reason });
}
