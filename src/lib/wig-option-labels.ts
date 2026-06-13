// ============================================================
// lib/wig-option-labels.ts — DB 영문 값 → 한글 표시 라벨
// DB 코드 없음 — 클라이언트 컴포넌트에서도 사용 가능
// ============================================================

export const LENGTH_LABELS: Record<string, string> = {
  short: "숏",
  medium: "미디",
  long: "롱",
};

export const CURL_LABELS: Record<string, string> = {
  straight: "직모",
  wavy: "웨이브",
  curly: "컬리",
};

export function getLengthLabel(length: string): string {
  return LENGTH_LABELS[length] ?? length;
}

export function getCurlLabel(curl: string): string {
  return CURL_LABELS[curl] ?? curl;
}
