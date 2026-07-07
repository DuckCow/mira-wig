import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { MarketCode } from "@/lib/market/types";
import { TOSS_LIVE_SECRET_KEY, TOSS_SANDBOX_SECRET_KEY } from "@/lib/payment/providers/credentials";
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

  it("adds Toss SANDBOX action-adapter credential checks without exposing values", () => {
    const sentinel = "sandbox_secret_value_do_not_leak";
    const context = createProviderFactoryContext(
      krwSession(),
      MarketCode.KR,
      PaymentMethod.CARD,
      tossSandboxResolution(),
      { env: { [TOSS_SANDBOX_SECRET_KEY]: sentinel } },
    );

    expect(context.credentials).toEqual([{ name: TOSS_SANDBOX_SECRET_KEY, required: true, present: true }]);
    expect(JSON.stringify(context.credentials)).not.toContain(sentinel);
  });

  it("uses the Toss LIVE action-adapter credential name for LIVE contexts", () => {
    const context = createProviderFactoryContext(
      krwSession(),
      MarketCode.KR,
      PaymentMethod.CARD,
      tossLiveResolution(),
      { env: {} },
    );

    expect(context.credentials).toEqual([{ name: TOSS_LIVE_SECRET_KEY, required: true, present: false }]);
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

function tossSandboxResolution() {
  return {
    selectedProvider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    ruleId: "d1a.kr.card.krw",
  };
}

function liveEnabled(entry: ProviderRegistryEntry): ProviderRegistryEntry {
  return {
    ...entry,
    liveEnabled: [{ market: MarketCode.KR, method: PaymentMethod.CARD, currency: "KRW" }],
  };
}
