// ============================================================
// lib/ai/mock.ts
// MockFittingProvider — 초기 MVP용 가짜 구현체
// ------------------------------------------------------------
// AI API 연동 전까지 UX를 먼저 완성하기 위한 mock.
// 실제로는 원본 이미지를 그대로 결과로 돌려주거나,
// 미리 준비된 샘플 결과 이미지 key를 반환한다.
// ============================================================

import type { FittingInput, FittingProvider, FittingResult } from "./types";

export class MockFittingProvider implements FittingProvider {
  readonly name = "mock";

  async applyStyle(input: FittingInput): Promise<FittingResult> {
    const start = Date.now();

    // 실제 AI 처리를 흉내내기 위한 인위적 지연 (로딩 UX 테스트용)
    await new Promise((r) => setTimeout(r, 1200));

    // TODO(real provider): 외부 AI API 호출로 교체.
    // mock 단계에서는 원본 이미지를 결과로 그대로 사용한다.
    // (실제 합성 대신, 흐름과 UX를 검증하는 것이 목적)
    return {
      status: "COMPLETED",
      resultImageKey: input.originalImageKey,
      providerRequestId: `mock_${Date.now()}`,
      processingMs: Date.now() - start,
    };
  }
}
