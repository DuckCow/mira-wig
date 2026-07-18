import { describe, expect, it } from "vitest";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
} from "../execution-activation";
import { preflightRefundExecutionWorkerRoutes } from "../worker-preflight";
import type { RefundExecutionWorkerCandidateClass } from "../worker-allocation";

const CREDENTIALS = {
  TOSS_SANDBOX_SECRET_KEY: "synthetic_test_secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-1",
};
const ALL_ENABLED = {
  ...CREDENTIALS,
  [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
};

describe("refund execution worker preflight", () => {
  it.each([
    ["READY", REFUND_EXECUTION_LEASE_ENABLED],
    ["UNCONTACTED", REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED],
    ["CONTACTED", REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED],
  ] as const)("skips selected %s candidates when a required gate is validly disabled", (
    candidateClass,
    disabledGate,
  ) => {
    const result = preflightRefundExecutionWorkerRoutes(
      queues(candidateClass),
      { ...ALL_ENABLED, [disabledGate]: "" },
    );
    expect(result).toMatchObject({ ok: true, readiness: { [candidateClass]: false } });
  });

  it("parses every selected class before mutation and rejects malformed configuration", () => {
    expect(preflightRefundExecutionWorkerRoutes(
      queues("READY", "CONTACTED"),
      { ...ALL_ENABLED, [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: "enabled" },
    )).toMatchObject({ ok: false, code: "CONFIG_INVALID" });
  });

  it("does not parse unused route gates or credentials for an empty selection", () => {
    const result = preflightRefundExecutionWorkerRoutes(queues(), {
      TOSS_SANDBOX_SECRET_KEY: "partial-secret",
      [REFUND_EXECUTION_LEASE_ENABLED]: "malformed-unused",
    });
    expect(result).toEqual({
      ok: true,
      readiness: { CONTACTED: true, UNCONTACTED: true, READY: true },
    });
  });

  it("does not require the recontact gate for any route", () => {
    const result = preflightRefundExecutionWorkerRoutes(
      queues("READY", "UNCONTACTED", "CONTACTED"),
      ALL_ENABLED,
    );
    expect(result).toEqual({
      ok: true,
      readiness: { CONTACTED: true, UNCONTACTED: true, READY: true },
    });
  });
});

function queues(...classes: readonly RefundExecutionWorkerCandidateClass[]) {
  return {
    CONTACTED: classes.includes("CONTACTED") ? [{ commandId: "c", candidateClass: "CONTACTED" as const }] : [],
    UNCONTACTED: classes.includes("UNCONTACTED") ? [{ commandId: "u", candidateClass: "UNCONTACTED" as const }] : [],
    READY: classes.includes("READY") ? [{ commandId: "r", candidateClass: "READY" as const }] : [],
  };
}
