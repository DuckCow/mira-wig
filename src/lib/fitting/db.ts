// ============================================================
// lib/fitting/db.ts — 피팅 오케스트레이션 (STRICT 존, 서버 전용)
// ------------------------------------------------------------
// startFitting: 검증 → Fitting(PENDING) 생성 → provider 요청 → jobId 저장
// pollFitting:  소유권 확인 → terminal 멱등 반환 / provider 폴 → 결과 저장
// ============================================================
import "server-only";

import { db } from "@/lib/db";
import { getFittingProvider } from "@/lib/ai";
import { FittingException, type FittingPollResult } from "./types";
import { assertKeyNotUrl, validateSourceKey } from "./validation";

// ── 내부 타입 ────────────────────────────────────────────────

type StoredFitting = {
  id: string;
  userId: string;
  status: string;
  sourceImageKey: string | null;
  resultImageKey: string | null;
  providerJobId: string | null;
  failureReason: string | null;
};

// ── startFitting 헬퍼 ─────────────────────────────────────────

async function checkVariantForMarket(variantId: string, marketCode: string): Promise<string> {
  const variant = await db.wigVariant.findUnique({
    where: { id: variantId },
    select: {
      sku: true,
      isActive: true,
      wigStyle: {
        select: {
          availableMarkets: { where: { marketCode }, select: { isActive: true } },
        },
      },
    },
  });
  if (!variant?.isActive) {
    throw new FittingException("VARIANT_UNAVAILABLE", "가발 변형을 찾을 수 없습니다.");
  }
  if (variant.wigStyle.availableMarkets[0]?.isActive !== true) {
    throw new FittingException("VARIANT_UNAVAILABLE", "현재 마켓에서 제공하지 않는 스타일입니다.");
  }
  return variant.sku;
}

async function createPendingFitting(
  userId: string,
  variantId: string,
  sourceImageKey: string,
): Promise<string> {
  const fitting = await db.fitting.create({
    data: { userId, variantId, sourceImageKey, status: "PENDING" },
    select: { id: true },
  });
  return fitting.id;
}

async function requestAndSaveJobId(
  fittingId: string,
  sourceImageKey: string,
  variantId: string,
  variantSku: string,
): Promise<void> {
  const provider = getFittingProvider();
  const { providerJobId } = await provider.requestFitting({ sourceImageKey, variantId, variantSku });
  await db.fitting.update({ where: { id: fittingId }, data: { providerJobId } });
}

// ── pollFitting 헬퍼 ──────────────────────────────────────────

async function loadFittingWithAuth(fittingId: string, userId: string): Promise<StoredFitting> {
  const fitting = await db.fitting.findUnique({
    where: { id: fittingId },
    select: {
      id: true, userId: true, status: true,
      sourceImageKey: true, resultImageKey: true,
      providerJobId: true, failureReason: true,
    },
  });
  if (!fitting) throw new FittingException("NOT_FOUND", "피팅을 찾을 수 없습니다.");
  if (fitting.userId !== userId) throw new FittingException("UNAUTHORIZED", "접근 권한이 없습니다.");
  return fitting;
}

function toTerminalResult(f: StoredFitting): FittingPollResult | null {
  if (f.status === "SUCCEEDED" && f.resultImageKey) {
    return { status: "succeeded", fittingId: f.id, resultImageKey: f.resultImageKey, sourceImageKey: f.sourceImageKey };
  }
  if (f.status === "FAILED") {
    return { status: "failed", fittingId: f.id, reason: f.failureReason ?? "알 수 없는 오류" };
  }
  return null;
}

async function fetchAndPersistJob(f: StoredFitting): Promise<FittingPollResult> {
  if (!f.providerJobId) return { status: "pending", fittingId: f.id };
  const provider = getFittingProvider();
  const jobStatus = await provider.getJob(f.providerJobId);
  if (jobStatus.status === "succeeded") {
    assertKeyNotUrl(jobStatus.result.resultImageKey, "resultImageKey");
    await db.fitting.update({
      where: { id: f.id },
      data: { status: "SUCCEEDED", resultImageKey: jobStatus.result.resultImageKey },
    });
    return { status: "succeeded", fittingId: f.id, resultImageKey: jobStatus.result.resultImageKey, sourceImageKey: f.sourceImageKey };
  }
  if (jobStatus.status === "failed") {
    await db.fitting.update({ where: { id: f.id }, data: { status: "FAILED", failureReason: jobStatus.reason } });
    return { status: "failed", fittingId: f.id, reason: jobStatus.reason };
  }
  return { status: "pending", fittingId: f.id };
}

// ── 공개 API ─────────────────────────────────────────────────

/**
 * 피팅을 시작한다. provider에 job을 등록하고 fittingId를 반환한다.
 * @throws FittingException (SOURCE_KEY_INVALID | VARIANT_UNAVAILABLE)
 */
export async function startFitting(
  userId: string,
  sourceImageKey: string,
  variantId: string,
  marketCode: string,
): Promise<string> {
  validateSourceKey(sourceImageKey);
  const variantSku = await checkVariantForMarket(variantId, marketCode);
  const fittingId = await createPendingFitting(userId, variantId, sourceImageKey);
  await requestAndSaveJobId(fittingId, sourceImageKey, variantId, variantSku);
  return fittingId;
}

/**
 * 피팅 상태를 폴링한다. terminal 상태면 provider를 호출하지 않는다(멱등).
 * @throws FittingException (NOT_FOUND | UNAUTHORIZED)
 */
export async function pollFitting(
  fittingId: string,
  userId: string,
): Promise<FittingPollResult> {
  const fitting = await loadFittingWithAuth(fittingId, userId);
  const terminal = toTerminalResult(fitting);
  if (terminal) return terminal;
  return fetchAndPersistJob(fitting);
}
