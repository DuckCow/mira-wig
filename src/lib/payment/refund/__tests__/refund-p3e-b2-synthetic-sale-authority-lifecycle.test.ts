import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CANARY_REFUND_ROLE_GRANTS_RESTORED,
  deriveSyntheticSaleLiveAuthority,
  EXACT_EFFECTIVE_PRIVILEGES_VERIFIED,
  prepareSyntheticSaleLiveAuthority,
  stopSyntheticSaleLiveAuthority,
  SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE,
  SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE,
  type SyntheticSaleAuthorityLifecycleDependencies,
} from "../../../../../scripts/refund-p3e-b2-synthetic-sale-authority-lifecycle";

const OPERATION_ID = "a".repeat(32);
const ROOT = process.cwd();
const GRANT_PATH = join(
  ROOT,
  "infra/refund-sandbox/p3e-b2/synthetic-sale/database-role-grants.sql",
);
const CONTRACT_PATH = join(
  ROOT,
  "infra/refund-sandbox/p3e-b2/contracts/synthetic-sale-authority-lifecycle-v1.json",
);

describe("P3E-B2 synthetic-sale authority lifecycle", () => {
  it("does not derive live authority from exact Cloud authority alone", () => {
    expect(deriveSyntheticSaleLiveAuthority(null, exactCloudAuthority())).toEqual({
      status: "NOT_READY",
      reason: "DATABASE_RUNTIME_AUTHORITY_REQUIRED",
    });
  });

  it("orders Market, database authority, and Cloud readiness before human Pay readiness", async () => {
    const fixture = lifecycleFixture();
    const prepared = await prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies);

    expect(fixture.calls).toEqual(["market", "grant", "materialize", "cloud-readback"]);
    expect(prepared).toEqual({
      operationId: OPERATION_ID,
      status: "READY_FOR_HUMAN_PAY_CONFIRMATION",
      marketPrecondition: "EXACT",
      databaseRuntimeAuthority: "EXACT",
      cloudRuntimeAuthority: "EXACT",
      liveAuthority: "EXACT",
      payBoundary: "HUMAN_CONFIRMATION_REQUIRED",
      automaticPaymentActions: 0,
    });
  });

  it("stops before the synthetic grant when the Market precondition fails", async () => {
    const fixture = lifecycleFixture({ marketFailure: true });

    await expect(prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies))
      .rejects.toThrow("market failed");
    expect(fixture.calls).toEqual(["market"]);
    expect(fixture.dependencies.applySyntheticSaleRoleGrants).not.toHaveBeenCalled();
    expect(fixture.dependencies.materializeRuntime).not.toHaveBeenCalled();
  });

  it("stops before runtime materialization when the synthetic grant fails", async () => {
    const fixture = lifecycleFixture({ grantFailure: true });

    await expect(prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies))
      .rejects.toThrow("grant failed");
    expect(fixture.calls).toEqual(["market", "grant"]);
  });

  it("requires the exact synthetic privilege postcondition before runtime materialization", async () => {
    const fixture = lifecycleFixture({ grantPostconditionMissing: true });

    await expect(prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies))
      .rejects.toMatchObject({ code: "SYNTHETIC_SALE_DATABASE_AUTHORITY_REQUIRED" });
    expect(fixture.calls).toEqual(["market", "grant"]);
    expect(fixture.dependencies.materializeRuntime).not.toHaveBeenCalled();
  });

  it("retires runtime and restores canonical authority after post-grant runtime failure", async () => {
    const fixture = lifecycleFixture({ runtimeFailure: true });

    await expect(prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies))
      .rejects.toMatchObject({ code: "SYNTHETIC_SALE_PREPARATION_FAILED_CLEANED" });
    expect(fixture.calls).toEqual([
      "market",
      "grant",
      "materialize",
      "retire",
      "restore",
    ]);
  });

  it("cleans up when materialization resolves but exact Cloud readiness is absent", async () => {
    const fixture = lifecycleFixture({ cloudAuthorityMissing: true });

    await expect(prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies))
      .rejects.toMatchObject({ code: "SYNTHETIC_SALE_PREPARATION_FAILED_CLEANED" });
    expect(fixture.calls).toEqual([
      "market",
      "grant",
      "materialize",
      "cloud-readback",
      "retire",
      "restore",
    ]);
  });

  it("cleans a human stop before Pay in runtime-first order", async () => {
    const fixture = lifecycleFixture();
    const prepared = await prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies);
    const stopped = await stopSyntheticSaleLiveAuthority(prepared, fixture.dependencies);

    expect(fixture.calls).toEqual([
      "market",
      "grant",
      "materialize",
      "cloud-readback",
      "retire",
      "restore",
    ]);
    expect(stopped).toEqual({
      operationId: OPERATION_ID,
      status: "CANONICAL_SAFE_STATE",
      cloudRuntimeAuthority: "ABSENT",
      databaseRuntimeAuthority: "REFUND_ONLY_EXACT",
      purposeIamResidue: 0,
    });
  });

  it("does not restore database authority while runtime retirement is unproven", async () => {
    const fixture = lifecycleFixture({ retirementFailure: true });
    const prepared = await prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies);

    await expect(stopSyntheticSaleLiveAuthority(prepared, fixture.dependencies))
      .rejects.toMatchObject({ code: "SYNTHETIC_SALE_RUNTIME_RETIREMENT_REQUIRED" });
    expect(fixture.calls.slice(-1)).toEqual(["retire"]);
    expect(fixture.dependencies.restoreCanonicalRefundRoleGrants).not.toHaveBeenCalled();
  });

  it("requires the exact canonical restore postcondition after runtime retirement", async () => {
    const fixture = lifecycleFixture({ restorePostconditionMissing: true });
    const prepared = await prepareSyntheticSaleLiveAuthority(OPERATION_ID, fixture.dependencies);

    await expect(stopSyntheticSaleLiveAuthority(prepared, fixture.dependencies))
      .rejects.toMatchObject({ code: "CANONICAL_REFUND_AUTHORITY_RESTORE_REQUIRED" });
    expect(fixture.calls.slice(-2)).toEqual(["retire", "restore"]);
  });

  it("preserves the exact synthetic grant bytes and Market read-only boundary", () => {
    const grant = readFileSync(GRANT_PATH, "utf8");
    expect(createHash("sha256").update(grant).digest("hex"))
      .toBe("a414e4d5ddf1565e1d27763885c407cffbdc48c03487db8205302cc3c5cab470");
    expect(grant).toMatch(/"User", "Market", "WigStyle"/u);
    expect(grant).not.toMatch(/GRANT INSERT[^;]+"Market"/u);
    expect(grant).not.toMatch(/GRANT UPDATE[^;]+ON TABLE "Market"/u);
    expect(grant).not.toMatch(/GRANT DELETE[^;]+"Market"/u);
  });

  it("freezes the purpose-specific cross-root contract without Terraform coupling", () => {
    const contract: unknown = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
    expect(contract).toMatchObject({
      liveAuthorityInvariant: {
        cloudRuntimeAuthorityAloneSufficient: false,
        databaseRuntimeAuthority: EXACT_EFFECTIVE_PRIVILEGES_VERIFIED,
        cloudRuntimeAuthority: "EXACT_AND_READY",
      },
      terraformOwnership: {
        stateRootsRemainSeparate: true,
        syntheticServiceRootDatabaseResources: 0,
        crossRootTerraformCoupling: false,
      },
      providerBoundary: {
        readyCalls: 0,
        requestPayCalls: 0,
        saleCalls: 0,
        automaticRetries: 0,
      },
    });
  });
});

