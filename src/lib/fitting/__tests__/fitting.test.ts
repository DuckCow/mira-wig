// ============================================================
// STRICT 존 행동 검증 테스트 — lib/fitting (순수 함수 + 통합)
// ============================================================
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { validateSourceKey, assertKeyNotUrl } from "../validation";
import { FittingException } from "../types";
import { startFitting, pollFitting } from "../db";
import { getFittingProvider } from "@/lib/ai";
import { MockFittingProvider, MOCK_RESULT_KEY } from "@/lib/ai/mock";

// ── 순수 함수: validateSourceKey ─────────────────────────────

describe("validateSourceKey", () => {
  it("유효한 user-upload key는 통과한다", () => {
    expect(() => validateSourceKey(`user-upload/u1/${randomUUID()}.jpg`)).not.toThrow();
  });

  it("빈 문자열은 SOURCE_KEY_INVALID", () => {
    expect(() => validateSourceKey("")).toThrow(FittingException);
  });

  it("http URL은 SOURCE_KEY_INVALID", () => {
    expect(() => validateSourceKey("http://example.com/img.jpg")).toThrow(FittingException);
  });

  it("https URL은 SOURCE_KEY_INVALID", () => {
    expect(() => validateSourceKey("https://s3.amazonaws.com/key")).toThrow(FittingException);
  });

  it("user-upload/ 아닌 경로는 SOURCE_KEY_INVALID", () => {
    expect(() => validateSourceKey("wig-style/abc.jpg")).toThrow(FittingException);
  });

  it("오류 code가 SOURCE_KEY_INVALID임을 확인한다", () => {
    let caught: unknown;
    try { validateSourceKey(""); } catch (e) { caught = e; }
    if (caught instanceof FittingException) {
      expect(caught.code).toBe("SOURCE_KEY_INVALID");
    } else {
      expect.unreachable("FittingException이어야 합니다");
    }
  });
});

// ── 순수 함수: assertKeyNotUrl ────────────────────────────────

describe("assertKeyNotUrl", () => {
  it("S3 key는 통과한다", () => {
    expect(() => assertKeyNotUrl("tryon-result/u1/abc.jpg", "resultImageKey")).not.toThrow();
  });

  it("http URL은 FittingException", () => {
    expect(() => assertKeyNotUrl("http://cdn.example.com/img.jpg", "resultImageKey")).toThrow(FittingException);
  });
});

// ── provider 해석 ─────────────────────────────────────────────

describe("getFittingProvider", () => {
  it("AI_PROVIDER 없으면 mock을 반환한다", () => {
    const provider = getFittingProvider();
    expect(provider.name).toBe("mock");
    expect(provider.mode).toBe("server-async");
  });

  it("mock provider는 MockFittingProvider의 인스턴스이다", () => {
    expect(getFittingProvider()).toBeInstanceOf(MockFittingProvider);
  });

  it("실패 시뮬은 공유 인터페이스 밖(AI_MOCK_FORCE_FAIL env)으로만 제어된다", async () => {
    const provider = getFittingProvider();
    // 인터페이스 시그니처에 shouldFail 같은 파라미터가 없음을 타입으로 확인
    // (requestFitting / getJob 둘 다 boolean 파라미터 없음)
    const { providerJobId } = await provider.requestFitting({
      sourceImageKey: "user-upload/u1/test.jpg",
      variantId: "v1",
    });
    expect(providerJobId).toMatch(/^mock-job-/);
  });
});

// ── mock getJob: 실패 시뮬 ────────────────────────────────────

