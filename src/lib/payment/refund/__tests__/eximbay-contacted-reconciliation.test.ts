import { spawnSync } from "node:child_process";
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  PrismaClient,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it, vi } from "vitest";
import { recoverEximbayCheckout } from "@/lib/payment/eximbay/checkout-recovery";
import { buildRefundWorkerBundles } from
  "../../../../../scripts/build-refund-worker-bundles.mjs";
import { main as reconciliationProcessMain } from
  "../../../../../scripts/eximbay-contacted-reconciliation";
import {
  EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV,
  EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_PREDECESSOR_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_PREDECESSOR_RUN_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_RUN_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_RUN_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_RUN_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV,
} from "../eximbay-contacted-reconciliation-environment";
import {
  defaultEximbayContactedReconciliationDependencies,
  runEximbayContactedReconciliationOnce,
  selectFixedRecoveryTarget,
  type EximbayContactedReconciliationDependencies,
} from "../run-eximbay-contacted-reconciliation-once";

const DATABASE = new PrismaClient({
  adapter: new PrismaPg({ connectionString: "postgresql://fixture:fixture@localhost:5432/fixture" }),
});
const PROHIBITED = Object.freeze([
  "ready",
  "requestPay",
  "newPaymentVerify",
  "sale",
  "refund",
  "cancel",
] as const);

