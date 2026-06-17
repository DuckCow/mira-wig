// ============================================================
// lib/ai/mock.ts — MockFittingProvider (server-async)
// 실제 AI API 연동 전 개발/테스트용 즉시 결과 시뮬레이터
// ------------------------------------------------------------
// 실패 시뮬: AI_MOCK_FORCE_FAIL=true 환경변수 (이 mock의 자체 config).
//            공유 인터페이스 시그니처에 들어가지 않는다.
// 처리 지연: AI_MOCK_DELAY_MS 환경변수 (기본 0 — 테스트 결정성 보장).
// ============================================================

import { randomUUID } from "crypto";
import type { FittingJobStatus, FittingProvider } from "./types";

/** canned 샘플 결과 이미지 key (URL 아님 — 규칙 4-4).
 *  jobVariantMap에 variantId가 없을 때(직접 getJob 호출 등)의 폴백. */
export const MOCK_RESULT_KEY = "tryon-result/sample/mock-result.jpg";

// ── 데모 전용 — 실 VTO provider 연동 시 제거 ─────────────────
//
// requestFitting이 받은 variantId를 providerJobId에 매핑해 두었다가
// getJob에서 variant별 canned 결과 키를 돌려준다.
// 인메모리: 서버 재시작 시 초기화됨(데모 용도로 무방).
const DEMO_RESULT_PREFIX = "demo-fitting-result";
const jobVariantMap = new Map<string, string>(); // providerJobId → variantId

export class MockFittingProvider implements FittingProvider {
  readonly mode = "server-async" as const;
  readonly name = "mock";
  private readonly delayMs: number;

  /** @param delayMs 처리 지연(ms). 기본 0 — 테스트에서 즉시 terminal 상태 반환. */
  constructor(delayMs = 0) {
    this.delayMs = delayMs;
  }

  requestFitting(input: {
    sourceImageKey: string;
    variantId: string;
    variantSku?: string;
  }): Promise<{ providerJobId: string }> {
    const providerJobId = `mock-job-${randomUUID()}`;
    // 데모: sku 보관(없으면 variantId 폴백) — 실 VTO provider 연동 시 제거
    jobVariantMap.set(providerJobId, input.variantSku ?? input.variantId);
    return Promise.resolve({ providerJobId });
  }

  async getJob(providerJobId: string): Promise<FittingJobStatus> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    // 실패 시뮬 — 공유 인터페이스가 아닌 이 mock의 자체 환경변수로만 제어
    if (process.env.AI_MOCK_FORCE_FAIL === "true") {
      return { status: "failed", reason: "AI_MOCK_FORCE_FAIL=true" };
    }
    // 데모: variantId 있으면 canned 키, 없으면(직접 getJob 호출 등) MOCK_RESULT_KEY 폴백
    // 실 VTO provider 연동 시 이 분기 제거
    const variantId = jobVariantMap.get(providerJobId);
    const resultImageKey = variantId
      ? `${DEMO_RESULT_PREFIX}/${variantId}`
      : MOCK_RESULT_KEY;
    return { status: "succeeded", result: { resultImageKey } };
  }
}
