// ============================================================
// app/api/__mock-storage/route.ts — 로컬 개발 전용 mock 스토리지
// ------------------------------------------------------------
// MockStorageProvider가 발급하는 업로드 URL의 수신 엔드포인트.
// 프로덕션에서는 이 경로로 트래픽이 오지 않는다 (STORAGE_PROVIDER≠mock).
//
// PUT /api/__mock-storage?key={key}
//   → body 무시, 200 반환 (파일 저장 안 함)
// GET /api/__mock-storage?key={key}
//   → 1×1 회색 PNG 플레이스홀더 반환
// ============================================================

import { NextRequest, NextResponse } from "next/server";

// 1×1 회색 PNG (base64). 외부 URL 없이 플레이스홀더 이미지 제공.
const GRAY_1PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export function PUT(_req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 200 });
}

export function GET(req: NextRequest): NextResponse {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new NextResponse("missing key", { status: 400 });
  return new NextResponse(GRAY_1PX_PNG, {
    headers: { "Content-Type": "image/png" },
  });
}
