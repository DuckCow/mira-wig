import { describe, expect, it } from "vitest";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED,
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED,
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED,
} from "../execution-activation";
import { preflightRefundExecutionWorkerRoutes } from "../worker-preflight";
import { refundExecutionWorkerRouteReadiness } from "../worker-route-readiness";

const CREDENTIALS = Object.freeze({
  TOSS_SANDBOX_SECRET_KEY: "synthetic-secret",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "synthetic-merchant",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "synthetic-generation",
});
const ENABLED = "ENABLED";
const ROUTE_ENV = Object.freeze({
  ...CREDENTIALS,
  [REFUND_EXECUTION_LEASE_ENABLED]: ENABLED,
  [REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED]: ENABLED,
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: ENABLED,
  [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: ENABLED,
  [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: ENABLED,
  [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: ENABLED,
  [REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED]: ENABLED,
  [REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED]: ENABLED,
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: ENABLED,
});

describe("refund worker route readiness", () => {
  it("derives all four health routes from pure flags and credential classification", () => {
    expect(refundExecutionWorkerRouteReadiness(ROUTE_ENV, "CONFIGURED")).toEqual({
      READY: true,
      UNCONTACTED: true,
      CONTACTED_LOOKUP: true,
      CONTACTED_RECONTACT: true,
    });
    expect(refundExecutionWorkerRouteReadiness(ROUTE_ENV, "ABSENT")).toEqual({
      READY: false,
      UNCONTACTED: false,
      CONTACTED_LOOKUP: false,
      CONTACTED_RECONTACT: false,
    });
    expect(refundExecutionWorkerRouteReadiness({
      ...ROUTE_ENV,
      [REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED]: undefined,
    }, "CONFIGURED")).toMatchObject({
      CONTACTED_LOOKUP: true,
      CONTACTED_RECONTACT: false,
    });
  });

  it.each([
    ["READY", "READY"],
    ["UNCONTACTED", "UNCONTACTED"],
    ["CONTACTED", "CONTACTED_LOOKUP"],
  ] as const)("keeps %s preflight readiness equal to health %s readiness", (candidateClass, route) => {
    const queues = {
      READY: candidateClass === "READY"
        ? [{ commandId: "ready", candidateClass, provider: "TOSS" as const }]
        : [],
      UNCONTACTED: candidateClass === "UNCONTACTED"
        ? [{ commandId: "uncontacted", candidateClass, provider: "TOSS" as const }]
        : [],
      CONTACTED: candidateClass === "CONTACTED"
        ? [{ commandId: "contacted", candidateClass, provider: "TOSS" as const }]
        : [],
    };
    const preflight = preflightRefundExecutionWorkerRoutes(queues, ROUTE_ENV);
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) throw new Error("Expected route preflight readiness.");
    expect(preflight.readiness[candidateClass].TOSS).toBe(
      refundExecutionWorkerRouteReadiness(ROUTE_ENV, "CONFIGURED")[route],
    );
  });
});
