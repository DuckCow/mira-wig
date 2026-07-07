const TOSS_ORDER_ID_PREFIX = "mira_toss_";
const TOSS_ORDER_ID_MIN_LENGTH = 6;
const TOSS_ORDER_ID_MAX_LENGTH = 64;
const TOSS_ORDER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export type TossOrderIdParseResult =
  | { ok: true; paymentId: string }
  | { ok: false; reason: TossOrderIdParseFailure };

export type TossOrderIdParseFailure =
  | "INVALID_PREFIX"
  | "EMPTY_PAYMENT_ID"
  | "INVALID_CHARACTERS"
  | "INVALID_LENGTH";

export function deriveTossOrderId(paymentId: string): string {
  const normalized = paymentId.trim();
  const validation = validatePaymentId(normalized);
  if (validation) throw new Error(`Invalid Toss orderId payment id: ${validation}`);
  return `${TOSS_ORDER_ID_PREFIX}${normalized}`;
}

export function parseTossOrderId(orderId: string): TossOrderIdParseResult {
  if (!orderId.startsWith(TOSS_ORDER_ID_PREFIX)) return { ok: false, reason: "INVALID_PREFIX" };
  const paymentId = orderId.slice(TOSS_ORDER_ID_PREFIX.length);
  const validation = validatePaymentId(paymentId);
  if (validation) return { ok: false, reason: validation };
  return { ok: true, paymentId };
}

function validatePaymentId(paymentId: string): TossOrderIdParseFailure | null {
  if (paymentId.length === 0) return "EMPTY_PAYMENT_ID";
  const orderId = `${TOSS_ORDER_ID_PREFIX}${paymentId}`;
  if (orderId.length < TOSS_ORDER_ID_MIN_LENGTH || orderId.length > TOSS_ORDER_ID_MAX_LENGTH) {
    return "INVALID_LENGTH";
  }
  if (!TOSS_ORDER_ID_PATTERN.test(orderId)) return "INVALID_CHARACTERS";
  return null;
}
