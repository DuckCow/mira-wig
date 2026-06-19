"use client";

// ============================================================
// 스타일 상세 — 마켓 노출 토글 섹션
// MARKET_CODES 순서대로 KR/US/JP 토글. 활성화 시 warnings → Toast.
// ============================================================

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { setStyleMarketAvailabilityAction } from "@/app/actions/admin/market-price";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import { MARKET_CODES, MARKET_CONFIGS, type MarketCode } from "@/lib/market/types";
import type { MarketAvailabilityRow } from "@/lib/admin-catalog.types";

interface Props {
  wigStyleId: string;
  markets: MarketAvailabilityRow[];
}

export function MarketAvailabilitySection({ wigStyleId, markets }: Props) {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function getIsActive(marketCode: string): boolean {
    return markets.find((m) => m.marketCode === marketCode)?.isActive ?? false;
  }

  function handleToggle(marketCode: MarketCode, nextActive: boolean) {
    startTransition(async () => {
      const result = await setStyleMarketAvailabilityAction(wigStyleId, marketCode, nextActive);
      if (!result.success) {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
        return;
      }
      if (result.warnings.length > 0) {
        const skus = result.warnings.map((w) => w.sku).join(", ");
        showToast({
          message: `${marketCode} 마켓에 노출했지만 가격 미설정 variant: ${skus}`,
          variant: "warning",
          duration: 6000,
        });
      } else if (nextActive) {
        showToast({ message: `${MARKET_CONFIGS[marketCode].label} 마켓에 노출합니다.`, variant: "success" });
      } else {
        showToast({ message: `${MARKET_CONFIGS[marketCode].label} 마켓에서 숨겼습니다.`, variant: "warning" });
      }
      router.refresh();
    });
  }

  return (
    <Card title="마켓 노출 설정">
      <div className="flex flex-col gap-3">
        {MARKET_CODES.map((code) => {
          const active = getIsActive(code);
          const config = MARKET_CONFIGS[code];
          return (
            <div
              key={code}
              className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-800">{config.label}</span>
                <Badge variant={active ? "active" : "inactive"}>
                  {active ? "노출 중" : "미노출"}
                </Badge>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleToggle(code, !active)}
                className={`px-3 py-1.5 text-sm rounded disabled:opacity-40 ${
                  active
                    ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    : "bg-gray-900 text-white hover:bg-gray-700"
                }`}
              >
                {active ? "숨기기" : "노출하기"}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
