"use server";

// ============================================================
// app/actions/fitting.ts — 피팅 서버 액션 (thin wrapper)
// 세션 → userId 변환 + lib/fitting + storage presign만 담당.
// ------------------------------------------------------------
// 실제 AI provider 연동 시:
//   - startFittingAction: provider redirect URL이 있으면 반환 추가
//   - pollFittingAction: 결과 URL 만료 정책을 UI 요구에 맞게 조정
// ============================================================

import { getSession } from "@/lib/session";
import { getCurrentMarketCode } from "@/lib/market";
import { fittingStorage } from "@/lib/storage";
import { startFitting, pollFitting, FittingException, type FittingErrorCode } from "@/lib/fitting";

// ── getUploadUrlAction ────────────────────────────────────────
// STRICT 존: 인증·타입 검증만 담당. 문구 없이 에러 코드만 반환한다.

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// UNAUTHENTICATED는 FittingErrorCode에 통합됨 — UNSUPPORTED_TYPE만 업로드 전용.
export type UploadUrlErrorCode = "UNSUPPORTED_TYPE";

export type UploadUrlResult =
  | { success: true; uploadUrl: string; key: string; requiredHeaders: Record<string, string> }
  | { success: false; errorCode: FittingErrorCode | UploadUrlErrorCode };

export async function getUploadUrlAction(contentType: string): Promise<UploadUrlResult> {
  const session = await getSession();
  if (!session) return { success: false, errorCode: "UNAUTHENTICATED" };
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return { success: false, errorCode: "UNSUPPORTED_TYPE" };
  }
  const result = await fittingStorage.getUploadUrl({
    purpose: "user-upload",
    contentType,
    ownerId: session.user.id,
  });
  return {
    success: true,
    uploadUrl: result.uploadUrl,
    key: result.key,
    requiredHeaders: result.requiredHeaders ?? {},
  };
}

// ── startFittingAction / pollFittingAction ───────────────────
// 에러는 FittingErrorCode로만 반환한다. 한국어 문구를 액션에 하드코딩하지 않는다.

export type StartResult =
  | { success: true; fittingId: string }
  | { success: false; errorCode: FittingErrorCode };

export type PollResult =
  | { success: true; status: "pending" }
  | { success: true; status: "succeeded"; resultUrl: string; sourceUrl: string | null }
  | { success: true; status: "failed"; errorCode: FittingErrorCode }
  | { success: false; errorCode: FittingErrorCode };

export async function startFittingAction(
  sourceImageKey: string,
  variantId: string,
): Promise<StartResult> {
  const session = await getSession();
  if (!session) return { success: false, errorCode: "UNAUTHENTICATED" };
  const marketCode = await getCurrentMarketCode();
  try {
    const fittingId = await startFitting(session.user.id, sourceImageKey, variantId, marketCode);
    return { success: true, fittingId };
  } catch (e) {
    if (e instanceof FittingException) return { success: false, errorCode: e.code };
    throw e;
  }
}

export async function pollFittingAction(fittingId: string): Promise<PollResult> {
  const session = await getSession();
  if (!session) return { success: false, errorCode: "UNAUTHENTICATED" };
  try {
    const result = await pollFitting(fittingId, session.user.id);
    if (result.status === "pending") return { success: true, status: "pending" };
    if (result.status === "failed") {
      return { success: true, status: "failed", errorCode: "PROVIDER_ERROR" };
    }
    const resultUrl = await fittingStorage.getViewUrl(result.resultImageKey);
    const sourceUrl = result.sourceImageKey ? await fittingStorage.getViewUrl(result.sourceImageKey) : null;
    return { success: true, status: "succeeded", resultUrl, sourceUrl };
  } catch (e) {
    if (e instanceof FittingException) return { success: false, errorCode: e.code };
    throw e;
  }
}
