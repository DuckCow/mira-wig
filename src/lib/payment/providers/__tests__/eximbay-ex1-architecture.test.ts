import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ProviderCapability } from "../capabilities";
import { credentialChecksForProvider } from "../credentials";
import { createInitiationProvider } from "../factory";
import { PaymentMethod, PaymentMode } from "../routing";
import { normalizeRefundRequestFingerprintInput } from "../../refund/refund-request-fingerprint";
import { EXIMBAY_SDK_ORIGINS, EXIMBAY_SDK_SOURCES } from "../../eximbay/sdk-origins";
import nextConfig, { EXIMBAY_SDK_CSP_BOUNDARY } from "../../../../../next.config";
import { EXIMBAY_CHECKOUT_SANDBOX_ENABLED } from "../../eximbay/checkout-activation";
import packageJson from "../../../../../package.json";
import runtimeAuthority from "../../refund/__tests__/fixtures/historical-pl-contracts/contracts/runtime-authority-v1.json";

const ROOT = process.cwd();
const MIGRATION = "prisma/migrations/20260803100000_eximbay_ex1_provider_identity/migration.sql";
const S3_LOADER = "src/lib/payment/eximbay/sdk-loader.ts";
const S3_INVOCATION = "src/lib/payment/eximbay/sdk-invocation.ts";
const S3_ORIGIN_OWNER = "src/lib/payment/eximbay/sdk-origins.ts";
const CHECKOUT_PAYMENT_OWNER = "src/app/(shop)/checkout/PaymentMethodSection.tsx";
const CHECKOUT_BROWSER_CONSUMER = "src/app/(shop)/checkout/eximbay-browser-consumer.ts";