describe("fixed Eximbay CONTACTED reconciliation host", () => {
  it("selects only the latest fresh-sale successor and preserves all historical targets", () => {
    expect(EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID)
      .toBe("e03b436e666b4b188ec65c0ee4139790");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID)
      .toBe("cmtktx8rx000001s6lfbjivo1");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_RUN_ID)
      .toBe("4c5c9b039f18037c6f3356c903df1372");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_CHECKOUT_SESSION_ID)
      .toBe("cmtk62h80000001s626b90f9y");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_RUN_ID)
      .toBe("89682c544f42d4debb260f5e3186087a");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_CHECKOUT_SESSION_ID)
      .toBe("cmtjsiiqw000001s6uimkjhj5");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_PREDECESSOR_RUN_ID)
      .toBe("da7783b013d20713d6db207c7657b559");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_PREDECESSOR_CHECKOUT_SESSION_ID)
      .toBe("cmtjnvso1000001s60xfg0tyu");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_RUN_ID)
      .toBe("a764f61f4e4ba799ab16b318a676db65");
    expect(EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_CHECKOUT_SESSION_ID)
      .toBe("cmthg2mzu000001s6iuvx7u5x");
    expect(selectFixedRecoveryTarget({
      id: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
      userId: "current-user",
      payments: [eligiblePayment("payment-current")],
    })).toEqual({
      paymentId: "payment-current",
      authenticatedUserId: "current-user",
      kind: "ACTIVE",
    });
    expect(selectFixedRecoveryTarget({
      id: EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_CHECKOUT_SESSION_ID,
      userId: "predecessor-user",
      payments: [eligiblePayment("payment-predecessor")],
    })).toBeNull();
    expect(selectFixedRecoveryTarget({
      id: EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_CHECKOUT_SESSION_ID,
      userId: "predecessor-user",
      payments: [],
    })).toBeNull();
    for (const historicalCheckoutSessionId of [
      EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_CHECKOUT_SESSION_ID,
      EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_PREDECESSOR_CHECKOUT_SESSION_ID,
      EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_CHECKOUT_SESSION_ID,
    ]) {
      expect(selectFixedRecoveryTarget({
        id: historicalCheckoutSessionId,
        userId: "historical-user",
        payments: [eligiblePayment("historical-payment")],
      })).toBeNull();
    }
    expect(selectFixedRecoveryTarget({
      id: EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_CHECKOUT_SESSION_ID,
      userId: "original-historical-user",
      payments: [],
    })).toBeNull();
  });

  it("keeps the installed recovery owner as the default and surfaces Q004 release once", async () => {
    expect(defaultEximbayContactedReconciliationDependencies.recover)
      .toBe(recoverEximbayCheckout);
    const harness = createHarness(async (_database, input) => {
      await input.transport("https://provider.invalid/retrieve", { method: "POST" });
      return Object.freeze({
        kind: "released" as const,
        paymentId: "payment-1",
        eventId: "event-1",
        releasedAt: new Date("2026-09-01T00:00:00.000Z"),
      });
    });

    const result = await runEximbayContactedReconciliationOnce(validEnvironment(), harness.dependencies);

    expect(result).toEqual({
      ok: true,
      code: "CONTACTED_RECONCILIATION_COMPLETE",
      terminalClass: "RECONCILIATION_COMPLETED",
      runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
      checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
      disposition: "RELEASED_AFTER_Q004",
      providerRetrieveCount: 1,
      durableRelease: "PERFORMED",
    });
    expect(harness.recover).toHaveBeenCalledTimes(1);
    expect(harness.transport).toHaveBeenCalledTimes(1);
    expect(harness.loadTarget).toHaveBeenCalledTimes(1);
    expect(harness.loadTarget.mock.calls[0]?.[0]).toBe(DATABASE);
    expect(harness.loadTarget.mock.calls[0]?.[1])
      .toBe(EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID);
    expect(harness.disconnectDatabase).toHaveBeenCalledTimes(1);
    expectProhibitedCalls(harness.prohibited);
  });

  it("surfaces transaction observation without financial-completion language or another call", async () => {
    const harness = createHarness(async (_database, input) => {
      await input.transport("https://provider.invalid/retrieve", { method: "POST" });
      return checkoutTransactionObservation();
    });

    const result = await runEximbayContactedReconciliationOnce(validEnvironment(), harness.dependencies);

    expect(result).toMatchObject({
      ok: true,
      disposition: "TRANSACTION_OBSERVED",
      providerRetrieveCount: 1,
      durableRelease: "NOT_REPORTED",
      providerObservation: {
        schema: "eximbay.contacted-reconciliation.provider-observation",
        version: 1,
        application: {
          operationRunId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
          checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
          paymentId: "payment-1",
          providerOrderId: "provider-payment-1",
          expectedAmountMinor: 100,
          expectedCurrency: "USD",
        },
        providerResult: {
          admission: "TRANSACTION_DETAIL_ADMITTED",
          resultCode: "0000",
          mode: "SANDBOX",
          binding: { merchant: "MATCH", providerOrder: "MATCH", money: "MATCH" },
          provider: {
            transactionId: "transaction-1",
            orderId: "provider-payment-1",
            status: "SALE",
            amount: "1.00",
            currency: "USD",
            transactionDate: "20260901010203",
          },
        },
      },
    });
    expect(harness.recover).toHaveBeenCalledTimes(1);
    expect(harness.transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/PAYMENT_SUCCEEDED|SALE_SUCCEEDED|FRESH_SALE|REFUND/iu);
    expectProhibitedCalls(harness.prohibited);
  });

  it("retains validated provider observation when database disconnect fails", async () => {
    const harness = createHarness(async (_database, input) => {
      await input.transport("https://provider.invalid/retrieve", { method: "POST" });
      return checkoutTransactionObservation();
    }, {
      disconnectDatabase: () => Promise.reject(new Error("SYNTHETIC_DISCONNECT_FAILURE")),
    });

    const result = await runEximbayContactedReconciliationOnce(
      validEnvironment(),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "INTERNAL_FAILURE",
      terminalClass: "HOST_FAILURE",
      providerRetrieveCount: 1,
      durableRelease: "NOT_REPORTED",
      cleanupFailure: "DATABASE_DISCONNECT_FAILED",
      providerObservation: {
        application: {
          operationRunId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
          paymentId: "payment-1",
          expectedAmountMinor: 100,
        },
        providerResult: {
          admission: "TRANSACTION_DETAIL_ADMITTED",
          provider: { transactionId: "transaction-1", amount: "1.00", currency: "USD" },
        },
      },
    });
    expect(harness.disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(harness.transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_DISCONNECT_FAILURE|SYNTHETIC_SECRET/iu);
    expectProhibitedCalls(harness.prohibited);
  });

  it("preserves an incomplete non-Q004 provider header without inventing transaction facts", async () => {
    const harness = createHarness(async (_database, input) => {
      await input.transport("https://provider.invalid/retrieve", { method: "POST" });
      const observed = checkoutTransactionObservation();
      return Object.freeze({
        ...observed,
        providerObservation: Object.freeze({
          ...observed.providerObservation,
          providerResult: Object.freeze({
            admission: "INCOMPLETE_TRANSACTION_DETAIL" as const,
            resultCode: "0000" as const,
            mode: "SANDBOX" as const,
            binding: Object.freeze({
              merchant: "NOT_ESTABLISHED" as const,
              providerOrder: "NOT_ESTABLISHED" as const,
              money: "NOT_ESTABLISHED" as const,
            }),
            provider: null,
          }),
        }),
      });
    });

    const result = await runEximbayContactedReconciliationOnce(
      validEnvironment(),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      ok: true,
      disposition: "TRANSACTION_OBSERVED",
      providerRetrieveCount: 1,
      providerObservation: {
        providerResult: {
          admission: "INCOMPLETE_TRANSACTION_DETAIL",
          resultCode: "0000",
          binding: {
            merchant: "NOT_ESTABLISHED",
            providerOrder: "NOT_ESTABLISHED",
            money: "NOT_ESTABLISHED",
          },
          provider: null,
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/transactionId|"status"|"amount"/u);
    expectProhibitedCalls(harness.prohibited);
  });

  it("terminates transport ambiguity as OUTCOME_UNKNOWN without retry or eligibility claims", async () => {
    const harness = createHarness(async (_database, input) => {
      await ignoreSyntheticAmbiguity(
        input.transport("https://provider.invalid/retrieve", { method: "POST" }),
      );
      input.emitDiagnostic?.("SYNTHETIC_REDUNDANT_DIAGNOSTIC");
      return Object.freeze({ kind: "notReleased" as const, reason: "OUTCOME_UNKNOWN" as const });
    }, { transport: () => Promise.reject(new Error("SYNTHETIC_TRANSPORT_AMBIGUITY")) });

    const result = await runEximbayContactedReconciliationOnce(validEnvironment(), harness.dependencies);

    expect(result).toMatchObject({
      ok: true,
      disposition: "OUTCOME_UNKNOWN",
      providerRetrieveCount: 1,
      durableRelease: "NOT_REPORTED",
    });
    expect(harness.transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/FRESH_SALE|FINANCIAL_SUCCESS|REFUND_ELIGIBLE/iu);
    expectProhibitedCalls(harness.prohibited);
  });

  it("surfaces an installed replay with zero provider contact and no credential read", async () => {
    const harness = createHarness(() => Promise.resolve(Object.freeze({
      kind: "replayed" as const,
      paymentId: "payment-1",
      eventId: "event-1",
      releasedAt: new Date("2026-09-01T00:00:00.000Z"),
    })), { targetKind: "REPLAY" });

    const result = await runEximbayContactedReconciliationOnce(validEnvironment(), harness.dependencies);

    expect(result).toMatchObject({
      ok: true,
      disposition: "REPLAYED_ALREADY_RELEASED",
      providerRetrieveCount: 0,
      durableRelease: "OBSERVED_EXISTING",
    });
    expect(harness.recover).toHaveBeenCalledTimes(1);
    expect(harness.transport).not.toHaveBeenCalled();
    expect(harness.readSecret).not.toHaveBeenCalled();
    expectProhibitedCalls(harness.prohibited);
  });

  it.each([
    ["missing run identity", { [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]: undefined }],
    ["malformed run identity", { [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]: "not-a-run" }],
    ["unexpected run identity", { [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]: "b".repeat(32) }],
    ["predecessor run identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_RUN_ID,
    }],
    ["historical predecessor run identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_RUN_ID,
    }],
    ["older historical predecessor run identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_PREDECESSOR_RUN_ID,
    }],
    ["original historical run identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_RUN_ID,
    }],
    ["missing checkout identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]: undefined,
    }],
    ["malformed checkout identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]: "not-a-checkout",
    }],
    ["unexpected checkout identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]: "cmwrong0000000000000000000",
    }],
    ["predecessor checkout identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_CHECKOUT_SESSION_ID,
    }],
    ["historical predecessor checkout identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_CHECKOUT_SESSION_ID,
    }],
    ["older historical predecessor checkout identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_HISTORICAL_PREDECESSOR_PREDECESSOR_CHECKOUT_SESSION_ID,
    }],
    ["original historical checkout identity", {
      [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]:
        EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_CHECKOUT_SESSION_ID,
    }],
    ["wrong task count", { CLOUD_RUN_TASK_COUNT: "2" }],
    ["retry attempt", { CLOUD_RUN_TASK_ATTEMPT: "1" }],
    ["missing sandbox gate", { EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED: undefined }],
    ["live provider surface", { EXIMBAY_LIVE_API_KEY: "forbidden" }],
  ])("rejects %s before database or provider contact", async (_name, mutation) => {
    const harness = createHarness();
    const result = await runEximbayContactedReconciliationOnce(
      { ...validEnvironment(), ...mutation },
      harness.dependencies,
    );
    expect(result).toMatchObject({ ok: false, code: "CONFIG_INVALID", providerRetrieveCount: 0 });
    expect(harness.createDatabase).not.toHaveBeenCalled();
    expect(harness.loadTarget).not.toHaveBeenCalled();
    expect(harness.readSecret).not.toHaveBeenCalled();
    expect(harness.recover).not.toHaveBeenCalled();
    expect(harness.transport).not.toHaveBeenCalled();
  });

  it.each([
    ["missing MID", { EXIMBAY_SANDBOX_MID: undefined }],
    ["missing secret resource", { MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE: undefined }],
    ["missing secret version", { MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: undefined }],
    ["mutable secret alias", { EXIMBAY_SANDBOX_API_KEY: "forbidden-direct-secret" }],
  ])("rejects %s before provider contact", async (_name, mutation) => {
    const harness = createHarness();
    const result = await runEximbayContactedReconciliationOnce(
      { ...validEnvironment(), ...mutation },
      harness.dependencies,
    );
    expect(result).toMatchObject({ ok: false, code: "CONFIG_INVALID", providerRetrieveCount: 0 });
    expect(harness.transport).not.toHaveBeenCalled();
    expect(harness.recover).not.toHaveBeenCalled();
  });

  it("rejects multiple candidate payments within the one exact fixed session", () => {
    const selected = selectFixedRecoveryTarget({
      id: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
      userId: "synthetic-user",
      payments: [eligiblePayment("payment-1"), eligiblePayment("payment-2")],
    });

    expect(selected).toBeNull();
  });

  it("hard-stops a second transport attempt before a second provider call", async () => {
    const harness = createHarness(async (_database, input) => {
      await input.transport("https://provider.invalid/retrieve", { method: "POST" });
      await input.transport("https://provider.invalid/retrieve", { method: "POST" });
      return Object.freeze({ kind: "notReleased" as const, reason: "OUTCOME_UNKNOWN" as const });
    });

    const result = await runEximbayContactedReconciliationOnce(validEnvironment(), harness.dependencies);

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_FAILURE", providerRetrieveCount: 1 });
    expect(harness.transport).toHaveBeenCalledTimes(1);
    expect(harness.recover).toHaveBeenCalledTimes(1);
    expectProhibitedCalls(harness.prohibited);
  });

  it("preserves one attempted retrieve when provider response classification fails", async () => {
    const harness = createHarness(async (_database, input) => {
      await input.transport("https://provider.invalid/retrieve", { method: "POST" });
      throw new Error("SYNTHETIC_PROVIDER_RESPONSE_CLASSIFICATION_FAILURE");
    });

    const result = await runEximbayContactedReconciliationOnce(
      validEnvironment(),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "INTERNAL_FAILURE",
      providerRetrieveCount: 1,
      durableRelease: "NOT_REPORTED",
    });
    expect(harness.transport).toHaveBeenCalledTimes(1);
    expect(harness.recover).toHaveBeenCalledTimes(1);
    expectProhibitedCalls(harness.prohibited);
  });

  it("keeps provider count zero for an internal failure before target selection completes", async () => {
    const harness = createHarness(undefined, {
      loadTarget: () => Promise.reject(new Error("SYNTHETIC_PRE_PROVIDER_FAILURE")),
    });

    const result = await runEximbayContactedReconciliationOnce(
      validEnvironment(),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "INTERNAL_FAILURE",
      providerRetrieveCount: 0,
      durableRelease: "NOT_REPORTED",
    });
    expect(harness.recover).not.toHaveBeenCalled();
    expect(harness.transport).not.toHaveBeenCalled();
    expectProhibitedCalls(harness.prohibited);
  });

  it("exits zero for a bounded OUTCOME_UNKNOWN record without claiming financial success", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const run = vi.fn(() => Promise.resolve(Object.freeze({
      ok: true,
      code: "CONTACTED_RECONCILIATION_COMPLETE" as const,
      terminalClass: "RECONCILIATION_COMPLETED" as const,
      runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
      checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
      disposition: "OUTCOME_UNKNOWN" as const,
      providerRetrieveCount: 1 as const,
      durableRelease: "NOT_REPORTED" as const,
    })));

    const exit = await reconciliationProcessMain([], validEnvironment(), output(stdout, stderr), run);

    expect(exit).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout).toHaveLength(1);
    const [terminal, trailing] = stdout[0]?.split("\n") ?? [];
    expect(trailing).toBe("");
    expect(JSON.parse(terminal ?? "null")).toEqual(await run.mock.results[0]?.value);
    expect(stdout[0]).toContain('"disposition":"OUTCOME_UNKNOWN"');
    expect(stdout[0]).not.toMatch(/PAYMENT_SUCCEEDED|SALE_SUCCEEDED|REFUND_SUCCEEDED/iu);
  });

  it("uses a nonzero config exit and exactly one secret-safe terminal line", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const run = vi.fn(() => Promise.resolve(Object.freeze({
      ok: false,
      code: "CONFIG_INVALID" as const,
      terminalClass: "HOST_FAILURE" as const,
      runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
      checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
      providerRetrieveCount: 0 as const,
      durableRelease: "NOT_REPORTED" as const,
    })));

    const exit = await reconciliationProcessMain([], validEnvironment(), output(stdout, stderr), run);

    expect(exit).toBe(78);
    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    const [terminal, trailing] = stderr[0]?.split("\n") ?? [];
    expect(trailing).toBe("");
    expect(JSON.parse(terminal ?? "null")).toEqual(await run.mock.results[0]?.value);
    expect(stderr[0]).not.toMatch(/DATABASE_URL|SYNTHETIC_SECRET|Authorization/iu);
  });

  it("boots the compiled child and emits one terminal instead of an import-time stack", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "mira-contacted-bundle-test-"));
    try {
      await symlink(join(process.cwd(), "node_modules"), join(temporaryRoot, "node_modules"), "dir");
      const bundleRoot = join(temporaryRoot, "bundles");
      await buildRefundWorkerBundles(bundleRoot);
      const result = executeCompiledChild(await realpath(join(
        bundleRoot,
        "src/lib/payment/refund/eximbay-contacted-reconciliation.mjs",
      )));

      expect(result.exitCode).toBe(78);
      expect(result.signal).toBeNull();
      expect(result.stdout).toBe("");
      const [terminal, trailing] = result.stderr.split("\n");
      expect(trailing).toBe("");
      expect(JSON.parse(terminal ?? "null")).toEqual({
        ok: false,
        code: "CONFIG_INVALID",
        terminalClass: "HOST_FAILURE",
        runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
        checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
        providerRetrieveCount: 0,
        durableRelease: "NOT_REPORTED",
      });
      expect(result.stderr).not.toMatch(
        /ReferenceError|\bat\s+node_modules|SYNTHETIC_SECRET_NEVER_LOG|PROVIDER_PAYLOAD_SENTINEL/iu,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

function createHarness(
  recovery: EximbayContactedReconciliationDependencies["recover"] = () => Promise.resolve(Object.freeze({
    kind: "notReleased" as const,
    reason: "NOT_ELIGIBLE" as const,
  })),
  overrides: Readonly<{
    transport?: EximbayContactedReconciliationDependencies["transport"];
    targetKind?: "ACTIVE" | "REPLAY";
    database?: PrismaClient;
    loadTarget?: EximbayContactedReconciliationDependencies["loadTarget"];
    disconnectDatabase?: EximbayContactedReconciliationDependencies["disconnectDatabase"];
  }> = {},
) {
  const database = overrides.database ?? DATABASE;
  const createDatabase = vi.fn(() => database);
  const disconnectDatabase = vi.fn(overrides.disconnectDatabase ?? (() => Promise.resolve()));
  const loadTarget = vi.fn(overrides.loadTarget ?? (() => Promise.resolve(Object.freeze({
    paymentId: "payment-1",
    authenticatedUserId: "synthetic-user",
    kind: overrides.targetKind ?? "ACTIVE",
  }))));
  const readSecret = vi.fn(() => Promise.resolve("SYNTHETIC_SECRET_NEVER_LOG"));
  const transport = vi.fn(overrides.transport ?? (() => Promise.resolve(
    new Response('{"rescode":"Q004","resmsg":"No transaction"}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  )));
  const recover = vi.fn(recovery);
  const prohibited = Object.fromEntries(PROHIBITED.map((name) => [name, vi.fn()]));
  return {
    createDatabase,
    disconnectDatabase,
    loadTarget,
    readSecret,
    transport,
    recover,
    prohibited,
    dependencies: Object.freeze({
      createDatabase,
      disconnectDatabase,
      loadTarget,
      readSecret,
      transport,
      recover,
    }) satisfies EximbayContactedReconciliationDependencies,
  };
}

function checkoutTransactionObservation() {
  return Object.freeze({
    kind: "notReleased" as const,
    reason: "TRANSACTION_OBSERVED" as const,
    providerObservation: Object.freeze({
      schema: "eximbay.checkout-recovery.provider-observation" as const,
      version: 1 as const,
      application: Object.freeze({
        checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
        paymentId: "payment-1",
        providerOrderId: "provider-payment-1",
        expectedAmountMinor: 100,
        expectedCurrency: "USD",
      }),
      providerResult: Object.freeze({
        admission: "TRANSACTION_DETAIL_ADMITTED" as const,
        resultCode: "0000" as const,
        mode: "SANDBOX" as const,
        binding: Object.freeze({
          merchant: "MATCH" as const,
          providerOrder: "MATCH" as const,
          money: "MATCH" as const,
        }),
        provider: Object.freeze({
          transactionId: "transaction-1",
          orderId: "provider-payment-1",
          status: "SALE" as const,
          amount: "1.00",
          currency: "USD",
          transactionDate: "20260901010203",
        }),
      }),
    }),
  });
}

function validEnvironment(): Record<string, string> {
  return {
    DATABASE_URL: "postgresql://fixture:fixture@localhost:5432/fixture",
    [EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV]: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    [EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV]:
      EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED: "ENABLED",
    EXIMBAY_SANDBOX_MID: "MIRA-SBX",
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE:
      "projects/mira-sbx1/secrets/eximbay-canary-key",
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "1",
    CLOUD_RUN_JOB: "contacted-reconciliation",
    CLOUD_RUN_EXECUTION: "execution-1",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  };
}

function eligiblePayment(id: string) {
  return {
    id,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    status: PaymentAttemptStatus.INITIATED,
    attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    remediationStatus: PaymentRemediationStatus.NONE,
    amount: 1_000,
    currency: "USD",
    providerOrderId: `provider-${id}`,
    providerPaymentKey: null,
    contactStartedAt: new Date("2026-09-01T00:00:00.000Z"),
    financialSucceededAt: null,
    blockingEndedAt: null,
    suspendedByPaymentId: null,
    errorCode: null,
  };
}

function expectProhibitedCalls(calls: Record<string, ReturnType<typeof vi.fn>>): void {
  for (const name of PROHIBITED) expect(calls[name]).toHaveBeenCalledTimes(0);
}

function output(stdout: string[], stderr: string[]) {
  return Object.freeze({
    stdout: Object.freeze({ write: (value: string) => stdout.push(value) }),
    stderr: Object.freeze({ write: (value: string) => stderr.push(value) }),
  });
}

async function ignoreSyntheticAmbiguity(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    return;
  }
}

function executeCompiledChild(path: string): Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  const child = spawnSync(process.execPath, [path], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      MIRA_TEST_SECRET_SENTINEL: "SYNTHETIC_SECRET_NEVER_LOG",
      MIRA_TEST_PROVIDER_PAYLOAD: "PROVIDER_PAYLOAD_SENTINEL",
    },
  });
  if (child.error) throw child.error;
  return Object.freeze({
    exitCode: child.status,
    signal: child.signal,
    stdout: child.stdout,
    stderr: child.stderr,
  });
}
