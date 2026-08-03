import { PaymentProvider } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProviderFactoryContext } from "../contract";
import { ProviderCapability } from "../capabilities";
import { credentialChecksForProvider, TOSS_SANDBOX_SECRET_KEY } from "../credentials";
import {
  TOSS_SANDBOX_EXTERNAL_ENABLED,
  sandboxExternalDeploymentKeyEnabled,
  type CreateConfirmationProviderOptions,
  type CreateInitiationProviderOptions,
  type ProviderEnv,
  type SandboxExternalCodeRegistryEntry,
} from "../factory";
import { PaymentMethod, PaymentMode } from "../routing";
import { resolveInitiationProvider } from "../initiation";
import { ProviderResolveException, resolveConfirmationProvider } from "../resolve";
import type { PaymentConfirmInput, PaymentInitiateInput, PaymentProvider as PaymentProviderPort } from "../types";

const ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED = process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
const ORIGINAL_TOSS_SANDBOX_SECRET_KEY = process.env.TOSS_SANDBOX_SECRET_KEY;
type TestProviderOptions = CreateInitiationProviderOptions & CreateConfirmationProviderOptions;

function resolveProvider(
  context: ProviderFactoryContext,
  options?: TestProviderOptions,
): PaymentProviderPort {
  const initiation = resolveInitiationProvider(context, options);
  const confirmation = resolveConfirmationProvider(context, options);
  return {
    code: initiation.code,
    initiate: (input) => initiation.initiate(input),
    confirm: (input) => confirmation.confirm(input),
  };
}

