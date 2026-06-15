// ============================================================
// lib/fitting/types.ts — 피팅 오케스트레이션 공유 타입
// client-safe: server-only import 없음
// ============================================================

export type FittingErrorCode =
  | "VARIANT_UNAVAILABLE"  // 해당 variant가 존재하지 않거나 마켓 비활성
  | "SOURCE_KEY_INVALID"   // sourceImageKey가 URL이거나 잘못된 형식
  | "NOT_FOUND"            // Fitting 레코드를 찾을 수 없음
  | "UNAUTHORIZED"         // 본인 소유가 아닌 Fitting 접근 시도
  | "UNAUTHENTICATED"      // 세션 없음 (비로그인)
  | "PROVIDER_ERROR"       // AI provider 측 처리 실패
  | "UNKNOWN";             // 분류되지 않은 에러 (locale 폴백용)

export class FittingException extends Error {
  constructor(
    public readonly code: FittingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FittingException";
  }
}

/** startFitting 성공 결과 */
export interface StartFittingResult {
  fittingId: string;
}

/** pollFitting 결과 — DB key만 포함 (URL은 액션 레이어에서 presign) */
export type FittingPollResult =
  | { status: "pending"; fittingId: string }
  | { status: "succeeded"; fittingId: string; resultImageKey: string; sourceImageKey: string | null }
  | { status: "failed"; fittingId: string; reason: string };
