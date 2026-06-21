// ============================================================
// STRICT 존 — fitting 액션 검증 동작 테스트
// getUploadUrlAction / startFittingAction / pollFittingAction
// 인증 거부·타입 거부·FittingException 코드 매핑을 검증한다.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
// FittingException은 types.ts에서 직접 import — @/lib/fitting(모킹 대상)에서 가져오면 호이스팅 충돌
import { FittingException } from "@/lib/fitting/types";

// ── 모듈 모킹 (hoisted) ───────────────────────────────────────

const mockStartFitting = vi.fn();
const mockPollFitting = vi.fn();

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/storage", () => ({
  fittingStorage: {
    getUploadUrl: vi.fn().mockResolvedValue({
      uploadUrl: "https://mock-bucket/upload",
      key: "user-upload/uid1/abc.jpg",
      requiredHeaders: { "Content-Type": "image/jpeg" },
      expiresInSeconds: 300,
    }),
    getViewUrl: vi.fn().mockResolvedValue("https://mock-bucket/view"),
  },
}));

vi.mock("@/lib/market", () => ({
  getCurrentMarketCode: vi.fn().mockResolvedValue("KR"),
}));

vi.mock("@/lib/fitting", () => ({
  startFitting: (...args: unknown[]): unknown => mockStartFitting(...args),
  pollFitting: (...args: unknown[]): unknown => mockPollFitting(...args),
  FittingException,
}));

import { getSession } from "@/lib/session";
import { getUploadUrlAction, startFittingAction, pollFittingAction } from "../fitting";

const mockGetSession = vi.mocked(getSession);

const FAKE_SESSION: Session = {
  user: { id: "user-1", email: "test@test.com", name: "Test" },
  expires: "2099-01-01",
};

// ── getUploadUrlAction ────────────────────────────────────────

describe("getUploadUrlAction — 인증", () => {
  beforeEach(() => vi.clearAllMocks());

  it("세션 없으면 UNAUTHENTICATED를 반환한다", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await getUploadUrlAction("image/jpeg");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });

  it("세션 있으면 success를 반환한다", async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    const result = await getUploadUrlAction("image/jpeg");
    expect(result.success).toBe(true);
  });
});

describe("getUploadUrlAction — Content-Type 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(FAKE_SESSION);
  });

  it.each(["image/gif", "image/bmp", "text/plain", "application/octet-stream"])(
    "%s → UNSUPPORTED_TYPE",
    async (ct) => {
      const result = await getUploadUrlAction(ct);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errorCode).toBe("UNSUPPORTED_TYPE");
    },
  );

  it.each(["image/jpeg", "image/png", "image/webp"])("%s → 허용", async (ct) => {
    const result = await getUploadUrlAction(ct);
    expect(result.success).toBe(true);
  });

  it("uploadUrl과 key를 반환한다", async () => {
    const result = await getUploadUrlAction("image/jpeg");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.uploadUrl).toBeTruthy();
      expect(result.key).toMatch(/^user-upload\//);
    }
  });
});

// ── startFittingAction ────────────────────────────────────────

describe("startFittingAction — 인증", () => {
  beforeEach(() => vi.clearAllMocks());

  it("세션 없으면 UNAUTHENTICATED 코드를 반환한다", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await startFittingAction("user-upload/u1/a.jpg", "v1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });
});

describe("startFittingAction — FittingException 코드 매핑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(FAKE_SESSION);
  });

  it("SOURCE_KEY_INVALID 예외 → errorCode로 반환한다", async () => {
    mockStartFitting.mockRejectedValue(
      new FittingException("SOURCE_KEY_INVALID", "잘못된 키"),
    );
    const result = await startFittingAction("bad-key", "v1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("SOURCE_KEY_INVALID");
  });

  it("VARIANT_UNAVAILABLE 예외 → errorCode로 반환한다", async () => {
    mockStartFitting.mockRejectedValue(
      new FittingException("VARIANT_UNAVAILABLE", "마켓 비활성"),
    );
    const result = await startFittingAction("user-upload/u1/a.jpg", "v1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("VARIANT_UNAVAILABLE");
  });

  it("성공 시 fittingId를 반환한다", async () => {
    mockStartFitting.mockResolvedValue("fitting-123");
    const result = await startFittingAction("user-upload/u1/a.jpg", "v1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.fittingId).toBe("fitting-123");
  });
});

// ── pollFittingAction ─────────────────────────────────────────

describe("pollFittingAction — 실패 경로 코드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(FAKE_SESSION);
  });

  it("세션 없으면 UNAUTHENTICATED 코드를 반환한다", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await pollFittingAction("fitting-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
  });

  it("provider failed → PROVIDER_ERROR 코드를 반환한다", async () => {
    mockPollFitting.mockResolvedValue({
      status: "failed",
      fittingId: "fitting-1",
      reason: "AI_MOCK_FORCE_FAIL=true",
    });
    const result = await pollFittingAction("fitting-1");
    expect(result.success).toBe(true);
    if (result.success && result.status === "failed") {
      expect(result.errorCode).toBe("PROVIDER_ERROR");
    }
  });

  it("UNAUTHORIZED 예외 → errorCode로 반환한다", async () => {
    mockPollFitting.mockRejectedValue(
      new FittingException("UNAUTHORIZED", "접근 권한 없음"),
    );
    const result = await pollFittingAction("fitting-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHORIZED");
  });
});