describe("payment provider adapter resolution", () => {
  beforeEach(() => {
    delete process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
    delete process.env.TOSS_SANDBOX_SECRET_KEY;
  });

  afterEach(() => {
    restoreEnv("TOSS_SANDBOX_EXTERNAL_ENABLED", ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED);
    restoreEnv("TOSS_SANDBOX_SECRET_KEY", ORIGINAL_TOSS_SANDBOX_SECRET_KEY);
  });

  it.each([
    PaymentProvider.MOCK,
    PaymentProvider.TOSS,
    PaymentProvider.PAYPAL,
  ])("resolves %s to the explicit SANDBOX mock scaffold", async (provider) => {
    const resolved = resolveProvider(factoryContext({
      provider,
      mode: PaymentMode.SANDBOX,
      credentials: [{ name: "FAKE_SANDBOX_REQUIRED", required: true, present: false }],
      liveGuard: { kind: "blocked", liveEnabled: false, reason: "sandbox skips live guard" },
    }));

    expect(resolved.code).toBe(provider);
    await expect(resolved.initiate(initiateInput(provider))).resolves.toEqual({ kind: "ready" });
    await expect(resolved.confirm(confirmInput(provider))).resolves.toMatchObject({
      providerPaymentKey: "mock:checkout_123",
      amount: 12_000,
      currency: "KRW",
    });
  });

  it("keeps Toss SANDBOX mock-backed when credentials or adapters exist without both opt-in keys", async () => {
    const adapter = throwingAdapter();
    const resolved = resolveProvider(factoryContext({
      credentials: [presentSandboxCredential()],
    }), {
      ...sandboxAdapters(adapter.create),
    });

    await expect(resolved.confirm(confirmInput(PaymentProvider.TOSS))).resolves.toMatchObject({
      providerPaymentKey: "mock:checkout_123",
    });
    expect(adapter.calls).toBe(0);
  });

  it.each([
    {
      name: "code key only",
      code: "SANDBOX_EXTERNAL_MISCONFIGURED",
      options: () => ({ sandboxExternalCodeRegistry: tossActionCodeRegistry() }),
      context: () => factoryContext({ credentials: [presentSandboxCredential()] }),
    },
    {
      name: "deployment key only",
      code: "SANDBOX_EXTERNAL_MISCONFIGURED",
      options: () => ({ env: sandboxEnabledEnv() }),
      context: () => factoryContext({ credentials: [presentSandboxCredential()] }),
    },
    {
      name: "invalid deployment key value",
      code: "SANDBOX_EXTERNAL_CONFIG_INVALID",
      options: () => ({ env: { [TOSS_SANDBOX_EXTERNAL_ENABLED]: "enabled" } }),
      context: () => factoryContext({ credentials: [presentSandboxCredential()] }),
    },
    {
      name: "both keys with missing credentials",
      code: "SANDBOX_EXTERNAL_CREDENTIALS_MISSING",
      options: () => ({ env: sandboxEnabledEnv(), sandboxExternalCodeRegistry: tossActionCodeRegistry() }),
      context: () => factoryContext({ credentials: [missingSandboxCredential()] }),
    },
  ])("fails closed for SANDBOX external matrix row: $name", ({ code, context, options }) => {
    const adapter = throwingAdapter();
    expectResolutionFailure(
      context(),
      code,
      "fake_secret_do_not_leak",
      {
        ...options(),
        ...sandboxAdapters(adapter.create),
      },
    );
    expect(adapter.calls).toBe(0);
  });

  it("fails closed when both SANDBOX opt-in keys and credentials exist but no adapter is registered", () => {
    expectResolutionFailure(
      factoryContext({ credentials: [presentSandboxCredential()] }),
      "SANDBOX_EXTERNAL_ADAPTER_UNAVAILABLE",
      undefined,
      { env: sandboxEnabledEnv(), sandboxExternalCodeRegistry: tossActionCodeRegistry() },
    );
  });

  it("fails closed when both SANDBOX opt-in keys exist but the credential row is absent", () => {
    expectResolutionFailure(
      factoryContext({ credentials: [] }),
      "SANDBOX_EXTERNAL_CREDENTIALS_MISSING",
      undefined,
      {
        env: sandboxEnabledEnv(),
        sandboxExternalCodeRegistry: tossActionCodeRegistry(),
        ...sandboxAdapters(fakeSandboxExternalAdapter),
      },
    );
  });

  it("selects a registered SANDBOX external adapter only when both keys and credentials are present", async () => {
    const resolved = resolveProvider(factoryContext({ credentials: [presentSandboxCredential()] }), {
      env: sandboxEnabledEnv(),
      sandboxExternalCodeRegistry: tossActionCodeRegistry(),
      ...sandboxAdapters(fakeSandboxExternalAdapter),
    });

    await expect(resolved.confirm(confirmInput(PaymentProvider.TOSS))).resolves.toMatchObject({
      providerPaymentKey: "external:sandbox_payment_123",
      amount: 12_000,
      currency: "KRW",
    });
  });

  it("redacts SANDBOX external opt-in config and credential values from resolver failures", () => {
    const sentinel = "secret_value_that_must_not_leak";
    expectResolutionFailure(
      factoryContext({ credentials: [{ name: TOSS_SANDBOX_SECRET_KEY, required: true, present: true }] }),
      "SANDBOX_EXTERNAL_CONFIG_INVALID",
      sentinel,
      { env: { [TOSS_SANDBOX_EXTERNAL_ENABLED]: "not-enabled", [TOSS_SANDBOX_SECRET_KEY]: sentinel } },
    );
    expectResolutionFailure(
      factoryContext({ credentials: [{ name: TOSS_SANDBOX_SECRET_KEY, required: true, present: true }] }),
      "SANDBOX_EXTERNAL_CONFIG_INVALID",
      TOSS_SANDBOX_EXTERNAL_ENABLED,
      { env: { [TOSS_SANDBOX_EXTERNAL_ENABLED]: "not-enabled", [TOSS_SANDBOX_SECRET_KEY]: sentinel } },
    );
  });

  it("fails closed for MOCK in LIVE mode", () => {
    expectResolutionFailure(
      factoryContext({ provider: PaymentProvider.MOCK, mode: PaymentMode.LIVE }),
      "MOCK_PROVIDER_LIVE",
    );
  });

  it.each([PaymentMode.SANDBOX, PaymentMode.LIVE])(
    "fails Eximbay %s resolution before constructing any supplied adapter",
    (mode) => {
      const adapter = throwingAdapter();
      const options: TestProviderOptions = {
        env: { TOSS_SANDBOX_EXTERNAL_ENABLED: "ENABLED" },
        sandboxExternalCodeRegistry: [{
          provider: PaymentProvider.EXIMBAY,
          mode: PaymentMode.SANDBOX,
          capability: ProviderCapability.ACTION_ADAPTER,
        }],
        sandboxExternalInitiationAdapters: { [PaymentProvider.EXIMBAY]: adapter.create },
        sandboxExternalConfirmationAdapters: { [PaymentProvider.EXIMBAY]: adapter.create },
        liveInitiationAdapters: { [PaymentProvider.EXIMBAY]: adapter.create },
        liveConfirmationAdapters: { [PaymentProvider.EXIMBAY]: adapter.create },
      };

      expectResolutionFailure(factoryContext({
        provider: PaymentProvider.EXIMBAY,
        mode,
        market: "US",
        currency: "USD",
      }), "PROVIDER_NOT_ENABLED", undefined, options);
      expect(adapter.calls).toBe(0);
    },
  );

  it("reads no credential or deployment environment key for disabled Eximbay", () => {
    const reads: PropertyKey[] = [];
    const env = new Proxy<Record<string, string | undefined>>({}, {
      get: (_target, key) => {
        reads.push(key);
        return undefined;
      },
    });
    const input = {
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      capability: ProviderCapability.ACTION_ADAPTER,
    };

    expect(credentialChecksForProvider(input, env)).toEqual([]);
    expect(sandboxExternalDeploymentKeyEnabled(input, env)).toBe(false);
    expect(reads).toEqual([]);
  });

  it.each([
    ["constructor", "constructor"],
    ["toString", "toString"],
    ["__proto__", "__proto__"],
    ["prototype", "prototype"],
    ["unknown", "UNKNOWN"],
    ["Eximbay prefix", "EXIMBAY_"],
    ["null", null],
    ["number", 7],
    ["object", {}],
  ] satisfies readonly [string, unknown][])(
    "does not derive sandbox external authority from malformed runtime provider $label",
    (_label, provider) => {
      const reads: PropertyKey[] = [];
      const env = new Proxy<Record<string, string | undefined>>({}, {
        get: (_target, key) => {
          reads.push(key);
          return "ENABLED";
        },
      });

      expect(sandboxDeploymentEnabledAtRuntime(provider, env)).toBe(false);
      expect(reads).toEqual([]);
    },
  );

  it("preserves the explicit Toss sandbox external deployment key", () => {
    expect(sandboxExternalDeploymentKeyEnabled({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      capability: ProviderCapability.ACTION_ADAPTER,
    }, sandboxEnabledEnv())).toBe(true);
  });

  it("fails LIVE before credential checks when the provider is not live-enabled", () => {
    const sentinel = "fake_secret_do_not_leak";
    expectResolutionFailure(
      factoryContext({
        mode: PaymentMode.LIVE,
        credentials: [{ name: sentinel, required: true, present: true }],
        liveGuard: { kind: "blocked", liveEnabled: false, reason: "fake test live guard blocked" },
      }),
      "LIVE_NOT_ENABLED",
      sentinel,
    );
  });

  it("fails LIVE with missing credentials after the live guard allows the provider", () => {
    expectResolutionFailure(
      factoryContext({
        mode: PaymentMode.LIVE,
        credentials: [{ name: "FAKE_REQUIRED_CREDENTIAL", required: true, present: false }],
        liveGuard: { kind: "allowed", liveEnabled: true },
      }),
      "LIVE_CREDENTIALS_MISSING",
    );
  });

  it.each([
    PaymentProvider.TOSS,
    PaymentProvider.PAYPAL,
  ])("fails closed for %s after live guard and fake credentials pass", (provider) => {
    expectResolutionFailure(
      factoryContext({
        provider,
        mode: PaymentMode.LIVE,
        credentials: [{ name: "FAKE_REQUIRED_CREDENTIAL", required: true, present: true }],
        liveGuard: { kind: "allowed", liveEnabled: true },
      }),
      "LIVE_ADAPTER_UNAVAILABLE",
    );
  });

  it("keeps LIVE fail-closed behavior unaffected by SANDBOX opt-in options", () => {
    const adapter = throwingAdapter();
    expectResolutionFailure(
      factoryContext({
        mode: PaymentMode.LIVE,
        credentials: [{ name: "FAKE_REQUIRED_CREDENTIAL", required: true, present: true }],
        liveGuard: { kind: "blocked", liveEnabled: false, reason: "fake test live guard blocked" },
      }),
      "LIVE_NOT_ENABLED",
      undefined,
      {
        env: sandboxEnabledEnv(),
        sandboxExternalCodeRegistry: tossActionCodeRegistry(),
        ...sandboxAdapters(adapter.create),
      },
    );
    expect(adapter.calls).toBe(0);
  });

  it("fails closed for unsupported modes", () => {
    expectResolutionFailure(
      factoryContext({
        // @ts-expect-error test-only invalid mode exercises the runtime guard.
        mode: "STAGING",
      }),
      "PROVIDER_MODE_UNSUPPORTED",
    );
  });
});

