import { PaymentAdapterExecutionKind, PaymentProvider } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { MarketCode } from "@/lib/market/types";
import {
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
  PAYMENT_PUBLIC_ORIGIN,
  TOSS_LIVE_SECRET_KEY,
  TOSS_SANDBOX_SECRET_KEY,
} from "@/lib/payment/providers/credentials";
import {
  PROVIDER_REGISTRY,
  PaymentMethod,
  PaymentMode,
  type ProviderRegistryEntry,
} from "@/lib/payment/providers/routing";
import {
  createProviderFactoryContext,
  resolveActionConfirmAdapter,
  type ProviderBoundarySession,
} from "../payment-provider-boundary";

const ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED = process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
const ORIGINAL_TOSS_SANDBOX_SECRET_KEY = process.env.TOSS_SANDBOX_SECRET_KEY;
const ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED = process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;

describe("payment provider action boundary", () => {
  afterEach(() => {
    restoreEnv("TOSS_SANDBOX_EXTERNAL_ENABLED", ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED);
    restoreEnv("TOSS_SANDBOX_SECRET_KEY", ORIGINAL_TOSS_SANDBOX_SECRET_KEY);
    restoreEnv("EXIMBAY_CHECKOUT_SANDBOX_ENABLED", ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED);
  });

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

  it("requires only the three Eximbay SANDBOX action configuration names", () => {
    const context = createProviderFactoryContext(
      { totalAmount: 2_999, currency: "USD" },
      MarketCode.US,
      PaymentMethod.CARD,
      {
        selectedProvider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        ruleId: "cfa.us.card.usd",
      },
      {
        env: {
          [EXIMBAY_SANDBOX_API_KEY]: "synthetic-api-key",
          [EXIMBAY_SANDBOX_MID]: "synthetic-mid",
          [PAYMENT_PUBLIC_ORIGIN]: "https://payments.example.test",
        },
      },
    );

    expect(context.credentials).toEqual([
      { name: EXIMBAY_SANDBOX_API_KEY, required: true, present: true },
      { name: EXIMBAY_SANDBOX_MID, required: true, present: true },
      { name: PAYMENT_PUBLIC_ORIGIN, required: true, present: true },
    ]);
  });

  it("installs no Eximbay LIVE action credential authority", () => {
    const context = createProviderFactoryContext(
      { totalAmount: 2_999, currency: "USD" },
      MarketCode.US,
      PaymentMethod.CARD,
      {
        selectedProvider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.LIVE,
        ruleId: "cfa.us.card.usd",
      },
      { env: {} },
    );

    expect(context.credentials).toEqual([]);
    expect(context.liveGuard).toMatchObject({ kind: "blocked", liveEnabled: false });
  });

  it("admits same-identity MOCK confirmation and rejects EXTERNAL-to-MOCK drift", () => {
    delete process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
    delete process.env.TOSS_SANDBOX_SECRET_KEY;

    expect(resolveActionConfirmAdapter(confirmInput(PaymentAdapterExecutionKind.MOCK)))
      .toMatchObject({
        success: true,
        provider: { adapterExecutionKind: PaymentAdapterExecutionKind.MOCK },
      });
    expect(resolveActionConfirmAdapter(confirmInput(PaymentAdapterExecutionKind.EXTERNAL)))
      .toEqual({
        success: false,
        errorCode: "PAYMENT_UNAVAILABLE",
        error: "Pending payment attempt is unavailable.",
        retryable: false,
      });
  });

  it("admits same-identity EXTERNAL confirmation and rejects MOCK-to-EXTERNAL drift", () => {
    process.env.TOSS_SANDBOX_EXTERNAL_ENABLED = "ENABLED";
    process.env.TOSS_SANDBOX_SECRET_KEY = "synthetic-test-secret";

    expect(resolveActionConfirmAdapter(confirmInput(PaymentAdapterExecutionKind.EXTERNAL)))
      .toMatchObject({
        success: true,
        provider: { adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL },
      });
    expect(resolveActionConfirmAdapter(confirmInput(PaymentAdapterExecutionKind.MOCK)))
      .toEqual({
        success: false,
        errorCode: "PAYMENT_UNAVAILABLE",
        error: "Pending payment attempt is unavailable.",
        retryable: false,
      });
  });

  it("rejects legacy NULL identity before resolving an adapter", () => {
    expect(resolveActionConfirmAdapter(confirmInput(null))).toEqual({
      success: false,
      errorCode: "PAYMENT_UNAVAILABLE",
      error: "Pending payment attempt is unavailable.",
      retryable: false,
    });
  });

  it.each([undefined, "ENABLED"])(
    "forbids direct Eximbay confirmation with checkout activation %s",
    (activation) => {
      if (activation === undefined) delete process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
      else process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED = activation;

      expect(resolveActionConfirmAdapter({
        session: { totalAmount: 2_999, currency: "USD" },
        marketCode: MarketCode.US,
        method: PaymentMethod.CARD,
        payment: {
          provider: PaymentProvider.EXIMBAY,
          mode: PaymentMode.SANDBOX,
          adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
          routingRuleId: "cfa.us.card.usd",
        },
      })).toEqual({
        success: false,
        errorCode: "PROVIDER_UNAVAILABLE",
        error: "No payment provider is available.",
        retryable: false,
      });
    },
  );
});

function confirmInput(adapterExecutionKind: PaymentAdapterExecutionKind | null) {
  return {
    session: krwSession(),
    marketCode: MarketCode.KR,
    method: PaymentMethod.CARD,
    payment: {
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      adapterExecutionKind,
      routingRuleId: "d1a.kr.card.krw",
    },
  };
}

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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
