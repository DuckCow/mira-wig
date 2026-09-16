import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { config, env, authority, fixture, response, fakeFetch } from "./contacted-success-fixture";
import { parseContactedRefundSuccessProof, matchContactedRefundSuccessProof, type ContactedRefundSuccessProof } from "../contacted-evidence-parser";
import { runEximbayContactedRefundSuccessCloseOnce } from "../../../run-eximbay-contacted-refund-success-close-once";
import { EXIMBAY_REFUND_REENTRY_TARGET as target } from "../../../eximbay-refund-reentry-authority";

describe("proof-and-close one-shot command", () => {
  it("passes an opaque exact proof once and never outputs the raw refund transaction ID", async () => {
    const fetch = fakeFetch();
    const apply = vi.fn((proof: ContactedRefundSuccessProof) => {
      expect(matchContactedRefundSuccessProof(proof, authority)).toBe("fake-refund-transaction");
      expect(JSON.stringify(proof)).not.toContain("fake-refund-transaction");
      return Promise.resolve({ outcome: "CLOSED" as const });
    });
    const result = await runEximbayContactedRefundSuccessCloseOnce(target.commandId, env, {
      readDatabase: () => Promise.resolve({ row: fixture(), databaseDisconnected: true, databaseReadSucceeded: true }),
      fetch, readSecret: () => Promise.resolve("fake-secret"), apply,
    });
    expect(result).toMatchObject({ outcome: "CLOSED", inquiryCount: 1 });
    expect(fetch).toHaveBeenCalledTimes(1); expect(apply).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/fake-refund-transaction|fake-original|fake-secret|fake-mid/u);
  });
  it.each([
    response({ refund_id: "wrong" }), response({ transaction_id: "wrong" }),
    response({ currency: "JPY" }), response({ refund_amount: "1.01" }),
    { ...response(), rescode: "9999" }, { ...response(), unexpected: true },
    response({ status: "SALE" }),
  ])("rejects non-exact provider proof %# with zero application", async body => {
    const apply = vi.fn(); const fetch = fakeFetch(body);
    const result = await runEximbayContactedRefundSuccessCloseOnce(target.commandId, env, {
      readDatabase: () => Promise.resolve({ row: fixture(), databaseDisconnected: true, databaseReadSucceeded: true }),
      fetch, readSecret: () => Promise.resolve("fake-secret"), apply,
    });
    expect(result.outcome).toBe("REJECTED"); expect(apply).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry failed inquiry", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("private"));
    const apply = vi.fn();
    const result = await runEximbayContactedRefundSuccessCloseOnce(target.commandId, env, {
      readDatabase: () => Promise.resolve({ row: fixture(), databaseDisconnected: true, databaseReadSucceeded: true }),
      fetch, readSecret: () => Promise.resolve("fake-secret"), apply,
    });
    expect(result.inquiryCount).toBe(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });
  it("binds every authority fact and rejects fabricated proof", () => {
    const proof = parseContactedRefundSuccessProof(response(), authority);
    if (!proof) throw new Error("missing fixture proof");
    expect(matchContactedRefundSuccessProof(proof, { ...authority, originalTransactionId: "wrong" })).toBeNull();
    expect(matchContactedRefundSuccessProof(proof, { ...authority, providerOperationKey: "wrong" })).toBeNull();
    expect(matchContactedRefundSuccessProof({ kind: "CONTACTED_REFUND_SUCCESS_PROOF" }, authority)).toBeNull();
    expect(config.mode).toBe("SANDBOX");
  });
  it("bundles the local owner without provider/authorization/lease/email delivery call paths", async () => {
    const bundled = await build({ entryPoints: ["src/lib/payment/refund/providers/eximbay/apply-contacted-success.ts"],
      bundle: true, write: false, platform: "node", packages: "external", format: "esm", treeShaking: true });
    const code = bundled.outputFiles[0].text;
    expect(code).not.toMatch(/fetch\(|executeEximbay|reconcileEximbay|acquireRefund|issueRefund|consumeEximbay|sendEmail|sendMail|leaseGeneration:\s*\{\s*increment/u);
    expect(code).toContain("enqueueRefundSucceededEmailIntent");
  });
  it("keeps cancel, reconciliation, lease, authorization, generation and delivery out of the compiled CLI", async () => {
    const bundled = await build({ entryPoints: ["scripts/eximbay-contacted-refund-success-close-once.ts"],
      bundle: true, write: false, platform: "node", packages: "external", format: "esm", treeShaking: true });
    const code = bundled.outputFiles[0].text;
    expect(code).not.toMatch(/executeEximbayCancel|createEximbayCancelPlan|reconcileEximbay|reconcileRefund/u);
    expect(code).not.toMatch(/requestRefundAuthorizationAdmission|continueLeasedEximbay|runWithRefundProviderContactAdmission/u);
    expect(code).not.toMatch(/acquireRefund|issueRefund|consumeEximbay|sendEmail|SendEmail|sendMail|leaseGeneration:\s*\{\s*increment/u);
    expect(code).not.toMatch(/\/cancel["`]/u);
    expect(code).toContain("/v1/payments/retrieve");
  });

});