function expectResolutionFailure(
  context: ProviderFactoryContext,
  code: string,
  absentText?: string,
  options: TestProviderOptions = {},
): void {
  expect(() => resolveProvider(context, options)).toThrow(ProviderResolveException);
  try {
    resolveProvider(context, options);
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderResolveException);
    if (e instanceof ProviderResolveException) {
      expect(e.code).toBe(code);
      expect(e.provider).toBe(context.provider);
      expect(e.mode).toBe(String(context.mode));
      expect(String(e)).not.toContain(absentText ?? "__never__");
      expect(JSON.stringify(e)).not.toContain(absentText ?? "__never__");
    }
  }
}

function initiateInput(provider: PaymentProvider): PaymentInitiateInput {
  return {
    checkoutSessionId: "checkout_123",
    paymentId: "payment_123",
    provider,
    amount: 12_000,
    currency: "KRW",
    idempotencyKey: "initiate:checkout_123:payment_123",
  };
}

function confirmInput(provider: PaymentProvider): PaymentConfirmInput {
  return {
    checkoutSessionId: "checkout_123",
    paymentId: "payment_123",
    provider,
    providerConfirmIdempotencyKey: "confirm:TOSS:payment_123",
    amount: 12_000,
    currency: "KRW",
  };
}

function tossActionCodeRegistry(): readonly SandboxExternalCodeRegistryEntry[] {
  return [
    {
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      capability: ProviderCapability.ACTION_ADAPTER,
    },
  ];
}