function lifecycleFixture(options: Readonly<{
  marketFailure?: boolean;
  grantFailure?: boolean;
  grantPostconditionMissing?: boolean;
  runtimeFailure?: boolean;
  retirementFailure?: boolean;
  cloudAuthorityMissing?: boolean;
  restorePostconditionMissing?: boolean;
}> = {}) {
  const calls: string[] = [];
  const dependencies: SyntheticSaleAuthorityLifecycleDependencies = {
    materializeMarketPrecondition: vi.fn(() => {
      calls.push("market");
      if (options.marketFailure) return Promise.reject(new Error("market failed"));
      return Promise.resolve({
        code: SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE,
        postconditionRowCount: 1,
      });
    }),
    applySyntheticSaleRoleGrants: vi.fn(() => {
      calls.push("grant");
      if (options.grantFailure) return Promise.reject(new Error("grant failed"));
      return Promise.resolve({
        code: SYNTHETIC_SALE_ROLE_GRANTS_COMPLETE,
        postcondition: options.grantPostconditionMissing
          ? "NOT_VERIFIED"
          : EXACT_EFFECTIVE_PRIVILEGES_VERIFIED,
      });
    }),
    materializeRuntime: vi.fn(() => {
      calls.push("materialize");
      return options.runtimeFailure
        ? Promise.reject(new Error("runtime failed"))
        : Promise.resolve();
    }),
    readCloudRuntimeAuthority: vi.fn(() => {
      calls.push("cloud-readback");
      return Promise.resolve(options.cloudAuthorityMissing ? {
        service: "mira-p3e-sbx-synthetic-sale",
        authority: "EXACT",
        ready: false,
      } : exactCloudAuthority());
    }),
    retireRuntime: vi.fn(() => {
      calls.push("retire");
      if (options.retirementFailure) return Promise.reject(new Error("retirement failed"));
      return Promise.resolve({
        service: "mira-p3e-sbx-synthetic-sale",
        authority: "ABSENT",
        purposeIamResidue: 0,
      });
    }),
    restoreCanonicalRefundRoleGrants: vi.fn(() => {
      calls.push("restore");
      return Promise.resolve({
        code: CANARY_REFUND_ROLE_GRANTS_RESTORED,
        postcondition: options.restorePostconditionMissing
          ? "NOT_VERIFIED"
          : EXACT_EFFECTIVE_PRIVILEGES_VERIFIED,
      });
    }),
  };
  return Object.freeze({ calls, dependencies });
}

function exactCloudAuthority() {
  return Object.freeze({
    service: "mira-p3e-sbx-synthetic-sale",
    authority: "EXACT",
    ready: true,
  });
}
