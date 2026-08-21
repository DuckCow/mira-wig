import { readFileSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import {
  productionSourceFiles,
  reverseReachableFiles,
} from "../../../__tests__/production-reachability-scanner";

const ROOT = process.cwd();
const AUTHORIZE = join(
  ROOT,
  "src/lib/payment/refund/providers/eximbay/authorize-first-dispatch.ts",
);
const CONTACT = join(
  ROOT,
  "src/lib/payment/refund/providers/eximbay/execute-contact.ts",
);
const RECONCILE = join(
  ROOT,
  "src/lib/payment/refund/providers/eximbay/reconcile-refund.ts",
);

describe("Eximbay refund preflight dormancy", () => {
  it("is reachable only through the approved dormant production worker path", () => {
    const files = productionSourceFiles();
    expect(reverseReachableFiles(AUTHORIZE, files).map(repositoryPath)).toEqual([
      "src/lib/payment/refund/providers/eximbay/authorize-first-dispatch.ts",
      "src/lib/payment/refund/worker-result-classification.ts",
      "src/lib/payment/refund/worker-router.ts",
      "src/lib/payment/refund/run-refund-execution-worker-cycle.ts",
      "src/lib/payment/refund/run-refund-execution-worker-host.ts",
      "scripts/refund-execution-worker.ts",
      "src/lib/payment/refund/worker-host-process.ts",
    ]);
    expect(reverseReachableFiles(CONTACT, files).map(repositoryPath)).toEqual([
      "src/lib/payment/refund/providers/eximbay/execute-contact.ts",
      "src/lib/payment/refund/worker-router.ts",
      "src/lib/payment/refund/run-refund-execution-worker-cycle.ts",
      "src/lib/payment/refund/run-refund-execution-worker-host.ts",
      "scripts/refund-execution-worker.ts",
      "src/lib/payment/refund/worker-host-process.ts",
    ]);
    expect(reverseReachableFiles(RECONCILE, files).map(repositoryPath)).toEqual([
      "src/lib/payment/refund/providers/eximbay/reconcile-refund.ts",
      "src/lib/payment/refund/worker-router.ts",
      "src/lib/payment/refund/run-refund-execution-worker-cycle.ts",
      "src/lib/payment/refund/run-refund-execution-worker-host.ts",
      "scripts/refund-execution-worker.ts",
      "src/lib/payment/refund/worker-host-process.ts",
    ]);
  });

  it("does not add cancel, refund-id lookup, credential, or global fetch capability", () => {
    const source = readFileSync(AUTHORIZE, "utf8");
    expect(source).not.toContain("https://api-test.eximbay.com");
    expect(source).not.toContain("executeEximbayCancel");
    expect(source).not.toContain("refund_id");
    expect(source).not.toContain("globalThis.fetch");
    expect(source).not.toContain("process.env");
  });

  it("keeps production Eximbay refund request eligibility blocked", () => {
    const request = readFileSync(join(ROOT, "src/lib/payment/refund/request.ts"), "utf8");
    expect(request).toContain("order.payment.provider !== PaymentProvider.EXIMBAY");
  });

  it("keeps cancel and recovery provider-free with injected transports", () => {
    for (const file of [CONTACT, RECONCILE]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("globalThis.fetch");
      expect(source).not.toContain("process.env");
      expect(source).not.toMatch(/["']Authorization["']|\bBasic\s|\bsecretKey\b|\bapiKey\b/u);
    }
    expect(readFileSync(RECONCILE, "utf8")).toContain("deriveEximbayMerchantRefundId");
    expect(readFileSync(RECONCILE, "utf8")).not.toContain("preAdmittedRecoveryPhysicalKey");
  });
});

function repositoryPath(value: string): string {
  return relative(ROOT, value);
}
