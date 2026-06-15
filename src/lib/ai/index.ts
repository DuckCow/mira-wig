// ============================================================
// lib/ai/index.ts — AI 피팅 공급자 팩토리
// ------------------------------------------------------------
// 사용처:
//   import { getFittingProvider } from "@/lib/ai";
//   const provider = getFittingProvider();
//   const { providerJobId } = await provider.requestFitting({ ... });
// ------------------------------------------------------------
// AI_PROVIDER=mock  → MockFittingProvider (기본)
// AI_PROVIDER=real  → RealFittingProvider (추후 구현)
// AI_MOCK_DELAY_MS  → mock 처리 지연(ms, 기본 0)
// ============================================================

import type { FittingProvider } from "./types";
import { MockFittingProvider } from "./mock";

/**
 * 환경변수 AI_PROVIDER로 공급자를 선택한다.
 * 현재는 mock 단일 구현. AI_MOCK_DELAY_MS로 처리 지연을 설정 가능.
 */
export function getFittingProvider(): FittingProvider {
  const delayMs = Number(process.env.AI_MOCK_DELAY_MS ?? 0);
  switch (process.env.AI_PROVIDER) {
    case "real":
      // TODO: RealFittingProvider 구현 후 연결
      throw new Error("AI_PROVIDER=real 이지만 RealFittingProvider가 아직 구현되지 않았습니다.");
    case "mock":
    default:
      return new MockFittingProvider(delayMs);
  }
}

export type {
  FittingProvider,
  FittingResult,
  FittingJobStatus,
  FittingProviderMode,
  ServerAsyncFittingProvider,
} from "./types";
