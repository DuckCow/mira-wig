// ============================================================
// lib/session.ts — 서버 세션 조회 헬퍼 (서버 전용)
// 각 페이지에서 getServerSession(authOptions)를 중복 호출하지 않고
// 이 헬퍼만 사용한다.
// ============================================================
import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import type { Session } from "next-auth";

export type { Session };

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function getRequiredSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("인증이 필요합니다.");
  return session;
}
