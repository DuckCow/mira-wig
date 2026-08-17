import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ProviderCapability } from "../capabilities";
import { credentialChecksForProvider } from "../credentials";
import { createInitiationProvider } from "../factory";
import { PaymentMethod, PaymentMode } from "../routing";
import { normalizeRefundRequestFingerprintInput } from "../../refund/refund-request-fingerprint";

const ROOT = process.cwd();
const MIGRATION = "prisma/migrations/20260803100000_eximbay_ex1_provider_identity/migration.sql";
const S3_LOADER = "src/lib/payment/eximbay/sdk-loader.ts";
const S3_INVOCATION = "src/lib/payment/eximbay/sdk-invocation.ts";
const S3_SDK_SOURCES = [
  "https://api-test.eximbay.com/v2/javascriptSDK.js",
  "https://api.eximbay.com/v2/javascriptSDK.js",
] as const;

describe("Eximbay EX1 disabled architecture", () => {
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

  it("keeps reviewed dormant S3 SDK authority path-exact with only the default-off status route", () => {
    const routes = repositoryFiles(join(ROOT, "src/app/api/payments"));
    const packageJson = source("package.json");
    const production = productionSource();

    expect(routes).toEqual([
      "src/app/api/payments/eximbay/status/route.ts",
      "src/app/api/payments/paypal/webhook/route.ts",
      "src/app/api/payments/status/[checkoutSessionId]/__tests__/route.integration.test.ts",
      "src/app/api/payments/status/[checkoutSessionId]/route.ts",
      "src/app/api/payments/toss/success/__tests__/route.test.ts",
      "src/app/api/payments/toss/success/route.ts",
      "src/app/api/payments/toss/webhook/route.ts",
    ]);
    expect(existsSync(join(ROOT, "src/lib/payment/providers/eximbay"))).toBe(true);
    expect(packageJson.toLowerCase()).not.toContain("eximbay");
    expect(production).not.toMatch(/EXIMBAY_(?:EXTERNAL_)?ENABLED/u);
    for (const sdkSource of S3_SDK_SOURCES) {
      expect(productionPathsContaining(sdkSource)).toEqual([S3_LOADER]);
    }
    expect(productionPathsMatching(/(?:EXIMBAY\.request_pay|request_pay|requestPay)/u)).toEqual([
      S3_INVOCATION,
      S3_LOADER,
    ]);
  });

  it("keeps dormant S3 browser modules unreachable from checkout and customer clients", () => {
    const paymentMethod = source("src/app/(shop)/checkout/PaymentMethodSection.tsx");
    const customerClientConsumers = productionPathsMatching(/sdk-(?:loader|invocation)/u)
      .filter((path) => path.endsWith(".tsx"))
      .filter((path) => path.startsWith("src/app/(shop)/") || path.startsWith("src/components/"));
    const securityConfiguration = [source("next.config.ts"), source("src/proxy.ts")].join("\n");

    expect(paymentMethod).not.toMatch(/sdk-(?:loader|invocation)|request_pay/u);
    expect(customerClientConsumers).toEqual([]);
    expect(securityConfiguration).not.toMatch(/(?:api-test\.)?eximbay\.com|EXIMBAY/iu);
  });

  it("keeps routing and factory reachability disabled even when every dormant S2 config name is present", () => {
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

    expect(context.credentials).toEqual([]);
    expect(() => createInitiationProvider(context, { env }))
      .toThrowError(expect.objectContaining({ code: "PROVIDER_NOT_ENABLED" }));
  });

  it("preserves exact Toss-only refund runtime authority", () => {
    const authority = source("infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json");
    const eligibility = source("src/lib/payment/refund/worker-eligibility.ts");

    expect(authority).toContain('"classification": "TOSS_ONLY_EXPLICIT"');
    expect(eligibility.match(/provider: PaymentProvider\.TOSS/gu)).toHaveLength(4);
    expect(eligibility).not.toContain("PaymentProvider.EXIMBAY");
  });
});

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function productionSource(): string {
  return productionFiles().map((path) => readFileSync(path, "utf8")).join("\n");
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
