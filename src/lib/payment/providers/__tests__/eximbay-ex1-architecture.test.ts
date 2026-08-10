import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PaymentMode } from "../routing";
import { normalizeRefundRequestFingerprintInput } from "../../refund/refund-request-fingerprint";

const ROOT = process.cwd();
const MIGRATION = "prisma/migrations/20260803100000_eximbay_ex1_provider_identity/migration.sql";

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

  it("adds no Eximbay route, adapter, SDK dependency, credential, endpoint, or deployment key", () => {
    const routes = repositoryFiles(join(ROOT, "src/app/api/payments"));
    const packageJson = source("package.json");
    const production = productionSource();

    expect(routes).toEqual([
      "src/app/api/payments/paypal/webhook/route.ts",
      "src/app/api/payments/toss/success/__tests__/route.test.ts",
      "src/app/api/payments/toss/success/route.ts",
      "src/app/api/payments/toss/webhook/route.ts",
    ]);
    expect(existsSync(join(ROOT, "src/lib/payment/providers/eximbay"))).toBe(true);
    expect(packageJson.toLowerCase()).not.toContain("eximbay");
    expect(production).not.toMatch(/EXIMBAY_(?:SECRET|KEY|ENDPOINT|URL|ENABLED)/u);
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
