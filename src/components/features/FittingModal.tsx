"use client";

// ============================================================
// components/features/FittingModal.tsx — 피팅 플로우 모달
// ------------------------------------------------------------
// 상태 머신: idle → uploading → starting → polling → result | error
// presigned URL은 pollFittingAction이 반환하는 것만 사용.
// addToCart는 기존 액션 재사용, 직접 storage/SDK import 없음.
// ============================================================

import { useRef, useTransition } from "react";
import Link from "next/link";
import { useFitting, type FittingStage } from "@/hooks/useFitting";
import { addToCart } from "@/app/actions/cart";
import { type ClientErrorCode, type FittingLocale } from "@/lib/fitting/locale";

// ── 파일 선택기 ───────────────────────────────────────────────

function FilePicker({
  t,
  onFile,
}: {
  t: FittingLocale;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="text-sm text-gray-600 text-center">{t.uploadPrompt}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors"
      >
        사진 선택
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={t.uploadPrompt}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── 진행 표시 ─────────────────────────────────────────────────

function ProgressView({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div
        className="w-10 h-10 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm text-gray-600" role="status" aria-live="polite">
        {label}
      </p>
    </div>
  );
}

// ── 결과 뷰 ──────────────────────────────────────────────────

function ResultView({
  stage,
  t,
  wigStyleId,
  variantId,
}: {
  stage: Extract<FittingStage, { step: "result" }>;
  t: FittingLocale;
  wigStyleId: string;
  variantId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleAddToCart() {
    startTransition(async () => {
      await addToCart(variantId, wigStyleId, 1);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {stage.sourceUrl && (
          <figure>
            <figcaption className="text-xs text-center text-gray-500 mb-1">{t.before}</figcaption>
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img src={stage.sourceUrl} alt={t.before} className="absolute inset-0 w-full h-full object-cover" />
            </div>
          </figure>
        )}
        <figure>
          <figcaption className="text-xs text-center text-gray-500 mb-1">{t.after}</figcaption>
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={stage.resultUrl} alt={t.after} className="absolute inset-0 w-full h-full object-cover" />
          </div>
        </figure>
      </div>

      <Link
        href={`/fitting/${stage.fittingId}`}
        className="block text-xs text-center text-gray-400 underline hover:text-gray-600"
      >
        {t.viewSaved}
      </Link>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={isPending}
        aria-busy={isPending}
        className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "…" : t.addToCart}
      </button>
    </div>
  );
}

// ── 에러 뷰 ──────────────────────────────────────────────────

function ErrorView({
  errorCode,
  t,
  onRetry,
}: {
  errorCode: string;
  t: FittingLocale;
  onRetry: () => void;
}) {
  const isKnown = (k: string): k is ClientErrorCode => k in t.errors;
  const msg = isKnown(errorCode) ? t.errors[errorCode] : t.errors.UNKNOWN;
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="text-sm text-red-500 text-center">{msg}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
      >
        {t.retry}
      </button>
    </div>
  );
}

// ── 모달 본체 ─────────────────────────────────────────────────

export function FittingModal({
  variantId,
  wigStyleId,
  t,
  onClose,
}: {
  variantId: string;
  wigStyleId: string;
  t: FittingLocale;
  onClose: () => void;
}) {
  const { stage, startUpload, reset } = useFitting(variantId);

  function renderBody() {
    switch (stage.step) {
      case "idle":
        return <FilePicker t={t} onFile={(f) => { void startUpload(f); }} />;
      case "uploading":
        return <ProgressView label={t.uploading} />;
      case "starting":
        return <ProgressView label={t.starting} />;
      case "polling":
        return <ProgressView label={t.processing} />;
      case "result":
        return (
          <ResultView
            stage={stage}
            t={t}
            wigStyleId={wigStyleId}
            variantId={variantId}
          />
        );
      case "error":
        return <ErrorView errorCode={stage.errorCode} t={t} onRetry={reset} />;
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.modalTitle}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{t.modalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        {renderBody()}
      </div>
    </div>
  );
}
