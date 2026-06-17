// ============================================================
// lib/admin.ts — ADMIN 권한 가드 (STRICT 존, 서버 전용)
// ------------------------------------------------------------
// requireAdmin(): server action 진입부에서 호출. I/O 포함.
// isAdminRole():  순수 판정 — I/O 없음. 미들웨어에서도 재사용 가능.
// ============================================================
import "server-only";

import type { Session } from "next-auth";
import { getSession } from "./session";
import { isAdminRole } from "./admin-role";

// isAdminRole은 admin-role.ts에서 정의 — Edge 미들웨어도 그쪽을 import한다.
export { isAdminRole };

// ── 타입 ─────────────────────────────────────────────────────

export type AdminGuardResult =
  | { success: false; errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | { success: true; session: Session };

// ── 서버 액션용 가드 (I/O 포함) ──────────────────────────────

/**
 * 세션을 취득하고 ADMIN 여부를 확인한다.
 * - 미인증    → { success: false, errorCode: "UNAUTHENTICATED" }
 * - 비ADMIN  → { success: false, errorCode: "FORBIDDEN" }
 * - ADMIN     → { success: true, session }
 *
 * @example
 * export async function adminAction(): Promise<Result> {
 *   const guard = await requireAdmin();
 *   if (!guard.success) return { success: false, errorCode: guard.errorCode };
 *   // guard.session.user.id 사용 가능
 * }
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const session = await getSession();
  if (!session?.user?.id) return { success: false, errorCode: "UNAUTHENTICATED" };
  if (!isAdminRole(session.user.role)) return { success: false, errorCode: "FORBIDDEN" };
  return { success: true, session };
}