describe("Eximbay customer SANDBOX source capability with default-off activation", () => {
  it("adds only the fourth provider enum identity through one canonical migration", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    const providerEnum = schema.match(/enum PaymentProvider \{([^}]+)\}/u)?.[1];

    expect(Object.values(PaymentProvider)).toEqual(["MOCK", "TOSS", "PAYPAL", "EXIMBAY"]);
    expect(providerEnum?.match(/[A-Z]+/gu)).toEqual(["MOCK", "TOSS", "PAYPAL", "EXIMBAY"]);
    expect(readFileSync(join(ROOT, MIGRATION), "utf8")).toBe(
      "-- AlterEnum\nALTER TYPE \"PaymentProvider\" ADD VALUE 'EXIMBAY';\n",
    );
  });

  it("keeps all provider identities explicit in the refund fingerprint parser", () => {
    for (const provider of [
      PaymentProvider.MOCK,
      PaymentProvider.TOSS,
      PaymentProvider.PAYPAL,
      PaymentProvider.EXIMBAY,
    ]) {
      expect(normalizeRefundRequestFingerprintInput({
        provider,
        mode: PaymentMode.SANDBOX,
        providerPaymentReference: `payment:${provider}`,
        amountMinor: 1,
        currency: "USD",
        providerOperationKey: `operation:${provider}`,
      }).provider).toBe(provider);
    }
  });

  it("keeps reviewed S3 SDK authority path-exact alongside the separately gated payment routes", () => {
    const routes = repositoryFiles(join(ROOT, "src/app/api/payments"));

    expect(routes).toEqual([
      "src/app/api/payments/eximbay/status/route.ts",
      "src/app/api/payments/paypal/webhook/route.ts",
      "src/app/api/payments/refunds/reentry/admission/route.ts",
      "src/app/api/payments/status/[checkoutSessionId]/__tests__/route.integration.test.ts",
      "src/app/api/payments/status/[checkoutSessionId]/route.ts",
      "src/app/api/payments/toss/success/__tests__/route.test.ts",
      "src/app/api/payments/toss/success/route.ts",
      "src/app/api/payments/toss/webhook/route.ts",
    ]);
    expect(existsSync(join(ROOT, "src/lib/payment/providers/eximbay"))).toBe(true);
    // Script names describe local worker entrypoints; SDK dependencies are the
    // relevant surface for the browser's reviewed script-loading authority.
    expect(JSON.stringify({
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
    }).toLowerCase()).not.toContain("eximbay");
    expect(productionPathsContaining(EXIMBAY_CHECKOUT_SANDBOX_ENABLED)).toEqual([
      "src/lib/payment/eximbay/checkout-activation.ts",
      "src/lib/payment/providers/factory.ts",
      "src/lib/payment/synthetic-sale/contract.ts",
    ]);
    expect(EXIMBAY_SDK_ORIGINS).toEqual({
      SANDBOX: "https://api-test.eximbay.com",
      LIVE: "https://api.eximbay.com",
    });
    expect(EXIMBAY_SDK_SOURCES).toEqual({
      SANDBOX: "https://api-test.eximbay.com/v2/javascriptSDK.js",
      LIVE: "https://api.eximbay.com/v2/javascriptSDK.js",
    });
    for (const origin of Object.values(EXIMBAY_SDK_ORIGINS)) {
      expect(productionPathsContaining(origin).filter((path) => (
        path.startsWith("src/lib/payment/eximbay/sdk-")
      ))).toEqual([S3_ORIGIN_OWNER]);
    }
    expect(productionPathsContaining("/v2/javascriptSDK.js")).toEqual([S3_ORIGIN_OWNER]);
    expect(source(S3_LOADER)).toContain('from "./sdk-origins"');
    expect(productionPathsMatching(/(?:EXIMBAY\.request_pay|request_pay|requestPay)/u)).toEqual([
      S3_INVOCATION,
      S3_LOADER,
    ]);
  });

  it("keeps checkout ownership behind the canonical default-off activation fence", async () => {
    const paymentMethod = source(CHECKOUT_PAYMENT_OWNER);
    const consumer = source(CHECKOUT_BROWSER_CONSUMER);

    expect(paymentMethod).toContain('from "./eximbay-browser-consumer"');
    expect(paymentMethod).toContain('execution.channel === "FRESH_EXIMBAY_READY"');
    expect(consumer).toContain('@/lib/payment/eximbay/sdk-invocation');
    expect(source(S3_INVOCATION)).toContain('from "./sdk-loader"');
    expect(paymentMethod).not.toMatch(/(?:EXIMBAY_METHOD|method:\s*["']EXIMBAY["']|<EximbayPaymentMethod)/u);
    expect(source("src/proxy.ts")).not.toMatch(/(?:api-test\.)?eximbay\.com|EXIMBAY/iu);

    expect(EXIMBAY_SDK_CSP_BOUNDARY).toEqual({
      origins: EXIMBAY_SDK_ORIGINS,
      activeModes: ["SANDBOX"],
    });
    expect(EXIMBAY_SDK_CSP_BOUNDARY.activeModes).not.toContain("LIVE");
    const configuredHeaders = await nextConfig.headers?.();
    expect(JSON.stringify(configuredHeaders)).not.toContain("Content-Security-Policy");
    const dormantPolicy = JSON.stringify(EXIMBAY_SDK_CSP_BOUNDARY);
    expect(dormantPolicy).not.toContain("*");
    expect(dormantPolicy).not.toContain("unsafe-inline");
    expect(dormantPolicy).not.toContain("unsafe-eval");
  });

  it("keeps provider contact default-off when credentials exist without deployment activation", () => {
    const env = {
      EXIMBAY_SANDBOX_API_KEY: "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG",
      EXIMBAY_SANDBOX_MID: "synthetic-sandbox-mid",
      EXIMBAY_LIVE_API_KEY: "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG",
      EXIMBAY_LIVE_MID: "synthetic-live-mid",
      PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
    };
    const context = {
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      market: "US",
      method: PaymentMethod.CARD,
      currency: "USD",
      ruleId: "synthetic.eximbay.disabled",
      credentials: credentialChecksForProvider({
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        capability: ProviderCapability.ACTION_ADAPTER,
      }, env),
      liveGuard: { kind: "blocked" as const, liveEnabled: false as const, reason: "disabled" },
    };

    expect(context.credentials).toEqual([
      { name: "EXIMBAY_SANDBOX_API_KEY", required: true, present: true },
      { name: "EXIMBAY_SANDBOX_MID", required: true, present: true },
      { name: "PAYMENT_PUBLIC_ORIGIN", required: true, present: true },
    ]);
    expect(() => createInitiationProvider(context, {
      env,
      sandboxExternalCodeRegistry: [{
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        capability: ProviderCapability.ACTION_ADAPTER,
      }],
    })).toThrowError(expect.objectContaining({ code: "SANDBOX_EXTERNAL_MISCONFIGURED" }));
  });

  it("preserves provider-free preflight and Toss-only default selection with separately gated Eximbay routing", () => {
    const eligibility = source("src/lib/payment/refund/worker-eligibility.ts");
    const activation = source("src/lib/payment/refund/execution-activation.ts");

    expect(runtimeAuthority.providerScope.classification).toBe("PREFLIGHT_ONLY_NO_PROVIDER_ROUTE");
    expect(runtimeAuthority.providerScope.runtimeProviderCredentialBindings).toBe(0);
    expect(runtimeAuthority.jobs.preflight.providerContact).toBe("FORBIDDEN");
    expect(runtimeAuthority.jobs.canary).toEqual({
      materialized: false, providerCredential: "ABSENT", target: "ABSENT", approval: "ABSENT", executable: false,
    });
    expect(eligibility).toContain("const TOSS_ONLY");
    expect(eligibility).toContain("PaymentProvider.EXIMBAY");
    expect(eligibility).toContain("provider: PaymentProvider.TOSS");
    expect(activation).toContain('REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED');
  });
});

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function productionFiles(): readonly string[] {
  return repositoryFiles(join(ROOT, "src"), true)
    .filter((path) => /\.(?:ts|tsx)$/u.test(path))
    .map((path) => join(ROOT, path));
}

function productionPathsContaining(value: string): string[] {
  return productionFiles()
    .filter((path) => readFileSync(path, "utf8").includes(value))
    .map((path) => relative(ROOT, path));
}

function productionPathsMatching(pattern: RegExp): string[] {
  return productionFiles()
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(ROOT, path));
}

function repositoryFiles(root: string, excludeTests = false): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (excludeTests && (entry.name === "__tests__" || entry.name.endsWith(".test.ts"))) continue;
    if (entry.isDirectory()) files.push(...repositoryFiles(absolute, excludeTests));
    if (entry.isFile()) files.push(relative(ROOT, absolute));
  }
  return files.sort((left, right) => left.localeCompare(right));
}
