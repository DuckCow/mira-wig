"use client";

// ============================================================
// hooks/useFitting.ts — 피팅 업로드·폴링 상태 머신
// ------------------------------------------------------------
// 사용법:
//   const { stage, startUpload, reset } = useFitting(variantId);
// 단계: idle → uploading → starting → polling → result | error
// ============================================================

import { useCallback, useRef, useState } from "react";
import {
  getUploadUrlAction,
  startFittingAction,
  pollFittingAction,
} from "@/app/actions/fitting";

// ── 타입 ─────────────────────────────────────────────────────

export type FittingStage =
  | { step: "idle" }
  | { step: "uploading" }
  | { step: "starting" }
  | { step: "polling"; fittingId: string }
  | { step: "result"; fittingId: string; resultUrl: string; sourceUrl: string | null }
  | { step: "error"; errorCode: string };

// ── 상수 ─────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30; // 최대 60초 대기

// ── 폴링 루프 ────────────────────────────────────────────────

async function runPoll(
  fittingId: string,
  signal: AbortSignal,
  onResult: (stage: FittingStage) => void,
): Promise<void> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal.aborted) return;

    const result = await pollFittingAction(fittingId);
    if (signal.aborted) return;

    if (!result.success) {
      onResult({ step: "error", errorCode: result.errorCode });
      return;
    }
    if (result.status === "succeeded") {
      onResult({
        step: "result",
        fittingId,
        resultUrl: result.resultUrl,
        sourceUrl: result.sourceUrl,
      });
      return;
    }
    if (result.status === "failed") {
      onResult({ step: "error", errorCode: result.errorCode });
      return;
    }
    // pending → 계속
  }
  onResult({ step: "error", errorCode: "UPLOAD_FAILED" }); // 타임아웃
}

// ── 파일 클라이언트 가드 ─────────────────────────────────────

function validateFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "INVALID_TYPE";
  if (file.size > MAX_FILE_SIZE) return "FILE_TOO_LARGE";
  return null;
}

// ── 훅 ───────────────────────────────────────────────────────

export function useFitting(variantId: string) {
  const [stage, setStage] = useState<FittingStage>({ step: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStage({ step: "idle" });
  }, []);

  const startUpload = useCallback(
    async (file: File) => {
      const fileError = validateFile(file);
      if (fileError) { setStage({ step: "error", errorCode: fileError }); return; }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // ── 1. presigned URL 발급 ───────────────────────────────
      setStage({ step: "uploading" });
      const urlResult = await getUploadUrlAction(file.type);
      if (controller.signal.aborted) return;
      if (!urlResult.success) {
        setStage({ step: "error", errorCode: urlResult.errorCode });
        return;
      }

      // ── 2. S3(또는 mock) 직접 업로드 ────────────────────────
      const putResp = await fetch(urlResult.uploadUrl, {
        method: "PUT",
        body: file,
        headers: urlResult.requiredHeaders,
      });
      if (controller.signal.aborted) return;
      if (!putResp.ok) {
        setStage({ step: "error", errorCode: "UPLOAD_FAILED" });
        return;
      }

      // ── 3. 피팅 시작 ────────────────────────────────────────
      setStage({ step: "starting" });
      const startResult = await startFittingAction(urlResult.key, variantId);
      if (controller.signal.aborted) return;
      if (!startResult.success) {
        setStage({ step: "error", errorCode: startResult.errorCode });
        return;
      }

      // ── 4. 폴링 ─────────────────────────────────────────────
      const { fittingId } = startResult;
      setStage({ step: "polling", fittingId });
      await runPoll(fittingId, controller.signal, (s) => setStage(s));
    },
    [variantId],
  );

  return { stage, startUpload, reset };
}
