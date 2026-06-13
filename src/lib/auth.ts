// ============================================================
// lib/auth.ts — NextAuth 설정 (STRICT 존)
// 컴포넌트는 이 파일을 직접 import하지 않는다.
// 세션 조회는 lib/session.ts 헬퍼를 통해서만.
// ============================================================
import "server-only";

import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { DefaultSession, NextAuthOptions } from "next-auth";
import { db } from "./db";

// ── 타입 보강 ─────────────────────────────────────────────────

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      role?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}

// ── 헬퍼 ─────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`환경변수 ${key}가 설정되지 않았습니다.`);
  return value;
}

// ── NextAuth 설정 ─────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id ?? "";
      session.user.role = token.role;
      return session;
    },
  },
};
