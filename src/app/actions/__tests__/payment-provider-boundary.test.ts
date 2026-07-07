import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { MarketCode } from "@/lib/market/types";
import {
  PROVIDER_REGISTRY,
  PaymentMethod,
  PaymentMode,
  type ProviderRegistryEntry,
} from "@/lib/payment/providers/routing";
import { createProviderFactoryContext, type ProviderBoundarySession } from "../payment-provider-boundary";

describe("payment provider action boundary", () => {
  it("keeps LIVE liveGuard blocked without registry allowlist evidence", () => {
    const context = createProviderFactoryContext(
      krwSession(),
      MarketCode.KR,
      PaymentMethod.CARD,
      tossLiveResolution(),
    );

    expect(context.liveGuard).toEqual({
      kind: "blocked",
      liveEnabled: false,
      reason: "provider is not live-enabled for context",
    });
  });

  it("allows LIVE liveGuard only from registry allowlist evidence", () => {
    const registry = {
      ...PROVIDER_REGISTRY,
      [PaymentProvider.TOSS]: liveEnabled(PROVIDER_REGISTRY.TOSS),
    };

    const context = createProviderFactoryContext(
      krwSession(),
      MarketCode.KR,
      PaymentMethod.CARD,
      tossLiveResolution(),
      { registry },
    );

    expect(context.liveGuard).toEqual({ kind: "allowed", liveEnabled: true });
  });
});

function krwSession(): ProviderBoundarySession {
  return { totalAmount: 12_000, currency: "KRW" };
}

function tossLiveResolution() {
  return {
    selectedProvider: PaymentProvider.TOSS,
    mode: PaymentMode.LIVE,
    ruleId: "d1a.kr.card.krw",
  };
}

function liveEnabled(entry: ProviderRegistryEntry): ProviderRegistryEntry {
  return {
    ...entry,
    liveEnabled: [{ market: MarketCode.KR, method: PaymentMethod.CARD, currency: "KRW" }],
  };
}
