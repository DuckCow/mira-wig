import { describe, expect, it, vi } from "vitest";
import { ConfiguredTossRefundCredential } from "../providers/toss/refund-credential-config";
import { inspectRefundCredentialLifecycle } from "../refund-operations-credential";
import { runRefundOperationsHost } from "../run-refund-operations-host";
import type { RefundOperationsHostDependencies } from "../run-refund-operations-host";
import { compareRefundWorkerMigrations } from "../worker-migration-readiness";

describe("refund credential lifecycle assessment", () => {
  it("reports absent metadata with no database or provider activity", async () => {
    const fixture = dependencies();
    expect(await runRefundOperationsHost(
      { kind: "CREDENTIAL" }, {}, fixture.dependencies,
    )).toEqual(expected("ABSENT"));
    expect(fixture.calls).toEqual(["credential"]);
  });

  it("reports configured synthetic metadata as single-active-only without reading the secret", async () => {
    const secretRead = vi.spyOn(ConfiguredTossRefundCredential.prototype, "readSecretKey");
    const fetchPoison = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("CREDENTIAL_FETCH_MUST_NOT_RUN"),
    );
    const fixture = dependencies();
    const env = {
      TOSS_SANDBOX_SECRET_KEY: "synthetic-not-a-real-secret",
      TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-sandbox",
      TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
    };

    expect(await runRefundOperationsHost(
      { kind: "CREDENTIAL" }, env, fixture.dependencies,
    )).toEqual(expected("CONFIGURED"));
    expect(secretRead).not.toHaveBeenCalled();
    expect(fetchPoison).not.toHaveBeenCalled();
    expect(fixture.calls).toEqual(["credential"]);
    vi.restoreAllMocks();
  });

  it.each([
    [{ TOSS_SANDBOX_SECRET_KEY: "partial" }],
    [{
      TOSS_SANDBOX_SECRET_KEY: "synthetic",
      TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "bad binding!",
      TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
    }],
    [{ REFUND_EXECUTION_WORKER_ENABLED: "true" }],
  ])("fails partial or malformed activation/credential grammar", async (env) => {
    const fixture = dependencies();
    expect(await runRefundOperationsHost(
      { kind: "CREDENTIAL" }, env, fixture.dependencies,
    )).toEqual({ ok: false, code: "CONFIG_INVALID" });
    expect(fixture.calls).toEqual(["credential"]);
  });
});

function dependencies() {
  const calls: string[] = [];
  const dependencies: RefundOperationsHostDependencies<object> = {
    inspectCredentialLifecycle: (env) => { calls.push("credential"); return inspectRefundCredentialLifecycle(env); },
    createDatabase: () => { calls.push("database"); return {}; },
    checkDatabaseConnectivity: () => { calls.push("connectivity"); return Promise.resolve(); },
    loadRepositoryMigrations: () => Promise.resolve([]),
    readMigrationLedger: () => Promise.resolve({ exists: true, records: [] }),
    compareMigrations: compareRefundWorkerMigrations,
    readManualReviewQueue: () => Promise.reject(new Error("MANUAL_MUST_NOT_RUN")),
    readReconciliationSnapshot: () => Promise.reject(new Error("RECONCILE_MUST_NOT_RUN")),
    disconnectDatabase: () => { calls.push("disconnect"); return Promise.resolve(); },
  };
  return { calls, dependencies };
}

function expected(credentialStatus: "ABSENT" | "CONFIGURED") {
  return {
    ok: true,
    code: "CREDENTIAL_LIFECYCLE_CHECK",
    credentialStatus,
    secretValidation: "NOT_PERFORMED",
    rotationCapability: "SINGLE_ACTIVE_ONLY",
    historicalGenerationResolution: false,
    revocationReadiness: "NOT_PROVABLE",
  };
}
