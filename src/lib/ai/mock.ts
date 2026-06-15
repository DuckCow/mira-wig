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

/** canned 샘플 결과 이미지 key (URL 아님 — 규칙 4-4) */
export const MOCK_RESULT_KEY = "tryon-result/sample/mock-result.jpg";

export class MockFittingProvider implements FittingProvider {
  readonly mode = "server-async" as const;
  readonly name = "mock";
  private readonly delayMs: number;

  /** @param delayMs 처리 지연(ms). 기본 0 — 테스트에서 즉시 terminal 상태 반환. */
  constructor(delayMs = 0) {
    this.delayMs = delayMs;
  }

  requestFitting(_input: {
    sourceImageKey: string;
    variantId: string;
  }): Promise<{ providerJobId: string }> {
    return Promise.resolve({ providerJobId: `mock-job-${randomUUID()}` });
  }

  async getJob(_providerJobId: string): Promise<FittingJobStatus> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    // 실패 시뮬 — 공유 인터페이스가 아닌 이 mock의 자체 환경변수로만 제어
    if (process.env.AI_MOCK_FORCE_FAIL === "true") {
      return { status: "failed", reason: "AI_MOCK_FORCE_FAIL=true" };
    }
    return { status: "succeeded", result: { resultImageKey: MOCK_RESULT_KEY } };
  }
}
