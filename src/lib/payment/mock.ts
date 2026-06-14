// ============================================================
// lib/payment/mock.ts — MockPaymentProvider
// 실제 PG 연동 전 개발/테스트용 즉시 결제 시뮬레이터
// ============================================================

import type {
  ConfirmInput,
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  PaymentResult,
} from "./types";

/**
 * 즉시 성공/실패를 반환하는 목 결제 공급자.
 * shouldSucceed=true(기본값): 결제 항상 성공.
 * shouldSucceed=false: 결제 항상 실패 (테스트용).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private readonly shouldSucceed: boolean;

  constructor(shouldSucceed = true) {
    this.shouldSucceed = shouldSucceed;
  }

  initiate(input: InitiateInput): Promise<InitiateResult> {
    if (this.shouldSucceed) {
      return Promise.resolve({
        providerTransactionId: `mock_txn_${input.idempotencyKey}`,
        status: "SUCCEEDED",
      });
    }
    return Promise.resolve({ providerTransactionId: null, status: "FAILED" });
  }

  confirm(input: ConfirmInput): Promise<PaymentResult> {
    if (this.shouldSucceed) {
      return Promise.resolve({
        providerTransactionId: input.providerTransactionId,
        status: "SUCCEEDED",
      });
    }
    return Promise.resolve({
      providerTransactionId: null,
      status: "FAILED",
      errorMessage: "mock 결제 실패 (shouldSucceed=false)",
    });
  }
}
