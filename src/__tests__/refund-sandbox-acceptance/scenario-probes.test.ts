import { describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import { AcceptanceBootstrap } from "../../../scripts/refund-sandbox-acceptance/bootstrap";
import { ProviderCallBudget } from "../../../scripts/refund-sandbox-acceptance/call-budget";
import {
  H1_CHANGED_CANCEL_REASON,
  changedReasonDiffersOnlyByReason,
} from "../../../scripts/refund-sandbox-acceptance/scenario-probes";
import { executeScenario } from "../../../scripts/refund-sandbox-acceptance/scenario-orchestrator";
import { deriveTossRefundCancellationWireRequest } from "../../lib/payment/refund/providers/toss/refund-wire-request";
import { deriveTossRefundOperationKey } from "../../lib/payment/refund/providers/toss/refund-operation-key";

const RUN_ID = "sbx-20260718T010203Z-0123456789abcdef";

describe("refund SANDBOX provider-only probes", () => {
  it.each(["S3", "S4"] as const)("executes %s without invoking the local bootstrap", async (scenarioId) => {
    const bootstrap = new AcceptanceBootstrap(db, "wig_platform_test");
    const bootstrapSpy = vi.spyOn(bootstrap, "createOrLoad");
    const requests: Array<Readonly<{ body: string; path: string }>> = [];
    const budget = new ProviderCallBudget();
    const fixture = fixtureFor(scenarioId);
    const result = await executeScenario({
      client: db,
      bootstrap,
      budget,
      env: Object.freeze({}),
      probeAuthorization: "Basic redacted-test-only",
      lookup: () => Promise.resolve(eligibleLookup(fixture)),
      cancellation: () => Promise.resolve(Object.freeze({ kind: "unknown" })),
      probePost: (wire, body) => {
        requests.push(Object.freeze({ body, path: wire.path }));
        return Promise.resolve(Object.freeze({ kind: "success", body: "{}" }));
      },
    }, { runId: RUN_ID, scenarioId, fixture, ledgerPhase: "PLANNED" });
    expect(result.ok).toBe(true);
    expect(bootstrapSpy).not.toHaveBeenCalled();
    expect(budget.counts(scenarioId)).toEqual({ GET: 2, POST: 2 });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.path).toBe(requests[1]?.path);
    if (scenarioId === "S3") expect(requests[0]?.body).toBe(requests[1]?.body);
    if (scenarioId === "S4") assertChangedReasonOnly(requests);
  });

  it("pins the changed-reason probe to exactly the reason field", () => {
    const wire = deriveTossRefundCancellationWireRequest({
      paymentKey: "probe-payment",
      providerOperationKey: deriveTossRefundOperationKey("mira-refund-probe-operation"),
      cancelAmount: 1_000,
    });
    expect(changedReasonDiffersOnlyByReason(wire)).toBe(true);
  });

  it("keeps S6 dormant with a zero-call budget until the optional diagnostic is prepared", async () => {
    const bootstrap = new AcceptanceBootstrap(db, "wig_platform_test");
    const bootstrapSpy = vi.spyOn(bootstrap, "createOrLoad");
    const budget = new ProviderCallBudget();
    const fixture = Object.freeze({
      scenarioId: "S6" as const,
      paymentKey: "payment-S6",
      providerOrderId: "provider-order-S6",
      amount: 1_000,
      currency: "KRW" as const,
      reference: "reference-S6",
    });
    const result = await executeScenario({
      client: db,
      bootstrap,
      budget,
      env: Object.freeze({}),
      probeAuthorization: "unused",
      lookup: () => Promise.reject(new Error("S6 must not GET")),
      cancellation: () => Promise.reject(new Error("S6 must not POST")),
      probePost: () => Promise.reject(new Error("S6 must not probe")),
    }, { runId: RUN_ID, scenarioId: "S6", fixture, ledgerPhase: "PLANNED" });
    expect(result.staticCodes).toEqual(["SKIPPED_NOT_AVAILABLE"]);
    expect(budget.counts("S6")).toEqual({ GET: 0, POST: 0 });
    expect(bootstrapSpy).not.toHaveBeenCalled();
  });
});

function fixtureFor(scenarioId: "S3" | "S4") {
  return Object.freeze({
    scenarioId,
    paymentKey: `payment-${scenarioId}`,
    providerOrderId: `provider-order-${scenarioId}`,
    amount: 1_000,
    currency: "KRW" as const,
    reference: `reference-${scenarioId}`,
  });
}

function eligibleLookup(fixture: ReturnType<typeof fixtureFor>) {
  return Object.freeze({
    kind: "response" as const,
    body: JSON.stringify({
      paymentKey: fixture.paymentKey,
      orderId: fixture.providerOrderId,
      method: "카드",
      easyPay: null,
      currency: "KRW",
      status: "DONE",
      totalAmount: fixture.amount,
      balanceAmount: fixture.amount,
      taxFreeAmount: 0,
      taxExemptionAmount: 0,
      cancels: null,
    }),
  });
}

function assertChangedReasonOnly(requests: readonly Readonly<{ body: string; path: string }>[]): void {
  const first: unknown = JSON.parse(requests[0]?.body ?? "null");
  const second: unknown = JSON.parse(requests[1]?.body ?? "null");
  expect(first).toEqual({ cancelReason: "Mira merchant refund", cancelAmount: 1_000 });
  expect(second).toEqual({ cancelReason: H1_CHANGED_CANCEL_REASON, cancelAmount: 1_000 });
}
