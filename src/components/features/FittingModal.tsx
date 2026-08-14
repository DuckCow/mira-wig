"use client";

// ============================================================
// components/features/FittingModal.tsx — 피팅 플로우 모달
// ------------------------------------------------------------
// 상태 머신: idle → uploading → starting → polling → result | error
// presigned URL은 pollFittingAction이 반환하는 것만 사용.
// addToCart는 기존 액션 재사용, 직접 storage/SDK import 없음.
// ============================================================

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useFitting, type FittingStage } from "@/hooks/useFitting";
import { addToCart } from "@/app/actions/cart";
import { type ClientErrorCode, type FittingLocale } from "@/lib/fitting/locale";
import type { MarketCode } from "@/lib/market/types";
import type { Locale } from "@/lib/market/locale";
import { withStorefrontHandoff } from "@/lib/market/request-context";
import { messagesFor } from "@/lib/market/messages";

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
        {t.selectPhoto}
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
  marketCode,
  locale,
}: {
  stage: Extract<FittingStage, { step: "result" }>;
  t: FittingLocale;
  wigStyleId: string;
  variantId: string;
  marketCode: MarketCode;
  locale: Locale;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAddToCart() {
    setError(null);
    startTransition(async () => {
      const result = await addToCart(marketCode, variantId, wigStyleId, 1);
      if (!result.success) {
        const messages = messagesFor(locale);
        setError(result.errorCode === "MARKET_CONFIRMATION_REQUIRED"
          ? messages.marketConfirmation.required
          : messages.cart.unavailableNotice);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {stage.sourceUrl && (
          <figure>
            <figcaption className="text-xs text-center text-gray-500 mb-1">{t.before}</figcaption>
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={stage.sourceUrl}
                alt={t.before}
                fill
                unoptimized
                loading="eager"
                sizes="(max-width: 640px) calc(50vw - 2rem), 200px"
                className="object-cover"
              />
            </div>
          </figure>
        )}
        <figure>
          <figcaption className="text-xs text-center text-gray-500 mb-1">{t.after}</figcaption>
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <Image
              src={stage.resultUrl}
              alt={t.after}
              fill
              unoptimized
              loading="eager"
              sizes="(max-width: 640px) calc(50vw - 2rem), 200px"
              className="object-cover"
            />
          </div>
        </figure>
      </div>

      <Link
        href={withStorefrontHandoff(`/fitting/${encodeURIComponent(stage.fittingId)}`, { marketCode, locale })}
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
      {error && (
        <p role="status" aria-live="polite" className="text-sm text-center text-red-500">
          {error}
        </p>
      )}
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
  marketCode,
  locale,
  t,
  onClose,
}: {
  variantId: string;
  wigStyleId: string;
  marketCode: MarketCode;
  locale: Locale;
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
            marketCode={marketCode}
            locale={locale}
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
