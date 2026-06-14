// ============================================================
// STRICT 존 행동 검증 테스트 — lib/payment/core.ts + mock.ts
// DB 의존성 없음; 순수 함수 + MockPaymentProvider만 테스트한다.
//
// processPayment(process.ts)는 DB 트랜잭션을 포함하므로
// 통합 테스트(실제 DB) 환경에서 검증해야 한다 — 여기서는 제외.
// ============================================================
import { describe, expect, it } from "vitest";
import {
  validateOrderForPayment,
  canDecrementStock,
  isAlreadyProcessed,
  computeRemainingStock,
} from "../core";
import { MockPaymentProvider } from "../mock";

// ── validateOrderForPayment ───────────────────────────────────

describe("validateOrderForPayment", () => {
  it("PENDING_PAYMENT 상태는 유효하다", () => {
    const result = validateOrderForPayment("PENDING_PAYMENT");
    expect(result.valid).toBe(true);
  });

  it("PAID 상태는 '이미 결제 완료' 오류를 반환한다", () => {
    const result = validateOrderForPayment("PAID");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("이미 결제");
  });

  it("PAYMENT_FAILED 상태는 처리 거부한다", () => {
    const result = validateOrderForPayment("PAYMENT_FAILED");
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("CANCELLED 등 기타 상태도 처리 거부한다", () => {
    const result = validateOrderForPayment("CANCELLED");
    expect(result.valid).toBe(false);
  });

  it("거부 시 reason 메시지가 포함된다", () => {
    const result = validateOrderForPayment("CONFIRMED");
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe("string");
  });
});

// ── canDecrementStock ─────────────────────────────────────────

describe("canDecrementStock", () => {
  it("재고 > 수량이면 true", () => {
    expect(canDecrementStock(10, 5)).toBe(true);
  });

  it("재고 = 수량(경계값)이면 true", () => {
    expect(canDecrementStock(50, 50)).toBe(true);
  });

  it("재고 < 수량이면 false", () => {
    expect(canDecrementStock(5, 10)).toBe(false);
  });

  it("재고 = 0, 수량 = 1이면 false", () => {
    expect(canDecrementStock(0, 1)).toBe(false);
  });

  it("재고 = 0, 수량 = 0이면 true (빈 요청)", () => {
    expect(canDecrementStock(0, 0)).toBe(true);
  });

  // ── 동시성 시뮬: 조건부 업데이트 패턴 검증 ──────────────────
  // Prisma updateMany({where:{stock:{gte:qty}}}) 조건을 재현한다.
  // 두 요청이 동시에 도달해도 조건부 업데이트가 하나만 성공시킨다.

  it("[동시성] 재고 1, 두 요청이 동시 도달 — 첫 요청만 통과한다", () => {
    const stock = 1;
    const qty = 1;
    // 첫 번째 요청: 재고 확인 통과
    expect(canDecrementStock(stock, qty)).toBe(true);
    // 실제 차감 후 재고 = 0 (Prisma updateMany가 count=1 반환, 다음 조건부 업데이트는 count=0)
    const remainingAfterFirst = computeRemainingStock(stock, qty);
    // 두 번째 요청: 이미 재고 없음 → 실패
    expect(canDecrementStock(remainingAfterFirst, qty)).toBe(false);
  });
});

// ── computeRemainingStock ─────────────────────────────────────

describe("computeRemainingStock", () => {
  it("차감 후 잔량 = currentStock - requestedQty", () => {
    expect(computeRemainingStock(50, 50)).toBe(0);
    expect(computeRemainingStock(10, 3)).toBe(7);
    expect(computeRemainingStock(100, 1)).toBe(99);
  });
});

// ── isAlreadyProcessed ────────────────────────────────────────

describe("isAlreadyProcessed", () => {
  it("결제 기록이 없으면 false", () => {
    expect(isAlreadyProcessed(null)).toBe(false);
  });

  it("SUCCEEDED 기록이 있으면 true (idempotency)", () => {
    expect(isAlreadyProcessed({ status: "SUCCEEDED" })).toBe(true);
  });

  it("FAILED 기록이 있으면 false (재시도 가능)", () => {
    expect(isAlreadyProcessed({ status: "FAILED" })).toBe(false);
  });

  it("PENDING 기록이 있으면 false", () => {
    expect(isAlreadyProcessed({ status: "PENDING" })).toBe(false);
  });

  // ── idempotency 시나리오 ──────────────────────────────────────
  // 두 번째 호출은 첫 번째 SUCCEEDED 결과를 그대로 반환해야 한다.

  it("[idempotency] 성공 기록 있으면 재처리 없이 반환 결정을 내린다", () => {
    const existingSucceeded = { id: "pay_123", status: "SUCCEEDED" };
    expect(isAlreadyProcessed(existingSucceeded)).toBe(true);
  });

  it("[idempotency] 실패 기록은 idempotent 처리 대상이 아니다", () => {
    const existingFailed = { id: "pay_456", status: "FAILED" };
    expect(isAlreadyProcessed(existingFailed)).toBe(false);
  });
});

// ── MockPaymentProvider ───────────────────────────────────────

describe("MockPaymentProvider — initiate", () => {
  const input = {
    orderId: "order_1",
    amount: 85000,
    currency: "KRW",
    idempotencyKey: "idem_abc",
  };

  it("shouldSucceed=true(기본값)이면 SUCCEEDED 반환", async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.initiate(input);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.providerTransactionId).toBeTruthy();
  });

  it("shouldSucceed=false이면 FAILED 반환", async () => {
    const provider = new MockPaymentProvider(false);
    const result = await provider.initiate(input);
    expect(result.status).toBe("FAILED");
    expect(result.providerTransactionId).toBeNull();
  });

  it("providerTransactionId에 idempotencyKey가 반영된다", async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.initiate(input);
    expect(result.providerTransactionId).toContain(input.idempotencyKey);
  });

  it("name은 'mock'이다", () => {
    expect(new MockPaymentProvider().name).toBe("mock");
  });
});

