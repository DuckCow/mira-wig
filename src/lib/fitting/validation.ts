// ============================================================
// lib/fitting/validation.ts — 피팅 순수 검증 함수
// server-only 없음 — 테스트·클라이언트 모두 import 가능
// ============================================================

import { FittingException } from "./types";

function sourceOwner(key: string): string | null {
  const segments = key.split("/");
  if (segments.length !== 3) return null;
  const [purpose, ownerId, filename] = segments;
  if (purpose !== "user-upload" || !ownerId || !filename) return null;
  return ownerId;
}

/**
 * sourceImageKey가 S3 key 형식인지 검증한다.
 * 규칙 4-4: DB/인터페이스에 URL을 두지 않는다.
 * 유효한 형식: "user-upload/{ownerId}/{filename}"
 */
export function validateSourceKey(key: string, expectedOwnerId: string): void {
  if (!key || key.trim().length === 0) {
    throw new FittingException("SOURCE_KEY_INVALID", "소스 이미지 키가 비어 있습니다.");
  }
  if (key.startsWith("http://") || key.startsWith("https://")) {
    throw new FittingException(
      "SOURCE_KEY_INVALID",
      "URL이 아닌 S3 key를 사용해야 합니다 (규칙 4-4).",
    );
  }
  if (sourceOwner(key) !== expectedOwnerId) {
    throw new FittingException(
      "SOURCE_KEY_INVALID",
      "소스 이미지 키가 유효한 소유자 경로가 아닙니다.",
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
