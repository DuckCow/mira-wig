// ============================================================
// lib/order/types.ts — 주문 공유 타입 (클라이언트 안전)
// server-only 없음 — 클라이언트 컴포넌트도 import 가능
// ============================================================

// ── 스냅샷 데이터 ─────────────────────────────────────────────
// OrderItem.snapshotData 에 동결. variant가 삭제·변경돼도 과거 주문 표시 가능.

export interface SnapshotData {
  styleName: string;
  color: string;
  colorHex: string | null;
  length: string;
  curl: string;
  /** S3 key (URL 아님) — 조회 시점에 presigned URL 생성 */
  coverImageKey: string | null;
  /** 최소단위 정수 저장 시의 통화 코드 */
  currencyCode: string;
}
