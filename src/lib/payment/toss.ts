// ============================================================
// lib/payment/toss.ts — TossPaymentProvider
// 토스페이먼츠 구현체 (UI 단계에서 완성 예정)
// ------------------------------------------------------------
// 토스 결제 흐름:
//   1) 클라이언트가 Toss SDK로 결제창 호출 → paymentKey 수신
//   2) 서버 confirm() 호출 → Toss API POST /payments/confirm
//   3) 위변조 방지: amount를 DB 주문 금액과 대조 검증 후 호출
// ⚠️ 금액 검증은 이 클래스 밖(processPayment)에서 수행한다.
// ============================================================

import type {
  ConfirmInput,
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  PaymentResult,
  RefundInput,
  RefundResult,
  WebhookResult,
} from "./types";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function getNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function headerValue(headers: Headers | Record<string, string>, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const lowerName = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];
}

function latestCancel(data: Record<string, unknown>): Record<string, unknown> | null {
  const cancels = data.cancels;
  if (!Array.isArray(cancels)) return null;
  for (let i = cancels.length - 1; i >= 0; i -= 1) {
    const cancel: unknown = cancels[i];
    if (isRecord(cancel)) return cancel;
  }
  return null;
}

function refundStatus(cancel: Record<string, unknown> | null): RefundResult["status"] {
  const status = getString(cancel?.cancelStatus);
  if (status && status !== "DONE") return "PENDING";
  return "SUCCEEDED";
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await res.json();
  if (!isRecord(raw)) throw new Error(`Toss API 응답이 객체가 아닙니다 (HTTP ${res.status})`);
  return raw;
}

function refundBody(input: RefundInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    cancelReason: input.reason,
    currency: input.currency,
  };
  if (input.amount !== undefined) body.cancelAmount = input.amount;
  return body;
}

function failedRefund(input: RefundInput, data: Record<string, unknown>, status: number): RefundResult {
  return {
    providerTransactionId: input.providerTransactionId,
    status: "FAILED",
    amount: input.amount,
    currency: input.currency,
    raw: data,
    errorMessage: getString(data.message) ?? `결제 취소 실패 (HTTP ${status})`,
  };
}

function successfulRefund(input: RefundInput, data: Record<string, unknown>): RefundResult {
  const cancel = latestCancel(data);
  return {
    providerTransactionId: getString(data.paymentKey) ?? input.providerTransactionId,
    providerRefundId: getString(cancel?.transactionKey),
    status: refundStatus(cancel),
    amount: getNumber(cancel?.cancelAmount) ?? input.amount,
    currency: getString(data.currency) ?? input.currency,
    refundableAmount: getNumber(cancel?.refundableAmount) ?? getNumber(data.balanceAmount),
    raw: data,
  };
}

function parseWebhookBody(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function paymentStatusChangedResult(
  payload: Record<string, unknown>,
  data: Record<string, unknown>,
  transmissionId: string | undefined,
): Extract<WebhookResult, { verified: true }> {
  return {
    verified: true,
    eventId: transmissionId,
    eventType: "PAYMENT_STATUS_CHANGED",
    orderId: getString(data.orderId),
    providerTransactionId: getString(data.paymentKey),
    status: getString(data.status),
    amount: getNumber(data.totalAmount),
    currency: getString(data.currency),
    providerWebhookSecret: getString(data.secret),
    raw: payload,
  };
}

export class TossPaymentProvider implements PaymentProvider {
  readonly name = "toss";
  private readonly authHeader: string;

  constructor() {
    const secretKey = process.env.TOSS_SECRET_KEY;
    if (!secretKey) throw new Error("TOSS_SECRET_KEY 환경변수가 필요합니다.");
    this.authHeader = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
  }

  /** Toss는 클라이언트에서 결제창을 호출하므로 서버 initiate는 PENDING을 반환한다. */
  initiate(_input: InitiateInput): Promise<InitiateResult> {
    return Promise.resolve({ providerTransactionId: null, status: "PENDING" });
  }

  /**
   * 클라이언트 결제 성공 후, Toss 서버에서 결제를 최종 승인한다.
   * ConfirmInput.providerTransactionId = Toss paymentKey.
   */
  async confirm(input: ConfirmInput): Promise<PaymentResult> {
    if (!input.providerTransactionId) {
      return { providerTransactionId: null, status: "FAILED", errorMessage: "paymentKey 없음" };
    }
    const res = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
      method: "POST",
      headers: { Authorization: this.authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentKey: input.providerTransactionId,
        orderId: input.orderId,
        amount: input.amount,
      }),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      return {
        providerTransactionId: input.providerTransactionId,
        status: "FAILED",
        errorMessage: getString(data.message) ?? `결제 승인 실패 (HTTP ${res.status})`,
      };
    }
    return {
      providerTransactionId: getString(data.paymentKey) ?? input.providerTransactionId,
      status: "SUCCEEDED",
      providerWebhookSecret: getString(data.secret),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const res = await fetch(
      `${TOSS_API_BASE}/payments/${encodeURIComponent(input.providerTransactionId)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify(refundBody(input)),
      },
    );
    const data = await parseJson(res);
    if (!res.ok) return failedRefund(input, data, res.status);
    return successfulRefund(input, data);
  }

  handleWebhook(input: { headers: Headers | Record<string, string>; rawBody: string }): Promise<WebhookResult> {
    const payload = parseWebhookBody(input.rawBody);
    if (!payload) return Promise.resolve({ verified: false, reason: "invalid_json" });
    if (getString(payload.eventType) !== "PAYMENT_STATUS_CHANGED") {
      return Promise.resolve({ verified: false, reason: "unsupported_event_type" });
    }
    if (!isRecord(payload.data)) return Promise.resolve({ verified: false, reason: "invalid_payment_data" });
    const result = paymentStatusChangedResult(
      payload,
      payload.data,
      headerValue(input.headers, "tosspayments-webhook-transmission-id"),
    );
    if (!result.orderId || !result.providerTransactionId || !result.status) {
      return Promise.resolve({ verified: false, reason: "missing_payment_fields" });
    }
    return Promise.resolve(result);
  }
}
