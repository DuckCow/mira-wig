"use client";

// ============================================================
// 스타일 상세 — variant × 마켓 가격 매트릭스 입력
// 가격이 없는 셀에 "가격없음" Badge 표시. variant 단위로 저장.
// 금액은 최소단위 정수 그대로 전달(변환 없음). USD: 센트(7799=$77.99)
// ============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { setVariantPricesAction } from "@/app/actions/admin/market-price";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import { MARKET_CODES, MARKET_CONFIGS } from "@/lib/market/types";
import type { VariantPriceRow } from "@/lib/admin-catalog.types";

interface Props {
  variantPrices: VariantPriceRow[];
}

type InputMap = Record<string, Record<string, string>>;

function buildInitialInputs(variantPrices: VariantPriceRow[]): InputMap {
  const result: InputMap = {};
  for (const v of variantPrices) {
    result[v.id] = {};
    for (const code of MARKET_CODES) {
      const existing = v.prices.find((p) => p.marketCode === code);
      result[v.id][code] = existing !== undefined ? String(existing.amount) : "";
    }
  }
  return result;
}

export function MarketPriceSection({ variantPrices }: Props) {
  const [inputs, setInputs] = useState<InputMap>(() => buildInitialInputs(variantPrices));
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleInput(variantId: string, marketCode: string, value: string) {
    setInputs((prev) => ({
      ...prev,
      [variantId]: { ...prev[variantId], [marketCode]: value },
    }));
  }

  function handleSave(variantId: string) {
    const variantInputs = inputs[variantId] ?? {};
    const filled = MARKET_CODES.filter((code) => (variantInputs[code] ?? "") !== "");

    if (filled.length === 0) {
      showToast({ message: "저장할 가격을 입력해주세요.", variant: "warning" });
      return;
    }

    const entries = filled.map((code) => ({
      marketCode: code,
      amount: parseInt(variantInputs[code] ?? "", 10),
    }));

    if (entries.some((e) => !Number.isInteger(e.amount) || e.amount < 0)) {
      showToast({ message: "금액은 0 이상의 정수여야 합니다.", variant: "error" });
      return;
    }

    startTransition(async () => {
      const result = await setVariantPricesAction(variantId, entries);
      if (result.success) {
        showToast({ message: "가격이 저장되었습니다.", variant: "success" });
        router.refresh();
      } else {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
      }
    });
  }

  function hasPriceSet(variantId: string, marketCode: string): boolean {
    const v = variantPrices.find((vp) => vp.id === variantId);
    return v?.prices.some((p) => p.marketCode === marketCode) ?? false;
  }

  if (variantPrices.length === 0) {
    return (
      <Card title="마켓별 가격">
        <p className="text-sm text-gray-400">활성 바리언트가 없습니다.</p>
      </Card>
    );
  }

  return (
    <Card title="마켓별 가격">
      <p className="text-xs text-gray-500 mb-4">
        금액은 최소단위 정수 입력 — KRW(₩) · JPY(¥): 그대로(85000), USD($): 센트 기준(7799 = $77.99)
      </p>
      <div className="space-y-4">
        {variantPrices.map((v) => (
          <div key={v.id} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{v.sku}</code>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleSave(v.id)}
                className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40"
              >
                저장
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MARKET_CODES.map((code) => {
                const config = MARKET_CONFIGS[code];
                const noPriceSet = !hasPriceSet(v.id, code);
                return (
                  <div key={code} className="flex flex-col gap-1">
                    <label
                      htmlFor={`price-${v.id}-${code}`}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-500"
                    >
                      {config.currency.symbol} {config.currency.code}
                      {noPriceSet && <Badge variant="warning">가격없음</Badge>}
                    </label>
                    <input
                      id={`price-${v.id}-${code}`}
                      type="number"
                      min={0}
                      step={1}
                      value={inputs[v.id]?.[code] ?? ""}
                      onChange={(e) => handleInput(v.id, code, e.target.value)}
                      placeholder={code === "US" ? "예: 7799" : "예: 85000"}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                      aria-label={`${v.sku} ${config.currency.code} 가격`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
