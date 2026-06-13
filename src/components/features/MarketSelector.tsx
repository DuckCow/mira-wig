"use client";

import { useTransition } from "react";
import { setMarket } from "@/app/actions/market";
import { MARKET_CODES, MARKET_CONFIGS, type MarketCode } from "@/lib/market/types";

export function MarketSelector({ current }: { current: MarketCode }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={isPending}
      aria-label="마켓 선택"
      onChange={(e) => {
        const code = e.target.value;
        startTransition(async () => {
          await setMarket(code);
        });
      }}
      className="text-xs border border-gray-300 rounded px-1.5 py-1 text-gray-600 bg-white disabled:opacity-60"
    >
      {MARKET_CODES.map((code) => (
        <option key={code} value={code}>
          {MARKET_CONFIGS[code].label}
        </option>
      ))}
    </select>
  );
}
