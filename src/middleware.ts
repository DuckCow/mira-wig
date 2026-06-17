// ============================================================
// middleware.ts — /admin/* 심층방어 미들웨어
// ------------------------------------------------------------
// 진짜 보안 경계는 서버 액션의 requireAdmin()이다.
// 여기서는 비-ADMIN이 어드민 URL 자체를 보지 못하도록 UX 차원에서 막는다.
//
// Edge runtime에서 동작하므로 Node.js 전용 API(Prisma 등) 사용 금지.
// JWT strategy이므로 getToken으로 쿠키 내 JWT를 직접 읽는다(DB 조회 없음).
// role 판정은 isAdminRole(admin-role.ts)로 — 서버 액션과 동일 로직.
// ============================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminRole } from "@/lib/admin-role";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = await getToken({ req: request });

  if (!token) {
    // 미인증 → 로그인 페이지로 리다이렉트. 로그인 후 원래 경로로 돌아올 수 있도록 callbackUrl 포함.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!isAdminRole(token.role)) {
    // 인증됐으나 ADMIN 아님 → 홈으로 리다이렉트.
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // /admin 및 /admin/* 경로에만 미들웨어 적용.
  matcher: ["/admin/:path*"],
};
