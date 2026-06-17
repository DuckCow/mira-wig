// ============================================================
// lib/admin-role.ts — ADMIN role 판정 순수 함수
// ------------------------------------------------------------
// server-only 없음 — Edge 미들웨어·서버 액션 양쪽에서 import 가능.
// I/O 없음; JWT/세션에서 꺼낸 role 값만 인수로 받는다.
// ============================================================

/**
 * JWT/세션에서 꺼낸 role 값이 ADMIN인지 판정한다.
 * Edge 미들웨어(getToken)와 server action(requireAdmin) 양쪽에서 재사용.
 */
export function isAdminRole(role: string | undefined | null): boolean {
  return role === "ADMIN";
}
