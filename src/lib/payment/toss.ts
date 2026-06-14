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
} from "./types";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await res.json();
  if (!isRecord(raw)) throw new Error(`Toss API 응답이 객체가 아닙니다 (HTTP ${res.status})`);
  return raw;
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
    };
  }
}
