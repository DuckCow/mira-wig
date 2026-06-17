// ============================================================
// app/api/__mock-storage/route.ts — 로컬 개발 전용 mock 스토리지
// ------------------------------------------------------------
// MockStorageProvider가 발급하는 업로드 URL의 수신 엔드포인트.
// 프로덕션에서는 이 경로로 트래픽이 오지 않는다 (STORAGE_PROVIDER≠mock).
//
// PUT /api/__mock-storage?key={key}
//   → 바디를 인메모리 Map에 보관. 서버 재시작 시 사라짐(데모 전용, 무방).
// GET /api/__mock-storage?key={key}
//   → 1) 업로드 스토어에 있으면 해당 바이트 반환 (= 사용자가 올린 before 셀카)
//      2) demo-fitting-result/{variantId} 키면 public/demo-fitting/{variantId}.jpg 시도
//      3) 없으면 1×1 회색 PNG 폴백
// ============================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

// 인메모리 업로드 스토어 — 서버 재시작 시 초기화됨 (데모 전용)
const uploadStore = new Map<string, { buffer: ArrayBuffer; contentType: string }>();

// 데모: canned after 이미지 경로 — 실 VTO provider 연동 시 제거
const DEMO_RESULT_PREFIX = "demo-fitting-result";
const DEMO_FITTING_DIR = join(process.cwd(), "public", "demo-fitting");

// 1×1 회색 PNG (폴백). 외부 URL 없이 플레이스홀더 이미지 제공.
const GRAY_1PX_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new NextResponse("missing key", { status: 400 });
  const contentType = req.headers.get("Content-Type") ?? "application/octet-stream";
  const buffer = await req.arrayBuffer();
  uploadStore.set(key, { buffer, contentType });
  return new NextResponse(null, { status: 200 });
}

export function GET(req: NextRequest): NextResponse {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new NextResponse("missing key", { status: 400 });

  // 1. 업로드 스토어: 사용자가 올린 before 셀카
  const stored = uploadStore.get(key);
  if (stored) {
    return new NextResponse(stored.buffer, {
      headers: { "Content-Type": stored.contentType },
    });
  }

  // 2. 데모: canned after 이미지 — 실 VTO provider 연동 시 제거
  if (key.startsWith(`${DEMO_RESULT_PREFIX}/`)) {
    const fileKey = key.slice(DEMO_RESULT_PREFIX.length + 1);
    try {
      const bytes = new Uint8Array(readFileSync(join(DEMO_FITTING_DIR, `${fileKey}.jpg`)));
      return new NextResponse(bytes, { headers: { "Content-Type": "image/jpeg" } });
    } catch {
      // 자산 없는 variant → 폴백으로 안 깨지게
    }
  }

  // 3. 폴백: 회색 PNG
  return new NextResponse(GRAY_1PX_PNG, { headers: { "Content-Type": "image/png" } });
}
