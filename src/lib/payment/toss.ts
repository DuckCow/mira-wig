// ============================================================
// lib/payment/toss.ts
// TossPaymentProvider — 토스페이먼츠 구현체
// ------------------------------------------------------------
// 토스 승인 API: POST https://api.tosspayments.com/v1/payments/confirm
// 인증: Basic 인증 (시크릿 키 + ":" 를 base64) — 시크릿 키는 서버에서만 사용.
// ------------------------------------------------------------
// ⚠️ 금액 검증은 이 클래스 밖(주문 확정 API)에서 DB 대조로 수행해야 한다.
//    이 클래스는 PG와의 통신만 책임진다.
// ============================================================

import type {
  ConfirmPaymentInput,
  PaymentProvider,
  PaymentResult,
  RefundInput,
} from "./types";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

// ── 타입가드 헬퍼 ─────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

// ── 응답 파싱 ─────────────────────────────────────────────────

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await res.json();
  if (!isRecord(raw)) {
    throw new Error(`토스 API 응답이 객체가 아닙니다 (HTTP ${res.status})`);
  }
  return raw;
}

function toConfirmFailure(
  data: Record<string, unknown>,
  fallbackId: string,
  status: number,
): PaymentResult {
  return {
    status: "FAILED",
    paymentId: fallbackId,
    approvedAmount: 0,
    errorMessage: getString(data.message) ?? `결제 승인 실패 (HTTP ${status})`,
  };
}

function toConfirmSuccess(
  data: Record<string, unknown>,
  fallbackId: string,
  fallbackAmount: number,
): PaymentResult {
  return {
    status: "PAID",
    paymentId: getString(data.paymentKey) ?? fallbackId,
    approvedAmount: getNumber(data.totalAmount) ?? fallbackAmount,
    method: getString(data.method),
    approvedAt: getString(data.approvedAt),
  };
}

function toRefundFailure(
  data: Record<string, unknown>,
  paymentId: string,
): PaymentResult {
  return {
    status: "FAILED",
    paymentId,
    approvedAmount: 0,
    errorMessage: getString(data.message) ?? "환불 실패",
  };
}

// ── 구현체 ────────────────────────────────────────────────────

export class TossPaymentProvider implements PaymentProvider {
  readonly name = "toss";
  private readonly authHeader: string;

  constructor() {
    const secretKey = process.env.TOSS_SECRET_KEY;
    if (!secretKey) {
      throw new Error("TOSS_SECRET_KEY 환경변수가 필요합니다.");
    }
    // 토스는 "시크릿키:" 형태를 base64로 인코딩한 Basic 인증을 사용
    this.authHeader =
      "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
  }

  async confirmPayment(input: ConfirmPaymentInput): Promise<PaymentResult> {
    const res = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      }),
    });

    const data = await parseJson(res);

    if (!res.ok) {
      return toConfirmFailure(data, input.paymentKey, res.status);
    }
    return toConfirmSuccess(data, input.paymentKey, input.amount);
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    const res = await fetch(
      `${TOSS_API_BASE}/payments/${input.paymentId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cancelReason: input.reason,
          ...(input.amount !== undefined ? { cancelAmount: input.amount } : {}),
        }),
      },
    );

    const data = await parseJson(res);

    if (!res.ok) {
      return toRefundFailure(data, input.paymentId);
    }
    return {
      status: "CANCELLED",
      paymentId: input.paymentId,
      approvedAmount: input.amount ?? 0,
    };
  }
}
