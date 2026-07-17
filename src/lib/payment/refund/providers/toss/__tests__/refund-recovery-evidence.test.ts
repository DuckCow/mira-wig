import {
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildProviderLookupObservationIdentity,
  buildTerminalRefundResultIdentity,
  latestContactedDispatch,
  planProviderLookupNonterminalEvidence,
  planProviderLookupSuccessEvidence,
} from "../refund-recovery-evidence";

const contacted = (ordinal: number) => Object.freeze({
  id: `dispatch-${ordinal}`,
  ordinal,
  state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
  contactMarkedAt: ordinal,
  hasContactProof: true,
});

describe("pure Toss recovery evidence identity and planning", () => {
  it("builds strict terminal and generation-scoped identities", () => {
    expect(buildTerminalRefundResultIdentity("command-1", 2)).toBe("refund-result:command-1:2");
    expect(buildProviderLookupObservationIdentity("command-1", 3))
      .toBe("refund-provider-lookup:command-1:3");
    expect(() => buildTerminalRefundResultIdentity(" command-1", 1)).toThrowError();
    expect(() => buildProviderLookupObservationIdentity("command-1", 0)).toThrowError();
  });

  it("attributes GET success to the greatest contacted ordinal", () => {
    const plan = planProviderLookupSuccessEvidence({
      commandId: "command-1", recoveryGeneration: 3,
      dispatches: [contacted(1), contacted(2)],
    });
    expect(plan?.dispatchAttemptId).toBe("dispatch-2");
    expect(plan?.sourceDedupKey).toBe("refund-result:command-1:2");
    expect(plan && Object.isFrozen(plan)).toBe(true);
  });

  it.each(["PROCESSING", "CONFLICT"] as const)("plans one %s lookup observation per generation", (disposition) => {
    const plan = planProviderLookupNonterminalEvidence({
      commandId: "command-1", recoveryGeneration: 2,
      dispatches: [contacted(1)], disposition,
    });
    expect(plan?.sourceDedupKey).toBe("refund-provider-lookup:command-1:2");
    expect(plan?.application).toBe(disposition === "PROCESSING"
      ? RefundExecutionEvidenceApplication.PARKED
      : RefundExecutionEvidenceApplication.CONFLICT);
  });

  it("rejects missing proof, resting authorization, and no contact", () => {
    expect(latestContactedDispatch([])).toBeNull();
    expect(latestContactedDispatch([{ ...contacted(1), hasContactProof: false }])).toBeNull();
    expect(latestContactedDispatch([{
      ...contacted(1), state: RefundExecutionDispatchAttemptState.AUTHORIZED,
      contactMarkedAt: null,
    }])).toBeNull();
  });
});
