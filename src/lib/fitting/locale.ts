// ============================================================
// lib/fitting/locale.ts — 피팅 UI 텍스트 (마켓 로케일 기반)
// ------------------------------------------------------------
// i18n 라이브러리 없이 단순 맵으로 관리.
// MARKET_CONFIGS[marketCode].defaultLocale → getFittingLocale()로 텍스트 선택.
// 에러는 코드를 키로 하여 이 맵에서 문구로 변환한다.
// 매핑되지 않는 코드는 UNKNOWN 항목으로 폴백 — 한국어 raw string 누출 없음.
// ============================================================

import type { FittingErrorCode } from "./types";

// UNSUPPORTED_TYPE은 업로드 전용 코드 (FittingErrorCode 범주 밖).
export type ClientErrorCode =
  | "FILE_TOO_LARGE"    // 클라이언트 가드: 10MB 초과
  | "INVALID_TYPE"      // 클라이언트 가드: 이미지가 아닌 파일
  | "UPLOAD_FAILED"     // S3 PUT 실패 또는 폴링 타임아웃
  | "UNSUPPORTED_TYPE"  // 허용되지 않는 MIME 타입
  | FittingErrorCode;   // UNAUTHENTICATED | PROVIDER_ERROR | UNKNOWN | …

export interface FittingLocale {
  cta: string;
  modalTitle: string;
  uploadPrompt: string;
  uploading: string;
  starting: string;
  processing: string;
  resultTitle: string;
  before: string;
  after: string;
  addToCart: string;
  viewSaved: string;
  retry: string;
  close: string;
  errors: Record<ClientErrorCode, string>;
}

const KO: FittingLocale = {
  cta: "써보기",
  modalTitle: "가상 피팅",
  uploadPrompt: "얼굴 사진을 업로드하세요 (jpg/png/webp, 최대 10MB)",
  uploading: "사진 업로드 중…",
  starting: "피팅 준비 중…",
  processing: "가발을 합성하고 있습니다…",
  resultTitle: "피팅 결과",
  before: "원본",
  after: "피팅",
  addToCart: "장바구니 담기",
  viewSaved: "결과 저장 보기",
  retry: "다시 시도",
  close: "닫기",
  errors: {
    UNAUTHENTICATED: "로그인이 필요합니다.",
    UNSUPPORTED_TYPE: "jpg, png, webp 파일만 업로드할 수 있습니다.",
    FILE_TOO_LARGE: "파일 크기는 10MB 이하여야 합니다.",
    INVALID_TYPE: "이미지 파일만 업로드할 수 있습니다.",
    UPLOAD_FAILED: "업로드에 실패했습니다. 다시 시도해주세요.",
    VARIANT_UNAVAILABLE: "현재 마켓에서 제공하지 않는 스타일입니다.",
    SOURCE_KEY_INVALID: "이미지 키가 올바르지 않습니다.",
    NOT_FOUND: "피팅을 찾을 수 없습니다.",
    UNAUTHORIZED: "접근 권한이 없습니다.",
    PROVIDER_ERROR: "AI 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
    UNKNOWN: "알 수 없는 오류가 발생했습니다. 다시 시도해주세요.",
  },
};

const EN: FittingLocale = {
  cta: "Try it on",
  modalTitle: "Virtual Try-On",
  uploadPrompt: "Upload your photo (jpg/png/webp, max 10MB)",
  uploading: "Uploading photo…",
  starting: "Preparing fitting…",
  processing: "Applying wig…",
  resultTitle: "Try-On Result",
  before: "Before",
  after: "After",
  addToCart: "Add to Cart",
  viewSaved: "View Saved Result",
  retry: "Try Again",
  close: "Close",
  errors: {
    UNAUTHENTICATED: "Please sign in to continue.",
    UNSUPPORTED_TYPE: "Only jpg, png, and webp files are supported.",
    FILE_TOO_LARGE: "File must be under 10MB.",
    INVALID_TYPE: "Only image files are accepted.",
    UPLOAD_FAILED: "Upload failed. Please try again.",
    VARIANT_UNAVAILABLE: "This style is not available in your region.",
    SOURCE_KEY_INVALID: "Invalid image key.",
    NOT_FOUND: "Fitting not found.",
    UNAUTHORIZED: "Access denied.",
    PROVIDER_ERROR: "AI processing failed. Please try again.",
    UNKNOWN: "An unexpected error occurred. Please try again.",
  },
};

const JA: FittingLocale = {
  cta: "試着する",
  modalTitle: "バーチャル試着",
  uploadPrompt: "顔写真をアップロード（jpg/png/webp、最大10MB）",
  uploading: "写真をアップロード中…",
  starting: "試着を準備中…",
  processing: "ウィッグを合成中…",
  resultTitle: "試着結果",
  before: "元の写真",
  after: "試着後",
  addToCart: "カートに追加",
  viewSaved: "保存した結果を見る",
  retry: "もう一度試す",
  close: "閉じる",
  errors: {
    UNAUTHENTICATED: "ログインが必要です。",
    UNSUPPORTED_TYPE: "jpg、png、webpファイルのみアップロードできます。",
    FILE_TOO_LARGE: "ファイルサイズは10MB以下にしてください。",
    INVALID_TYPE: "画像ファイルのみアップロードできます。",
    UPLOAD_FAILED: "アップロードに失敗しました。もう一度お試しください。",
    VARIANT_UNAVAILABLE: "このスタイルは現在ご利用いただけません。",
    SOURCE_KEY_INVALID: "画像キーが無効です。",
    NOT_FOUND: "試着データが見つかりません。",
    UNAUTHORIZED: "アクセス権限がありません。",
    PROVIDER_ERROR: "AI処理中にエラーが発生しました。もう一度お試しください。",
    UNKNOWN: "予期しないエラーが発生しました。もう一度お試しください。",
  },
};

const LOCALE_MAP: Record<string, FittingLocale> = { ko: KO, en: EN, ja: JA };

export function getFittingLocale(defaultLocale: string): FittingLocale {
  return LOCALE_MAP[defaultLocale] ?? KO;
}
