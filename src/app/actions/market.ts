"use server";

// ============================================================
// app/actions/market.ts — 마켓 전환 서버 액션
// 클라이언트는 쿠키를 직접 쓰지 말고 이 액션을 통해서만 전환한다.
// 쿠키 set은 서버 액션에서만 가능 (서버 컴포넌트는 읽기 전용).
// ============================================================

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isMarketCode, MARKET_COOKIE } from "@/lib/market/types";

export async function setMarket(code: string): Promise<void> {
  if (!isMarketCode(code)) return;
  const jar = await cookies();
  jar.set(MARKET_COOKIE, code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1년
    httpOnly: true,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
