// ============================================================
// STRICT 존 — lib/storage named provider 분리 검증
// ------------------------------------------------------------
// catalogStorage: STORAGE_PROVIDER env에 따라 S3/Mock이 선택되는가.
// fittingStorage: STORAGE_PROVIDER와 무관하게 항상 Mock인가.
//   → STORAGE_PROVIDER=s3로 켜도 피팅 Mock 유지가 핵심 보장.
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";

// catalogStorage/fittingStorage는 모듈 최초 로드 시 env를 읽어 인스턴스가 확정된다.
// 각 테스트마다 vi.resetModules() → dynamic import로 재로드해야 env 변경이 반영된다.

const AWS_ENV = { AWS_REGION: "ap-northeast-2", AWS_S3_BUCKET: "test-bucket" };

afterEach(() => {
  vi.resetModules();
  delete process.env.STORAGE_PROVIDER;
  delete process.env.AWS_REGION;
  delete process.env.AWS_S3_BUCKET;
});

// ── catalogStorage ────────────────────────────────────────────

describe("catalogStorage — STORAGE_PROVIDER 스위치", () => {
  it("STORAGE_PROVIDER=mock이면 name이 'mock'이다", async () => {
    vi.resetModules();
    process.env.STORAGE_PROVIDER = "mock";
    const { catalogStorage } = await import("@/lib/storage");
    expect(catalogStorage.name).toBe("mock");
  });

  it("STORAGE_PROVIDER 미설정이면 name이 's3'이다", async () => {
    vi.resetModules();
    delete process.env.STORAGE_PROVIDER;
    Object.assign(process.env, AWS_ENV);
    const { catalogStorage } = await import("@/lib/storage");
    expect(catalogStorage.name).toBe("s3");
  });

  it("STORAGE_PROVIDER=s3이면 name이 's3'이다", async () => {
    vi.resetModules();
    process.env.STORAGE_PROVIDER = "s3";
    Object.assign(process.env, AWS_ENV);
    const { catalogStorage } = await import("@/lib/storage");
    expect(catalogStorage.name).toBe("s3");
  });
});

// ── fittingStorage ────────────────────────────────────────────

describe("fittingStorage — STORAGE_PROVIDER와 무관하게 항상 Mock", () => {
  it("STORAGE_PROVIDER=mock이어도 name이 'mock'이다", async () => {
    vi.resetModules();
    process.env.STORAGE_PROVIDER = "mock";
    const { fittingStorage } = await import("@/lib/storage");
    expect(fittingStorage.name).toBe("mock");
  });

  it("STORAGE_PROVIDER=s3여도 name이 'mock'이다 — 핵심 보장", async () => {
    vi.resetModules();
    process.env.STORAGE_PROVIDER = "s3";
    Object.assign(process.env, AWS_ENV);
    const { fittingStorage } = await import("@/lib/storage");
    expect(fittingStorage.name).toBe("mock");
  });

  it("STORAGE_PROVIDER 미설정이어도 name이 'mock'이다", async () => {
    vi.resetModules();
    delete process.env.STORAGE_PROVIDER;
    Object.assign(process.env, AWS_ENV);
    const { fittingStorage } = await import("@/lib/storage");
    expect(fittingStorage.name).toBe("mock");
  });
});
