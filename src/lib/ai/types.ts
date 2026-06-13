// ============================================================
// lib/ai/types.ts
// AI 가상 피팅 추상화 계층 — "계약(contract)"
// ------------------------------------------------------------
// 규칙: 컴포넌트/API Route는 절대 외부 AI SDK를 직접 import하지 않는다.
//       반드시 이 FittingProvider 인터페이스를 통해서만 호출한다.
//       공급자를 바꿔도 구현체(mock.ts / real.ts) 1파일만 교체된다.
// ============================================================

/** 피팅 요청 입력 */
export interface FittingInput {
  /** 사용자가 업로드한 원본 이미지의 S3 key (URL 아님 — 규칙 4-4) */
  originalImageKey: string;
  /** 적용할 가발 스타일 ID */
  wigStyleId: string;
  /** 선택적으로 특정 variant(색상/길이/컬)를 지정해 미리보기 */
  wigVariantId?: string;
  /** 피팅 시 선택된 옵션 스냅샷 (색상, 길이, 컬 등) */
  appliedOptions?: Record<string, unknown>;
}

/** 피팅 처리 상태 — Prisma의 TryOnStatus와 일치시킬 것 */
export type FittingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/** 피팅 결과 */
export interface FittingResult {
  status: FittingStatus;
  /** 결과 이미지의 S3 key. 실패 시 undefined */
  resultImageKey?: string;
  /** 외부 AI API의 요청 ID (추적/디버깅용) */
  providerRequestId?: string;
  /** 처리 소요 시간(ms) — 공급자 성능 비교용 */
  processingMs?: number;
  /** 실패 시 에러 메시지 */
  errorMessage?: string;
}

/**
 * 비동기 처리형 공급자를 위한 폴링 인터페이스(선택).
 * 외부 AI API가 즉시 결과를 안 주고 job ID만 줄 때 사용한다.
 * mock 구현체는 이 메서드를 안 만들어도 된다.
 */
export interface FittingProvider {
  /** 공급자 식별자 (TryOn.providerName에 저장됨, 예: "mock", "replicate") */
  readonly name: string;

  /**
   * 가발 스타일을 사용자 사진에 적용한다.
   * 동기 공급자는 여기서 바로 COMPLETED 결과를 반환한다.
   * 비동기 공급자는 PROCESSING + providerRequestId를 반환하고
   * 이후 checkStatus()로 폴링한다.
   */
  applyStyle(input: FittingInput): Promise<FittingResult>;

  /**
   * 비동기 공급자의 처리 상태 확인 (선택 구현).
   * 동기 공급자는 구현하지 않아도 된다.
   */
  checkStatus?(providerRequestId: string): Promise<FittingResult>;
}
