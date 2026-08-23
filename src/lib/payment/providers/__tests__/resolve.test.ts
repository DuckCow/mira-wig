import { PaymentAdapterExecutionKind, PaymentProvider } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProviderFactoryContext } from "../contract";
import { ProviderCapability } from "../capabilities";
import {
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
  PAYMENT_PUBLIC_ORIGIN,
  credentialChecksForProvider,
  TOSS_SANDBOX_SECRET_KEY,
} from "../credentials";
import { EXIMBAY_CHECKOUT_SANDBOX_ENABLED } from "@/lib/payment/eximbay/checkout-activation";
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
const ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED = process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
const ORIGINAL_EXIMBAY_SANDBOX_API_KEY = process.env.EXIMBAY_SANDBOX_API_KEY;
const ORIGINAL_EXIMBAY_SANDBOX_MID = process.env.EXIMBAY_SANDBOX_MID;
const ORIGINAL_PAYMENT_PUBLIC_ORIGIN = process.env.PAYMENT_PUBLIC_ORIGIN;
type TestProviderOptions = CreateInitiationProviderOptions & CreateConfirmationProviderOptions;

function resolveProvider(
  context: ProviderFactoryContext,
  options?: TestProviderOptions,
): PaymentProviderPort {
  const initiation = resolveInitiationProvider(context, options);
  const confirmation = resolveConfirmationProvider(context, options);
  return {
    code: initiation.code,
    adapterExecutionKind: initiation.adapterExecutionKind,
    initiate: (input) => initiation.initiate(input),
    confirm: (input) => confirmation.confirm(input),
  };
}

