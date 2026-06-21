// ============================================================
// app/api/mock-storage/route.ts — 로컬 개발 전용 mock 스토리지
// ------------------------------------------------------------
// MockStorageProvider가 발급하는 업로드 URL의 수신 엔드포인트.
// mock 전용 — STORAGE_PROVIDER=mock + NODE_ENV≠production 에서만 동작한다.
// 그 외 환경에서는 코드 가드가 404로 차단한다(주석이 아니라 코드가 방어).
// 실 provider 연동 시 이 라우트째 제거(핸드오프 §8).
//
// PUT /api/mock-storage?key={key}
//   → 바디를 인메모리 Map에 보관. 서버 재시작 시 사라짐(데모 전용, 무방).
// GET /api/mock-storage?key={key}
//   → 1) 업로드 스토어에 있으면 해당 바이트 반환 (= 사용자가 올린 before 셀카)
//      2) demo-fitting-result/{sku} 키면 public/demo-fitting/{sku}.jpg 시도
//      3) 없으면 1×1 회색 PNG 폴백
//
// CORS: 브라우저가 Content-Type 커스텀 헤더로 PUT 시 preflight(OPTIONS)를 보낸다.
//       origin은 NEXTAUTH_URL(=self)로 제한 — 와일드카드 사용 안 함.
// ============================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

// ── 프로덕션 가드 ────────────────────────────────────────────
// 프로덕션에서만 이 라우트를 닫는다.
// STORAGE_PROVIDER는 보지 않는다 — catalogStorage/fittingStorage 분리 후
// fittingStorage는 항상 Mock이고 STORAGE_PROVIDER 값과 무관하게 이 라우트에
// 의존한다. STORAGE_PROVIDER=s3(카탈로그 전환)여도 피팅 데모가 작동해야 한다.

function mockGuard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  return null;
}

// ── CORS 헤더 (self-origin, mock/로컬 전용) ───────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ── 인메모리 업로드 스토어 ────────────────────────────────────
// 서버 재시작 시 초기화됨 (데모 전용)

const uploadStore = new Map<string, { buffer: ArrayBuffer; contentType: string }>();

// ── 데모 canned after 이미지 ──────────────────────────────────
// 실 VTO provider 연동 시 제거(핸드오프 §8)

const DEMO_RESULT_PREFIX = "demo-fitting-result";
const DEMO_FITTING_DIR = join(process.cwd(), "public", "demo-fitting");

// ── 1×1 회색 PNG 폴백 ────────────────────────────────────────

const GRAY_1PX_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

// ── 핸들러 ───────────────────────────────────────────────────

// preflight — Content-Type 커스텀 헤더가 붙은 PUT 전에 브라우저가 보낸다
export function OPTIONS(): NextResponse {
  return mockGuard() ?? new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const blocked = mockGuard();
  if (blocked) return blocked;

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new NextResponse("missing key", { status: 400, headers: corsHeaders() });

  const contentType = req.headers.get("Content-Type") ?? "application/octet-stream";
  const buffer = await req.arrayBuffer();
  uploadStore.set(key, { buffer, contentType });
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

export function GET(req: NextRequest): NextResponse {
  const blocked = mockGuard();
  if (blocked) return blocked;

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new NextResponse("missing key", { status: 400, headers: corsHeaders() });

  // 1. 업로드 스토어: 사용자가 올린 before 셀카
  const stored = uploadStore.get(key);
  if (stored) {
    return new NextResponse(stored.buffer, {
      headers: { ...corsHeaders(), "Content-Type": stored.contentType },
    });
  }

  // 2. 데모: canned after 이미지 — 실 VTO provider 연동 시 제거
  if (key.startsWith(`${DEMO_RESULT_PREFIX}/`)) {
    const fileKey = key.slice(DEMO_RESULT_PREFIX.length + 1);
    try {
      const bytes = new Uint8Array(readFileSync(join(DEMO_FITTING_DIR, `${fileKey}.jpg`)));
      return new NextResponse(bytes, { headers: { ...corsHeaders(), "Content-Type": "image/jpeg" } });
    } catch {
      // 자산 없는 sku → 폴백으로 안 깨지게
    }
  }

  // 3. 폴백: 회색 PNG
  return new NextResponse(GRAY_1PX_PNG, { headers: { ...corsHeaders(), "Content-Type": "image/png" } });
}
