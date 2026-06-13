// ============================================================
// lib/ai/index.ts
// AI 피팅 공급자 팩토리 — 환경변수로 구현체를 선택한다.
// ------------------------------------------------------------
// 사용처에서는 이렇게만 쓴다:
//   import { fittingProvider } from "@/lib/ai";
//   const result = await fittingProvider.applyStyle(input);
//
// AI_PROVIDER=mock  → MockFittingProvider (기본)
// AI_PROVIDER=real  → RealFittingProvider (추후 구현)
// ============================================================

import type { FittingProvider } from "./types";
import { MockFittingProvider } from "./mock";

function createProvider(): FittingProvider {
  switch (process.env.AI_PROVIDER) {
    case "real":
      // TODO: RealFittingProvider 구현 후 연결
      // return new RealFittingProvider();
      throw new Error(
        "AI_PROVIDER=real 이지만 RealFittingProvider가 아직 구현되지 않았습니다."
      );
    case "mock":
    default:
      return new MockFittingProvider();
  }
}

export const fittingProvider: FittingProvider = createProvider();

export type {
  FittingInput,
  FittingResult,
  FittingStatus,
  FittingProvider,
} from "./types";