describe("payment provider adapter resolution", () => {
  beforeEach(() => {
    delete process.env.TOSS_SANDBOX_EXTERNAL_ENABLED;
    delete process.env.TOSS_SANDBOX_SECRET_KEY;
    delete process.env.EXIMBAY_CHECKOUT_SANDBOX_ENABLED;
    delete process.env.EXIMBAY_SANDBOX_API_KEY;
    delete process.env.EXIMBAY_SANDBOX_MID;
    delete process.env.PAYMENT_PUBLIC_ORIGIN;
  });

  afterEach(() => {
    restoreEnv("TOSS_SANDBOX_EXTERNAL_ENABLED", ORIGINAL_TOSS_SANDBOX_EXTERNAL_ENABLED);
    restoreEnv("TOSS_SANDBOX_SECRET_KEY", ORIGINAL_TOSS_SANDBOX_SECRET_KEY);
    restoreEnv(EXIMBAY_CHECKOUT_SANDBOX_ENABLED, ORIGINAL_EXIMBAY_CHECKOUT_SANDBOX_ENABLED);
    restoreEnv(EXIMBAY_SANDBOX_API_KEY, ORIGINAL_EXIMBAY_SANDBOX_API_KEY);
    restoreEnv(EXIMBAY_SANDBOX_MID, ORIGINAL_EXIMBAY_SANDBOX_MID);
    restoreEnv(PAYMENT_PUBLIC_ORIGIN, ORIGINAL_PAYMENT_PUBLIC_ORIGIN);
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
    expect(resolved.adapterExecutionKind).toBe(PaymentAdapterExecutionKind.MOCK);
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
    expect(resolved.adapterExecutionKind).toBe(PaymentAdapterExecutionKind.EXTERNAL);
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

  it("fails Eximbay initiation closed when deployment activation is absent", () => {
    expect(() => resolveInitiationProvider(eximbayFactoryContext(configuredEximbayEnv())))
      .toThrowError(expect.objectContaining({ code: "SANDBOX_EXTERNAL_MISCONFIGURED" }));
  });

  it.each(["enabled", " ENABLED", "ENABLED ", " ", "TRUE", "1"])(
    "fails Eximbay initiation closed for noncanonical activation %j",
    (value) => {
      setEximbayProcessEnv({ ...configuredEximbayEnv(), [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: value });
      expect(() => resolveInitiationProvider(eximbayFactoryContext(process.env)))
        .toThrowError(expect.objectContaining({ code: "SANDBOX_EXTERNAL_CONFIG_INVALID" }));
    },
  );

  it("requires all Eximbay SANDBOX action configuration after activation", () => {
    setEximbayProcessEnv({ [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: "ENABLED" });
    expect(() => resolveInitiationProvider(eximbayFactoryContext(process.env)))
      .toThrowError(expect.objectContaining({ code: "SANDBOX_EXTERNAL_CREDENTIALS_MISSING" }));
  });

  it("resolves only the defensive Eximbay special-READY carrier when fully admitted", async () => {
    setEximbayProcessEnv({
      ...configuredEximbayEnv(),
      [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: "ENABLED",
    });
    const carrier = resolveInitiationProvider(eximbayFactoryContext(process.env));

    expect(carrier.code).toBe(PaymentProvider.EXIMBAY);
    expect(carrier.adapterExecutionKind).toBe(PaymentAdapterExecutionKind.EXTERNAL);
    await expect(carrier.initiate(initiateInput(PaymentProvider.EXIMBAY)))
      .rejects.toThrow("special READY attempt path");
  });

  it.each([undefined, "ENABLED"])(
    "forbids direct Eximbay confirmation with activation %s",
    (activation) => {
    setEximbayProcessEnv({
      ...configuredEximbayEnv(),
      [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: activation,
    });
    expect(() => resolveConfirmationProvider(eximbayFactoryContext(process.env)))
      .toThrowError(expect.objectContaining({ code: "EXIMBAY_CONFIRM_ACTION_FORBIDDEN" }));
    },
  );

  it("keeps Eximbay LIVE unavailable even with activation and LIVE-shaped credentials", () => {
    setEximbayProcessEnv({
      ...configuredEximbayEnv(),
      [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: "ENABLED",
    });
    expect(() => resolveInitiationProvider(eximbayFactoryContext(process.env, PaymentMode.LIVE)))
      .toThrowError(expect.objectContaining({ code: "PROVIDER_MODE_UNSUPPORTED" }));
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

  it("uses the canonical exact Eximbay checkout activation parser", () => {
    const input = {
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      capability: ProviderCapability.ACTION_ADAPTER,
    };
    expect(sandboxExternalDeploymentKeyEnabled(input, {})).toBe(false);
    expect(sandboxExternalDeploymentKeyEnabled(input, {
      [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: "",
    })).toBe(false);
    expect(sandboxExternalDeploymentKeyEnabled(input, {
      [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: "ENABLED",
    })).toBe(true);
    for (const value of ["enabled", " ENABLED", "ENABLED ", " ", "TRUE", "1"]) {
      expect(() => sandboxExternalDeploymentKeyEnabled(input, {
        [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: value,
      })).toThrowError(expect.objectContaining({ code: "SANDBOX_EXTERNAL_CONFIG_INVALID" }));
    }
    expect(sandboxExternalDeploymentKeyEnabled({ ...input, mode: PaymentMode.LIVE }, {
      [EXIMBAY_CHECKOUT_SANDBOX_ENABLED]: "ENABLED",
    })).toBe(false);
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

function configuredEximbayEnv(): Record<string, string> {
  return {
    [EXIMBAY_SANDBOX_API_KEY]: "synthetic-eximbay-api-key",
    [EXIMBAY_SANDBOX_MID]: "synthetic-eximbay-mid",
    [PAYMENT_PUBLIC_ORIGIN]: "https://payments.example.test",
  };
}

function eximbayFactoryContext(
  env: Readonly<Record<string, string | undefined>>,
  mode: PaymentMode = PaymentMode.SANDBOX,
): ProviderFactoryContext {
  return factoryContext({
    provider: PaymentProvider.EXIMBAY,
    mode,
    market: "US",
    method: PaymentMethod.CARD,
    currency: "USD",
    ruleId: "cfa.us.card.usd",
    credentials: credentialChecksForProvider({
      provider: PaymentProvider.EXIMBAY,
      mode,
      capability: ProviderCapability.ACTION_ADAPTER,
    }, env),
    liveGuard: { kind: "blocked", liveEnabled: false, reason: "Eximbay LIVE is unavailable" },
  });
}

function setEximbayProcessEnv(env: Readonly<Record<string, string | undefined>>): void {
  for (const key of [
    EXIMBAY_CHECKOUT_SANDBOX_ENABLED,
    EXIMBAY_SANDBOX_API_KEY,
    EXIMBAY_SANDBOX_MID,
    PAYMENT_PUBLIC_ORIGIN,
  ]) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function fakeSandboxExternalAdapter(context: ProviderFactoryContext): PaymentProviderPort {
  return {
    code: context.provider,
    adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
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
