import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createRefundExecutionWorkerRouter } from "../worker-router";
import type { RefundExecutionWorkerCandidate } from "../worker-allocation";
import {
  REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
} from "../execution-activation";

describe("refund execution worker provider dispatch", () => {
  it("fails closed for an unsupported durable provider before any provider port", async () => {
    let calls = 0;
    const route = createRefundExecutionWorkerRouter({
      lookup: () => {
        calls += 1;
        return Promise.reject(new Error("unreachable"));
      },
      cancellation: () => {
        calls += 1;
        return Promise.reject(new Error("unreachable"));
      },
    });
    const candidate: RefundExecutionWorkerCandidate = {
      commandId: "unsupported",
      candidateClass: "READY",
      provider: "TOSS",
    };
    Object.defineProperty(candidate, "provider", { value: "PAYPAL" });

    expect(await route(db, candidate, "worker", {})).toEqual({
      kind: "INCONSISTENT",
      selectorRaceLoss: false,
    });
    expect(calls).toBe(0);
  });

  it("cannot route Eximbay without its provider-owned dependencies", async () => {
    const route = createRefundExecutionWorkerRouter({
      lookup: () => Promise.reject(new Error("unreachable")),
      cancellation: () => Promise.reject(new Error("unreachable")),
    });
    expect(await route(db, {
      commandId: "eximbay",
      candidateClass: "READY",
      provider: "EXIMBAY",
    }, "worker", {})).toEqual({ kind: "SKIPPED", selectorRaceLoss: false });
  });

  it("does not let the worker master alone admit Eximbay", async () => {
    let calls = 0;
    const route = createRefundExecutionWorkerRouter({
      lookup: () => Promise.reject(new Error("unreachable")),
      cancellation: () => Promise.reject(new Error("unreachable")),
      eximbay: {
        config: {
          mode: "SANDBOX",
          mid: "synthetic-mid",
          merchantAccountBindingId: "merchant-test-1",
          credentialGenerationBindingId: "generation-test-1",
        },
        retrieve: () => { calls += 1; return Promise.reject(new Error("unreachable")); },
        cancellation: () => { calls += 1; return Promise.reject(new Error("unreachable")); },
        lookup: () => { calls += 1; return Promise.reject(new Error("unreachable")); },
      },
    });
    const candidate = {
      commandId: "eximbay",
      candidateClass: "READY" as const,
      provider: "EXIMBAY" as const,
    };
    expect(await route(db, candidate, "worker", {
      [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
    })).toEqual({ kind: "SKIPPED", selectorRaceLoss: false });
    expect(await route(db, candidate, "worker", {
      [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
      [REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED]: "malformed",
    })).toEqual({ kind: "CONFIG_INVALID", selectorRaceLoss: false });
    expect(calls).toBe(0);
  });
});
