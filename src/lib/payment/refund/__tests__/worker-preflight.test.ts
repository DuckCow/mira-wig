import { describe, expect, it } from "vitest";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
} from "../execution-activation";
import {
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
} from "@/lib/payment/providers/credentials";
import {
  EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING,
} from "../providers/eximbay/refund-worker-config";
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
  [EXIMBAY_SANDBOX_API_KEY]: "synthetic-api-key-never-log",
};
const EXIMBAY_ENABLED = {
  [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
  [EXIMBAY_SANDBOX_MID]: "synthetic-mid",
  [EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING]: "merchant-test-1",
  [EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING]: "generation-test-1",
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
    expect(result).toMatchObject({
      ok: true,
      readiness: { [candidateClass]: { TOSS: false } },
    });
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
      readiness: {
        CONTACTED: { TOSS: true, EXIMBAY: true },
        UNCONTACTED: { TOSS: true, EXIMBAY: true },
        READY: { TOSS: true, EXIMBAY: true },
      },
    });
  });

  it("does not require the recontact gate for any route", () => {
    const result = preflightRefundExecutionWorkerRoutes(
      queues("READY", "UNCONTACTED", "CONTACTED"),
      ALL_ENABLED,
    );
    expect(result).toEqual({
      ok: true,
      readiness: {
        CONTACTED: { TOSS: true, EXIMBAY: true },
        UNCONTACTED: { TOSS: true, EXIMBAY: true },
        READY: { TOSS: true, EXIMBAY: true },
      },
    });
  });

  it("fails closed before contact when a selected Eximbay route has absent config", () => {
    expect(preflightRefundExecutionWorkerRoutes(
      eximbayQueues("READY"),
      {
        [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
        [REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED]: "ENABLED",
      },
      { eximbay: true },
    )).toMatchObject({ ok: false, code: "CONFIG_INVALID" });
  });

  it("keeps provider readiness independent in a mixed class", () => {
    const mixed = {
      CONTACTED: [],
      UNCONTACTED: [],
      READY: [
        { commandId: "t", candidateClass: "READY" as const, provider: "TOSS" as const },
        { commandId: "e", candidateClass: "READY" as const, provider: "EXIMBAY" as const },
      ],
    };
    const result = preflightRefundExecutionWorkerRoutes(
      mixed,
      { ...ALL_ENABLED, ...EXIMBAY_ENABLED },
      { eximbay: true },
    );
    expect(result).toMatchObject({
      ok: true,
      readiness: { READY: { TOSS: true, EXIMBAY: true } },
    });
    expect(preflightRefundExecutionWorkerRoutes(
      mixed,
      { ...ALL_ENABLED, ...EXIMBAY_ENABLED },
      { eximbay: false },
    )).toMatchObject({
      ok: true,
      readiness: { READY: { TOSS: true, EXIMBAY: false } },
    });
  });
});

function eximbayQueues(candidateClass: RefundExecutionWorkerCandidateClass) {
  return {
    CONTACTED: candidateClass === "CONTACTED"
      ? [{ commandId: "ec", candidateClass, provider: "EXIMBAY" as const }]
      : [],
    UNCONTACTED: candidateClass === "UNCONTACTED"
      ? [{ commandId: "eu", candidateClass, provider: "EXIMBAY" as const }]
      : [],
    READY: candidateClass === "READY"
      ? [{ commandId: "er", candidateClass, provider: "EXIMBAY" as const }]
      : [],
  };
}

function queues(...classes: readonly RefundExecutionWorkerCandidateClass[]) {
  return {
    CONTACTED: classes.includes("CONTACTED")
      ? [{ commandId: "c", candidateClass: "CONTACTED" as const, provider: "TOSS" as const }]
      : [],
    UNCONTACTED: classes.includes("UNCONTACTED")
      ? [{ commandId: "u", candidateClass: "UNCONTACTED" as const, provider: "TOSS" as const }]
      : [],
    READY: classes.includes("READY")
      ? [{ commandId: "r", candidateClass: "READY" as const, provider: "TOSS" as const }]
      : [],
  };
}