describe("MockFittingProvider — AI_MOCK_FORCE_FAIL", () => {
  it("AI_MOCK_FORCE_FAIL=true이면 getJob이 failed를 반환한다", async () => {
    const orig = process.env.AI_MOCK_FORCE_FAIL;
    process.env.AI_MOCK_FORCE_FAIL = "true";
    try {
      const provider = new MockFittingProvider();
      const result = await provider.getJob("any-job");
      expect(result.status).toBe("failed");
      if (result.status === "failed") expect(result.reason).toBeTruthy();
    } finally {
      process.env.AI_MOCK_FORCE_FAIL = orig;
    }
  });

  it("AI_MOCK_FORCE_FAIL 없으면 succeeded를 반환한다", async () => {
    const orig = process.env.AI_MOCK_FORCE_FAIL;
    delete process.env.AI_MOCK_FORCE_FAIL;
    try {
      const result = await new MockFittingProvider().getJob("any");
      expect(result.status).toBe("succeeded");
    } finally {
      process.env.AI_MOCK_FORCE_FAIL = orig;
    }
  });

  it("성공 결과의 resultImageKey는 URL이 아닌 key이다", async () => {
    const result = await new MockFittingProvider().getJob("any");
    if (result.status === "succeeded") {
      expect(result.result.resultImageKey).not.toMatch(/^https?:\/\//);
      expect(result.result.resultImageKey).toBe(MOCK_RESULT_KEY);
    }
  });
});

// ── 통합 테스트 픽스처 ────────────────────────────────────────

interface Ctx {
  userId: string;
  variantId: string;
  styleId: string;
}

function makeId(): string { return randomUUID().slice(0, 8); }
const SOURCE_KEY = `user-upload/uid123/${randomUUID()}.jpg`;

async function setupCtx(): Promise<Ctx> {
  const id = makeId();
  await db.user.create({ data: { id, email: `${id}@test.com`, role: "CUSTOMER" } });
  await db.market.upsert({
    where: { code: "KR" },
    update: {},
    create: { code: "KR", currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  });
  const style = await db.wigStyle.create({
    data: {
      name: `Style ${id}`, category: "FASHION", tags: [],
      availableMarkets: { create: { marketCode: "KR", isActive: true } },
    },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id, color: "블랙", colorHex: null,
      length: "long", curl: "straight", price: 85000,
      stock: 10, sku: `SKU_${id}`,
    },
  });
  return { userId: id, variantId: variant.id, styleId: style.id };
}

async function cleanupCtx(ctx: Ctx): Promise<void> {
  await db.fitting.deleteMany({ where: { userId: ctx.userId } });
  await db.wigStyle.deleteMany({ where: { id: ctx.styleId } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}

// ── 통합: PENDING → SUCCEEDED 전이 ───────────────────────────

describe("startFitting + pollFitting — 성공 경로", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupCtx(); });
  afterEach(async () => { await cleanupCtx(ctx); });

  it("startFitting이 fittingId를 반환한다", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    expect(fittingId).toBeTruthy();
  });

  it("startFitting 직후 DB 상태가 PENDING이다", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    const row = await db.fitting.findUniqueOrThrow({ where: { id: fittingId } });
    expect(row.status).toBe("PENDING");
    expect(row.providerJobId).toMatch(/^mock-job-/);
  });

  it("DB sourceImageKey는 URL이 아닌 key이다 (규칙 4-4)", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    const row = await db.fitting.findUniqueOrThrow({ where: { id: fittingId } });
    expect(row.sourceImageKey).not.toMatch(/^https?:\/\//);
    expect(row.sourceImageKey).toBe(SOURCE_KEY);
  });

  it("pollFitting이 SUCCEEDED로 전이하고 resultImageKey를 영속한다", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    const result = await pollFitting(fittingId, ctx.userId);
    expect(result.status).toBe("succeeded");
    if (result.status === "succeeded") {
      // mock이 variantId 기반 canned key를 반환함 — 정확한 값보다 규칙 4-4 준수 여부를 검증
      expect(result.resultImageKey).not.toMatch(/^https?:\/\//);
      expect(result.resultImageKey).toBeTruthy();
    }
  });

  it("DB resultImageKey는 URL이 아닌 key이다 (규칙 4-4)", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    await pollFitting(fittingId, ctx.userId);
    const row = await db.fitting.findUniqueOrThrow({ where: { id: fittingId } });
    // 규칙 4-4: DB에 URL이 아닌 S3 key만 저장해야 한다
    expect(row.resultImageKey).not.toMatch(/^https?:\/\//);
    expect(row.resultImageKey).toBeTruthy();
  });
});

