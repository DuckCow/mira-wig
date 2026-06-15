// ============================================================
// lib/fitting/validation.ts — 피팅 순수 검증 함수
// server-only 없음 — 테스트·클라이언트 모두 import 가능
// ============================================================

import { FittingException } from "./types";

/**
 * sourceImageKey가 S3 key 형식인지 검증한다.
 * 규칙 4-4: DB/인터페이스에 URL을 두지 않는다.
 * 유효한 형식: "user-upload/{ownerId}/{filename}"
 */
export function validateSourceKey(key: string): void {
  if (!key || key.trim().length === 0) {
    throw new FittingException("SOURCE_KEY_INVALID", "소스 이미지 키가 비어 있습니다.");
  }
  if (key.startsWith("http://") || key.startsWith("https://")) {
    throw new FittingException(
      "SOURCE_KEY_INVALID",
      "URL이 아닌 S3 key를 사용해야 합니다 (규칙 4-4).",
    );
  }
  if (!key.startsWith("user-upload/")) {
    throw new FittingException(
      "SOURCE_KEY_INVALID",
      "소스 이미지는 user-upload/ 경로여야 합니다.",
    );
  }
}

/**
 * resultImageKey가 URL이 아닌 key임을 검증한다.
 * provider 응답을 DB에 저장하기 전 호출한다.
 */
export function assertKeyNotUrl(key: string, field: string): void {
  if (key.startsWith("http://") || key.startsWith("https://")) {
    throw new FittingException(
      "SOURCE_KEY_INVALID",
      `${field}에 URL이 아닌 S3 key를 저장해야 합니다.`,
    );
  }
}
