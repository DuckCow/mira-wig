// ============================================================
// lib/market/resolve.ts — 서버 사이드 마켓 결정 (서버 전용)
// next/headers (cookies + geo 헤더)로 현재 요청의 마켓을 결정한다.
//
// 마켓 결정은 서버의 단일 출처: 클라이언트는 이 결과를 props/context로
// 전달받을 뿐, 쿠키를 직접 읽어 재결정하지 않는다.
// → hydration mismatch 구조적 방지
// ============================================================
import "server-only";

import { cookies, headers } from "next/headers";
import {
  MARKET_CONFIGS,
  MARKET_COOKIE,
  resolveMarketCode,
  type MarketCode,
  type MarketConfig,
} from "./types";

// geo 소스 추상화: 배포 환경마다 헤더명이 다를 수 있어 여기서만 처리한다.
// 로컬/미감지 시 undefined → resolveMarketCode가 폴백 적용.
function readGeoCountry(headerStore: Awaited<ReturnType<typeof headers>>): string | undefined {
  return (
    headerStore.get("x-vercel-ip-country") ??
    headerStore.get("cf-ipcountry") ??
    undefined
  );
}

export async function getCurrentMarketCode(): Promise<MarketCode> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const cookieValue = cookieStore.get(MARKET_COOKIE)?.value;
  const geoCountry = readGeoCountry(headerStore);
  return resolveMarketCode(cookieValue, geoCountry);
}

export async function getCurrentMarket(): Promise<MarketConfig> {
  const code = await getCurrentMarketCode();
  return MARKET_CONFIGS[code];
}