// ── 통합: 폴링 멱등성 ────────────────────────────────────────

describe("pollFitting — 멱등성 (SUCCEEDED)", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupCtx(); });
  afterEach(async () => { await cleanupCtx(ctx); });

  it("두 번째 폴링도 동일한 resultImageKey를 반환한다", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    const r1 = await pollFitting(fittingId, ctx.userId);
    const r2 = await pollFitting(fittingId, ctx.userId);
    expect(r1).toEqual(r2);
  });

  it("SUCCEEDED 후 AI_MOCK_FORCE_FAIL=true여도 재폴링은 SUCCEEDED를 반환한다", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    await pollFitting(fittingId, ctx.userId); // → SUCCEEDED
    const orig = process.env.AI_MOCK_FORCE_FAIL;
    process.env.AI_MOCK_FORCE_FAIL = "true";
    try {
      const r2 = await pollFitting(fittingId, ctx.userId);
      expect(r2.status).toBe("succeeded"); // provider 재호출 없이 저장된 결과 반환
    } finally {
      process.env.AI_MOCK_FORCE_FAIL = orig;
    }
  });
});

// ── 통합: FAILED 경로 ────────────────────────────────────────

describe("pollFitting — FAILED 경로", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupCtx(); });
  afterEach(async () => { await cleanupCtx(ctx); });

  it("AI_MOCK_FORCE_FAIL=true이면 FAILED로 전이한다", async () => {
    const orig = process.env.AI_MOCK_FORCE_FAIL;
    process.env.AI_MOCK_FORCE_FAIL = "true";
    try {
      const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
      const result = await pollFitting(fittingId, ctx.userId);
      expect(result.status).toBe("failed");
    } finally {
      process.env.AI_MOCK_FORCE_FAIL = orig;
    }
  });

  it("FAILED 시 failureReason이 DB에 저장된다", async () => {
    const orig = process.env.AI_MOCK_FORCE_FAIL;
    process.env.AI_MOCK_FORCE_FAIL = "true";
    try {
      const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
      await pollFitting(fittingId, ctx.userId);
      const row = await db.fitting.findUniqueOrThrow({ where: { id: fittingId } });
      expect(row.status).toBe("FAILED");
      expect(row.failureReason).toBeTruthy();
      expect(row.resultImageKey).toBeNull();
    } finally {
      process.env.AI_MOCK_FORCE_FAIL = orig;
    }
  });
});

// ── 통합: authz ───────────────────────────────────────────────

describe("pollFitting — authz", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupCtx(); });
  afterEach(async () => { await cleanupCtx(ctx); });

  it("다른 userId로 폴링하면 UNAUTHORIZED를 던진다", async () => {
    const fittingId = await startFitting(ctx.userId, SOURCE_KEY, ctx.variantId, "KR");
    await expect(pollFitting(fittingId, "other-user-id")).rejects.toThrow(FittingException);
    let caught: unknown;
    try {
      await pollFitting(fittingId, "other-user-id");
    } catch (e) {
      caught = e;
    }
    if (caught instanceof FittingException) {
      expect(caught.code).toBe("UNAUTHORIZED");
    } else {
      expect.unreachable("FittingException이어야 합니다");
    }
  });

  it("존재하지 않는 fittingId는 NOT_FOUND를 던진다", async () => {
    let caught: unknown;
    try {
      await pollFitting("nonexistent-id", ctx.userId);
    } catch (e) {
      caught = e;
    }
    if (caught instanceof FittingException) {
      expect(caught.code).toBe("NOT_FOUND");
    } else {
      expect.unreachable("FittingException이어야 합니다");
    }
  });
});