describe("MockPaymentProvider — confirm", () => {
  it("shouldSucceed=true이면 SUCCEEDED 반환", async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.confirm({
      orderId: "order_1", amount: 85000,
      providerTransactionId: "mock_txn_idem_abc", idempotencyKey: "idem_abc",
    });
    expect(result.status).toBe("SUCCEEDED");
  });

  it("shouldSucceed=false이면 FAILED 반환", async () => {
    const provider = new MockPaymentProvider(false);
    const result = await provider.confirm({
      orderId: "order_1", amount: 85000,
      providerTransactionId: null, idempotencyKey: "idem_abc",
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toBeTruthy();
  });
});

// ── 결제 실패 케이스 시나리오 ────────────────────────────────

describe("결제 실패 시나리오 — 상태 가드", () => {
  it("이미 PAID인 주문은 결제 처리를 거부해야 한다", () => {
    const validation = validateOrderForPayment("PAID");
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBeTruthy();
  });

  it("PAYMENT_FAILED 주문은 재결제 시도를 거부한다 (새 주문 필요)", () => {
    const validation = validateOrderForPayment("PAYMENT_FAILED");
    expect(validation.valid).toBe(false);
  });

  it("재고 부족 시 차감이 불가하다", () => {
    // OrderItem 수량 > 현재 재고
    expect(canDecrementStock(3, 5)).toBe(false);
  });

  it("재고 부족 시 차감 후 음수가 되지 않음을 보장한다", () => {
    // 차감 전 반드시 canDecrementStock으로 검사해야 하며
    // 검사 통과 후에만 computeRemainingStock을 호출한다
    const stock = 3;
    const qty = 5;
    expect(canDecrementStock(stock, qty)).toBe(false);
    // 이 경우 computeRemainingStock은 호출하지 않는다 (음수 방지)
  });
});
