// ============================================================
// STRICT 존 — lib/admin.ts 행동 검증
// requireAdmin: 미인증 / CUSTOMER / ADMIN 세 경로
// isAdminRole:  순수 판정 엣지케이스
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

// ── 모듈 모킹 (hoisted) ───────────────────────────────────────

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { getSession } from "@/lib/session";
import { requireAdmin, isAdminRole } from "../admin";

const mockGetSession = vi.mocked(getSession);

// ── 픽스처 ───────────────────────────────────────────────────

function makeSession(role: string | undefined): Session {
  return {
    user: { id: "user-1", email: "test@test.com", name: "Test", role },
    expires: "2099-01-01",
  };
}

// ── isAdminRole (순수 판정) ───────────────────────────────────

describe("isAdminRole", () => {
  it("role === 'ADMIN' → true", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("role === 'CUSTOMER' → false", () => {
    expect(isAdminRole("CUSTOMER")).toBe(false);
  });

  it("role === undefined → false", () => {
    expect(isAdminRole(undefined)).toBe(false);
  });

  it("role === null → false", () => {
    expect(isAdminRole(null)).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(isAdminRole("")).toBe(false);
  });
});

// ── requireAdmin (I/O 포함) ───────────────────────────────────

describe("requireAdmin — 미인증", () => {
  beforeEach(() => vi.clearAllMocks());

  it("세션 없으면 success: false + UNAUTHENTICATED를 반환한다", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });
});

describe("requireAdmin — CUSTOMER", () => {
  beforeEach(() => vi.clearAllMocks());

  it("CUSTOMER role이면 success: false + FORBIDDEN을 반환한다", async () => {
    mockGetSession.mockResolvedValue(makeSession("CUSTOMER"));
    const result = await requireAdmin();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });

  it("role이 undefined이면 success: false + FORBIDDEN을 반환한다", async () => {
    mockGetSession.mockResolvedValue(makeSession(undefined));
    const result = await requireAdmin();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
  });
});

describe("requireAdmin — ADMIN", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ADMIN role이면 success: true를 반환한다", async () => {
    mockGetSession.mockResolvedValue(makeSession("ADMIN"));
    const result = await requireAdmin();
    expect(result.success).toBe(true);
  });

  it("통과 시 session 객체를 포함한다", async () => {
    const session = makeSession("ADMIN");
    mockGetSession.mockResolvedValue(session);
    const result = await requireAdmin();
    if (result.success) expect(result.session).toBe(session);
    else expect.unreachable("success: true여야 합니다");
  });
});