function sandboxEnabledEnv(): Record<string, string> {
  return { [TOSS_SANDBOX_EXTERNAL_ENABLED]: "ENABLED" };
}

function presentSandboxCredential() {
  return { name: TOSS_SANDBOX_SECRET_KEY, required: true, present: true };
}

function missingSandboxCredential() {
  return { name: TOSS_SANDBOX_SECRET_KEY, required: true, present: false };
}

function fakeSandboxExternalAdapter(context: ProviderFactoryContext): PaymentProviderPort {
  return {
    code: context.provider,
    initiate: (input) => Promise.resolve({ kind: "ready", providerRef: `external:${input.paymentId}` }),
    confirm: (input) => Promise.resolve({
      providerPaymentKey: "external:sandbox_payment_123",
      amount: input.amount,
      currency: input.currency,
    }),
  };
}

function sandboxAdapters(
  create: (context: ProviderFactoryContext) => PaymentProviderPort,
): Pick<TestProviderOptions, "sandboxExternalInitiationAdapters" | "sandboxExternalConfirmationAdapters"> {
  return {
    sandboxExternalInitiationAdapters: { [PaymentProvider.TOSS]: create },
    sandboxExternalConfirmationAdapters: { [PaymentProvider.TOSS]: create },
  };
}

function throwingAdapter(): { calls: number; create: (context: ProviderFactoryContext) => PaymentProviderPort } {
  let calls = 0;
  return {
    get calls() { return calls; },
    create() {
      calls += 1;
      throw new Error("external sandbox adapter must not be constructed");
    },
  };
}

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = original;
}

function sandboxDeploymentEnabledAtRuntime(provider: unknown, env: ProviderEnv): boolean {
  const result: unknown = Reflect.apply(sandboxExternalDeploymentKeyEnabled, undefined, [{
    provider,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.ACTION_ADAPTER,
  }, env]);
  if (typeof result !== "boolean") throw new Error("Sandbox deployment authority returned a non-boolean value.");
  return result;
}

function factoryContext(overrides: Partial<ProviderFactoryContext> = {}): ProviderFactoryContext {
  return {
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    market: "KR",
    method: PaymentMethod.CARD,
    currency: "KRW",
    ruleId: "d1a.kr.card.krw",
    credentials: [],
    liveGuard: { kind: "blocked", liveEnabled: false, reason: "not live mode" },
    ...overrides,
  };
}
