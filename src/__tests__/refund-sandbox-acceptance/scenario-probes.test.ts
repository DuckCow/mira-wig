import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import { AcceptanceBootstrap } from "../../../scripts/refund-sandbox-acceptance/bootstrap";
import {
  ProviderCallBudget,
  budgetRecordsFromPayload,
  protectedGetRequest,
  protectedPostRequest,
  H1_CHANGED_CANCEL_REASON,
  changedReasonDiffersOnlyByReason,
  type BudgetRecord,
  type S3CompletionClassification,
  type S3CompletionEvidence,
} from "../../../scripts/refund-sandbox-acceptance/call-budget";
import {
  completeS3DurableProof,
  executeProviderProbe,
} from "../../../scripts/refund-sandbox-acceptance/scenario-probes";
import { H1ArtifactStore } from "../../../scripts/refund-sandbox-acceptance/artifact-store";
import {
  providerCommand,
  type ProviderAdapterFactories,
} from "../../../scripts/refund-sandbox-acceptance/cli-runtime";
import {
  assertExactS3ReplayCallHistory,
  classifyS3History,
  createS3HistoryExpectation,
  planS3Command,
  type S3CommandAuthority,
} from "../../../scripts/refund-sandbox-acceptance/resume-planner";
import type {
  S3Continuation,
  S3DurableState,
} from "../../../scripts/refund-sandbox-acceptance/budget-ledger";
import {
  H1_FIXTURE_FORMAT_VERSION,
  H1_PROVIDER_TRUTH_NOTE,
  type FixtureManifest,
  type ProviderFixture,
} from "../../../scripts/refund-sandbox-acceptance/fixture-manifest";
import {
  RunLedgerStore,
  type H1LedgerPhase,
} from "../../../scripts/refund-sandbox-acceptance/run-ledger";
import { executeScenario } from "../../../scripts/refund-sandbox-acceptance/scenario-orchestrator";
import type {
  TossRefundCancellationContact,
  TossRefundCancellationTransportResult,
} from "../../lib/payment/refund/providers/toss/refund-cancellation-http";
import type {
  TossRefundLookupHttpResult,
} from "../../lib/payment/refund/providers/toss/refund-lookup-http";
import { deriveTossRefundCancellationWireRequest } from "../../lib/payment/refund/providers/toss/refund-wire-request";
import { deriveTossRefundOperationKey } from "../../lib/payment/refund/providers/toss/refund-operation-key";

const RUN_ID = "sbx-20260718T010203Z-0123456789abcdef";
const TRANSACTION_KEY = "synthetic-transaction-s3";
const TEST_HMAC_KEY = Buffer.alloc(32, 7);

describe("refund SANDBOX provider-only probes", () => {
  it("admits fresh S3 only after the canonical four-step durable proof", async () => {
    const fixture = fixtureFor("S3");
    const records: BudgetRecord[] = [];
    const budget = budgetWithIdentity([], records);
    const expectation = createS3HistoryExpectation(RUN_ID, fixture);
    const plan = continuationPlan(budget, fixture);
    let lookups = 0;
    const posts: string[] = [];
    const result = await executeProviderProbe({
      budget,
      probeAuthorization: "Basic redacted-test-only",
      lookup: () => {
        lookups += 1;
        return Promise.resolve(lookups === 1
          ? eligibleLookup(fixture)
          : successfulLookup(fixture, TRANSACTION_KEY));
      },
      cancellation: (contact) => {
        posts.push(JSON.stringify(contact.wire.body));
        return Promise.resolve(successfulPost(fixture, TRANSACTION_KEY, contact.wire.path));
      },
      probePost: () => Promise.reject(new Error("S3_PROBE_POST_FORBIDDEN")),
      s3Authority: plan.authority,
      s3Continuation: plan.continuation,
    }, { runId: RUN_ID, scenarioId: "S3", fixture });

    expect(result).toMatchObject({ ok: true, staticCodes: ["REPLAY_OBSERVED"] });
    expect(JSON.stringify(result)).not.toContain(TRANSACTION_KEY);
    expect(budget.intentCounts("S3")).toEqual({ GET: 2, POST: 2 });
    expect(budget.counts("S3")).toEqual({ GET: 2, POST: 2 });
    expect(posts).toHaveLength(2);
    expect(posts[0]).toBe(posts[1]);
    expect(JSON.stringify(records)).not.toContain(TRANSACTION_KEY);
    expect(records.filter((entry) => entry.completionEvidence?.transactionIdentityHmac))
      .toHaveLength(3);
    expect(classifyS3History(records, expectation)).toEqual({
      kind: "COMPLETE_SUCCESS", completedSteps: 4,
    });
  });

  it("preserves S4's existing two-GET/two-POST changed-reason behavior", async () => {
    const scenarioId = "S4";
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
    assertChangedReasonOnly(requests);
  });

  it.each([
    ["POST 1 rejected", Object.freeze({ kind: "rejected" as const })],
    ["POST 1 unknown", Object.freeze({ kind: "unknown" as const })],
    ["POST 1 malformed", Object.freeze({ kind: "success" as const, body: "{}" })],
  ])("records a safe failed completion when %s and makes no later call", async (_case, firstPost) => {
    const fixture = fixtureFor("S3");
    const records: BudgetRecord[] = [];
    const budget = budgetWithIdentity([], records);
    const expectation = createS3HistoryExpectation(RUN_ID, fixture);
    const plan = continuationPlan(budget, fixture);
    const post = vi.fn(() => Promise.resolve(firstPost));
    await expect(executeProviderProbe({
      budget,
      probeAuthorization: "Basic redacted-test-only",
      lookup: () => Promise.resolve(eligibleLookup(fixture)),
      cancellation: post,
      probePost: () => Promise.reject(new Error("S3_PROBE_POST_FORBIDDEN")),
      s3Authority: plan.authority,
      s3Continuation: plan.continuation,
    }, { runId: RUN_ID, scenarioId: "S3", fixture })).rejects.toThrow("S3_REPLAY_PROBE_FAILED");
    expect(post).toHaveBeenCalledTimes(1);
    expect(budget.intentCounts("S3")).toEqual({ GET: 1, POST: 1 });
    expect(classifyS3History(records, expectation).kind).toBe("FAILED");
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

describe("S3 successful-prefix production continuation", () => {
  it("runs all four calls from empty history", async () => {
    const run = await createS3CommandRun("sbx-20260719T040000Z-0000000000000001");
    try {
      const executed = await invokeCommand(run, "resume", fullSuccessResponses(run.fixture));
      expect(executed.result.code).toBe("SCENARIO_COMPLETE");
      expect(calledMethods(executed.adapter)).toEqual(["GET", "POST", "POST", "GET"]);
      await expectLocalReplay(run, 4);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("continues after successful initial GET without repeating it", async () => {
    const run = await createS3CommandRun("sbx-20260719T040000Z-0000000000000002", {
      outcomes: ["INITIAL_GET_ELIGIBLE"],
    });
    try {
      const executed = await invokeCommand(run, "resume", [
        successResponse(run.fixture), successResponse(run.fixture), successResponse(run.fixture),
      ]);
      expect(executed.result.code).toBe("SCENARIO_COMPLETE");
      expect(calledMethods(executed.adapter)).toEqual(["POST", "POST", "GET"]);
      await expectLocalReplay(run, 4);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("requires the human repost gate after successful POST 1, then starts at POST 2", async () => {
    const run = await createS3CommandRun("sbx-20260719T040000Z-0000000000000003", {
      outcomes: ["INITIAL_GET_ELIGIBLE", "POST_ACCEPTED"],
      phase: "POST_RESPONSE_RECORDED",
    });
    try {
      const before = await run.ledger.loadLatest();
      const gated = await invokeCommand(run, "resume", []);
      expect(gated.result.code).toBe("HUMAN_POST_DECISION_REQUIRED");
      expect(gated.adapter).not.toHaveBeenCalled();
      const decision = await run.ledger.loadLatest();
      expect(decision?.phase).toBe("HUMAN_POST_DECISION_REQUIRED");
      expect(decision?.payload.callRecords).toEqual(before?.payload.callRecords);

      const stillGated = await invokeCommand(run, "resume", []);
      expect(stillGated.result.code).toBe("HUMAN_POST_DECISION_REQUIRED");
      expect(stillGated.adapter).not.toHaveBeenCalled();
      expect(await run.ledger.loadLatest()).toEqual(decision);

      const resumed = await invokeCommand(run, "resume-post", [
        successResponse(run.fixture), successResponse(run.fixture),
      ]);
      expect(resumed.result.code).toBe("SCENARIO_COMPLETE");
      expect(calledMethods(resumed.adapter)).toEqual(["POST", "GET"]);
      await expectLocalReplay(run, 4);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("continues after successful POST 2 with only the final GET", async () => {
    const run = await createS3CommandRun("sbx-20260719T040000Z-0000000000000004", {
      outcomes: ["INITIAL_GET_ELIGIBLE", "POST_ACCEPTED", "POST_ACCEPTED"],
      phase: "POST_RESPONSE_RECORDED",
    });
    try {
      const executed = await invokeCommand(run, "resume", [successResponse(run.fixture)]);
      expect(executed.result.code).toBe("SCENARIO_COMPLETE");
      expect(calledMethods(executed.adapter)).toEqual(["GET"]);
      await expectLocalReplay(run, 4);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("commits a complete durable four-step proof without provider contact", async () => {
    const run = await createS3CommandRun("sbx-20260719T040000Z-0000000000000005", {
      outcomes: successfulOutcomes(),
      phase: "POST_RESPONSE_RECORDED",
    });
    try {
      const executed = await invokeCommand(run, "resume", []);
      expect(executed.result.code).toBe("SCENARIO_COMPLETE");
      expect(executed.adapter).not.toHaveBeenCalled();
      await expectLocalReplay(run, 4);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("keeps LOCAL_COMMIT_COMPLETE and pre-existing REPLAY_OBSERVED report-only", async () => {
    const run = await createS3CommandRun("sbx-20260719T040000Z-0000000000000006", {
      outcomes: successfulOutcomes(),
      phase: "LOCAL_COMMIT_COMPLETE",
      resultCode: "REPLAY_OBSERVED",
    });
    try {
      const before = await run.ledger.loadLatest();
      const resumed = await invokeCommand(run, "resume", []);
      const reposted = await invokeCommand(run, "resume-post", []);
      expect(resumed.result.code).toBe("REPORT_ONLY");
      expect(reposted.result.code).toBe("REPORT_ONLY");
      expect(resumed.adapter).not.toHaveBeenCalled();
      expect(reposted.adapter).not.toHaveBeenCalled();
      expect(await run.ledger.loadLatest()).toEqual(before);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });
});

describe("S3 credential ordering", () => {
  it.each([
    ["failed", ["INITIAL_GET_UNAVAILABLE"], undefined, "S3_REPLAY_PROBE_FAILED"],
    ["incomplete", ["INCOMPLETE"], undefined, "S3_PROVIDER_CALL_INCOMPLETE"],
    ["malformed", successfulOutcomes(), malformedFingerprint, "S3_PROVIDER_HISTORY_MALFORMED"],
  ] as const)("terminalizes %s history without credentials or adapters", async (
    _case, outcomes, mutate, expectedCode,
  ) => {
    const run = await createS3CommandRun(nextCredentialRunId(), {
      outcomes,
      phase: "POST_RESPONSE_RECORDED",
      ...(mutate ? { mutate } : {}),
    });
    const adapterFactories = inertAdapterFactories();
    try {
      const before = await run.ledger.loadLatest();
      const first = await invokeCommand(run, "resume", [], {
        env: Object.freeze({}), adapterFactories: adapterFactories.factories,
      });
      expect(first.result.code).toBe(expectedCode);
      expect(adapterFactories.createLookup).not.toHaveBeenCalled();
      expect(adapterFactories.createCancellation).not.toHaveBeenCalled();
      const terminal = await run.ledger.loadLatest();
      expect(terminal?.phase).toBe("REVIEW_REQUIRED");
      expect(terminal?.payload.callRecords).toEqual(before?.payload.callRecords);
      const second = await invokeCommand(run, "resume", [], {
        env: invalidCredentialEnv(), adapterFactories: adapterFactories.factories,
      });
      expect(second.result.code).toBe(expectedCode);
      expect(await run.ledger.loadLatest()).toEqual(terminal);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("finalizes a complete durable proof exactly once without credentials or adapters", async () => {
    const run = await createS3CommandRun(nextCredentialRunId(), {
      outcomes: successfulOutcomes(), phase: "POST_RESPONSE_RECORDED",
    });
    const adapterFactories = inertAdapterFactories();
    try {
      const before = await run.ledger.loadLatest();
      const first = await invokeCommand(run, "resume", [], {
        env: Object.freeze({}), adapterFactories: adapterFactories.factories,
      });
      expect(first.result.code).toBe("SCENARIO_COMPLETE");
      expect(adapterFactories.createLookup).not.toHaveBeenCalled();
      expect(adapterFactories.createCancellation).not.toHaveBeenCalled();
      const committed = await run.ledger.loadLatest();
      expect(committed?.revision).toBe((before?.revision ?? 0) + 1);
      expect(committed?.phase).toBe("LOCAL_COMMIT_COMPLETE");
      expect(committed?.payload.resultCode).toEqual(["REPLAY_OBSERVED"]);
      const second = await invokeCommand(run, "resume", [], {
        env: invalidCredentialEnv(), adapterFactories: adapterFactories.factories,
      });
      expect(second.result.code).toBe("REPORT_ONLY");
      expect(await run.ledger.loadLatest()).toEqual(committed);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("keeps a pre-existing local commit report-only without credentials or adapters", async () => {
    const run = await createS3CommandRun(nextCredentialRunId(), {
      outcomes: successfulOutcomes(),
      phase: "LOCAL_COMMIT_COMPLETE",
      resultCode: "REPLAY_OBSERVED",
    });
    const adapterFactories = inertAdapterFactories();
    try {
      const before = await run.ledger.loadLatest();
      for (const command of ["resume", "resume-post"] as const) {
        const result = await invokeCommand(run, command, [], {
          env: Object.freeze({}), adapterFactories: adapterFactories.factories,
        });
        expect(result.result.code).toBe("REPORT_ONLY");
      }
      expect(adapterFactories.createLookup).not.toHaveBeenCalled();
      expect(adapterFactories.createCancellation).not.toHaveBeenCalled();
      expect(await run.ledger.loadLatest()).toEqual(before);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("records and returns the human gate without credentials or adapters", async () => {
    const run = await createS3CommandRun(nextCredentialRunId(), {
      outcomes: ["INITIAL_GET_ELIGIBLE", "POST_ACCEPTED"],
      phase: "POST_RESPONSE_RECORDED",
    });
    const adapterFactories = inertAdapterFactories();
    try {
      const before = await run.ledger.loadLatest();
      const first = await invokeCommand(run, "resume", [], {
        env: Object.freeze({}), adapterFactories: adapterFactories.factories,
      });
      expect(first.result.code).toBe("HUMAN_POST_DECISION_REQUIRED");
      const gated = await run.ledger.loadLatest();
      expect(gated?.revision).toBe((before?.revision ?? 0) + 1);
      expect(gated?.payload.callRecords).toEqual(before?.payload.callRecords);
      const second = await invokeCommand(run, "resume", [], {
        env: invalidCredentialEnv(), adapterFactories: adapterFactories.factories,
      });
      expect(second.result.code).toBe("HUMAN_POST_DECISION_REQUIRED");
      expect(await run.ledger.loadLatest()).toEqual(gated);
      expect(adapterFactories.createLookup).not.toHaveBeenCalled();
      expect(adapterFactories.createCancellation).not.toHaveBeenCalled();
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["empty history", [], "PLANNED", "resume"],
    ["initial GET prefix", ["INITIAL_GET_ELIGIBLE"], "PLANNED", "resume"],
    ["human-authorized POST continuation", ["INITIAL_GET_ELIGIBLE", "POST_ACCEPTED"], "HUMAN_POST_DECISION_REQUIRED", "resume-post"],
    ["POST 2 prefix", ["INITIAL_GET_ELIGIBLE", "POST_ACCEPTED", "POST_ACCEPTED"], "POST_RESPONSE_RECORDED", "resume"],
  ] as const)("requires credentials before reserving provider work for %s", async (
    _case, outcomes, phase, command,
  ) => {
    const run = await createS3CommandRun(nextCredentialRunId(), { outcomes, phase });
    const adapterFactories = inertAdapterFactories();
    try {
      const before = await run.ledger.loadLatest();
      await expect(invokeCommand(run, command, [], {
        env: Object.freeze({}), adapterFactories: adapterFactories.factories,
      })).rejects.toThrow("SANDBOX_CREDENTIAL_INVALID");
      expect(adapterFactories.createLookup).not.toHaveBeenCalled();
      expect(adapterFactories.createCancellation).not.toHaveBeenCalled();
      const after = await run.ledger.loadLatest();
      expect(after?.payload.callRecords ?? []).toEqual(before?.payload.callRecords ?? []);
      expect(countIntentRecords(after?.payload.callRecords)).toBe(countIntentRecords(before?.payload.callRecords));
      expect(after?.phase).not.toBe("REVIEW_REQUIRED");
      expect(after?.payload.resultCode).toBeUndefined();
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });
});

describe("S3 failed, incomplete, and malformed terminalization", () => {
  it.each([
    ["initial GET intent without completion", ["INCOMPLETE"], "PLANNED", "S3_PROVIDER_CALL_INCOMPLETE"],
    ["failed initial GET", ["INITIAL_GET_UNAVAILABLE"], "PLANNED", "S3_REPLAY_PROBE_FAILED"],
    ["failed POST 1", ["INITIAL_GET_ELIGIBLE", "POST_REJECTED"], "POST_RESPONSE_RECORDED", "S3_REPLAY_PROBE_FAILED"],
    ["failed POST 2", ["INITIAL_GET_ELIGIBLE", "POST_ACCEPTED", "POST_REJECTED"], "POST_RESPONSE_RECORDED", "S3_REPLAY_PROBE_FAILED"],
    ["failed final GET", ["INITIAL_GET_ELIGIBLE", "POST_ACCEPTED", "POST_ACCEPTED", "FINAL_GET_UNAVAILABLE"], "POST_RESPONSE_RECORDED", "S3_REPLAY_PROBE_FAILED"],
  ] as const)("terminalizes %s exactly once", async (_case, outcomes, phase, code) => {
    const suffix = String(terminalCaseCounter++).padStart(16, "0");
    const run = await createS3CommandRun(`sbx-20260719T050000Z-${suffix}`, { outcomes, phase });
    try {
      await assertTerminalExecution(run, code);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["malformed GET path", malformedGetPath],
    ["malformed POST path", malformedPostPath],
    ["malformed POST body", malformedPostBody],
    ["incorrect fingerprint", malformedFingerprint],
    ["duplicate intent identity", duplicateIntent],
    ["duplicate completion", duplicateCompletion],
    ["completion without intent", completionWithoutIntent],
    ["gap in a successful prefix", skippedIdentity],
    ["extra fifth call", extraFifthCall],
    ["legacy completion without safe classification", legacyCompletionEvidenceMissing],
  ])("terminalizes %s without reserving or contacting", async (_case, mutate) => {
    const suffix = String(terminalCaseCounter++).padStart(16, "0");
    const run = await createS3CommandRun(`sbx-20260719T050000Z-${suffix}`, {
      outcomes: successfulOutcomes(),
      phase: "POST_RESPONSE_RECORDED",
      mutate,
    });
    try {
      await assertTerminalExecution(run, "S3_PROVIDER_HISTORY_MALFORMED");
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("keeps pre-existing REVIEW_REQUIRED stable for resume and resume-post", async () => {
    const run = await createS3CommandRun("sbx-20260719T050000Z-0000000000000099", {
      outcomes: ["INITIAL_GET_UNAVAILABLE"],
      phase: "REVIEW_REQUIRED",
      resultCode: "S3_REPLAY_PROBE_FAILED",
    });
    try {
      const before = await run.ledger.loadLatest();
      const first = await invokeCommand(run, "resume", []);
      const second = await invokeCommand(run, "resume-post", []);
      expect(first.result.code).toBe("S3_REPLAY_PROBE_FAILED");
      expect(second.result.code).toBe("S3_REPLAY_PROBE_FAILED");
      expect(first.adapter).not.toHaveBeenCalled();
      expect(second.adapter).not.toHaveBeenCalled();
      expect(await run.ledger.loadLatest()).toEqual(before);
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });

  it("does not let a local-success phase override malformed durable history", async () => {
    const run = await createS3CommandRun("sbx-20260719T050000Z-0000000000000100", {
      outcomes: successfulOutcomes(),
      phase: "LOCAL_COMMIT_COMPLETE",
      resultCode: "REPLAY_OBSERVED",
      mutate: malformedFingerprint,
    });
    try {
      await assertTerminalExecution(run, "S3_PROVIDER_HISTORY_MALFORMED");
    } finally {
      await rm(run.root, { recursive: true, force: true });
    }
  });
});

describe("S3 deepest provider boundary", () => {
  it("rejects S3 through the generic request-and-callback boundary before durable intent or contact", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    const adapter = vi.fn(() => Promise.resolve(eligibleLookup(fixture)));
    const completion = vi.fn(() => evidence("INITIAL_GET_ELIGIBLE"));

    await expect(harness.budget.invokeProtected(
      "S3",
      "GET",
      protectedGetRequest(fixture.paymentKey),
      adapter,
      completion,
      capability,
    )).rejects.toThrow("S3_METHOD_SPECIFIC_BOUNDARY_REQUIRED");

    expect(harness.budget.intentCounts("S3")).toEqual({ GET: 0, POST: 0 });
    expect(adapter).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it("rejects canonical GET metadata paired with a divergent cancellation callback", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    const divergentWire = deriveTossRefundCancellationWireRequest({
      paymentKey: "different-payment",
      providerOperationKey: deriveTossRefundOperationKey("different-operation"),
      cancelAmount: fixture.amount + 1,
    });
    const divergentCancellation = vi.fn((_contact: TossRefundCancellationContact) => (
      Promise.resolve(successfulPost(fixture, TRANSACTION_KEY))
    ));
    const callback = vi.fn(() => divergentCancellation(Object.freeze({
      authorization: "Basic divergent-test-only",
      wire: divergentWire,
    })));
    const completion = vi.fn(() => evidence("INITIAL_GET_ELIGIBLE"));

    await expect(harness.budget.invokeProtected(
      "S3",
      "GET",
      protectedGetRequest(fixture.paymentKey),
      callback,
      completion,
      capability,
    )).rejects.toThrow("S3_METHOD_SPECIFIC_BOUNDARY_REQUIRED");

    expect(harness.budget.intentCounts("S3")).toEqual({ GET: 0, POST: 0 });
    expect(callback).not.toHaveBeenCalled();
    expect(divergentCancellation).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it("derives the lookup intent and adapter identity from one authorized request", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    const authorization = "Basic lookup-test-only";
    const lookup = vi.fn((paymentKey: string, actualAuthorization: string) => {
      expect(paymentKey).toBe(fixture.paymentKey);
      expect(actualAuthorization).toBe(authorization);
      return Promise.resolve(eligibleLookup(fixture));
    });

    await harness.budget.invokeAuthorizedS3Lookup(
      capability,
      lookup,
      authorization,
      () => evidence("INITIAL_GET_ELIGIBLE"),
    );

    const intent = harness.recorded.find((entry) => entry.phase === "INTENT");
    expect(lookup).toHaveBeenCalledExactlyOnceWith(fixture.paymentKey, authorization);
    expect(intent?.kind).toBe("GET");
    expect(intent?.request).toEqual(protectedGetRequest(fixture.paymentKey));
  });

  it("derives the cancellation intent and exact adapter contact from one authorized request", async () => {
    const fixture = fixtureFor("S3");
    const history = historyFor(RUN_ID, fixture, ["INITIAL_GET_ELIGIBLE"], hmacIdentity);
    const harness = createBudgetHarness(history);
    const capability = await nextCapability(harness, fixture);
    const expectation = createS3HistoryExpectation(RUN_ID, fixture);
    const expectedWire = deriveTossRefundCancellationWireRequest({
      paymentKey: expectation.paymentKey,
      providerOperationKey: expectation.providerOperationKey,
      cancelAmount: expectation.cancelAmount,
    });
    const authorization = "Basic cancellation-test-only";
    const cancellation = vi.fn((_contact: TossRefundCancellationContact) => (
      Promise.resolve(successfulPost(fixture, TRANSACTION_KEY))
    ));

    await harness.budget.invokeAuthorizedS3Cancellation(
      capability,
      cancellation,
      authorization,
      () => evidence("POST_ACCEPTED", hmacIdentity(TRANSACTION_KEY)),
    );

    const intent = harness.recorded.find((entry) => entry.phase === "INTENT");
    expect(cancellation).toHaveBeenCalledExactlyOnceWith(Object.freeze({
      authorization,
      wire: expectedWire,
    }));
    expect(intent?.kind).toBe("POST");
    expect(intent?.request).toEqual(protectedPostRequest(
      expectedWire,
      JSON.stringify(expectedWire.body),
    ));
  });

  it("rejects a fabricated authorization object", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    await assertAuthorizedInvocationRejected(harness, fixture, Object.freeze({ authorized: true }));
  });

  it("rejects a capability from another budget and run", async () => {
    const fixture = fixtureFor("S3");
    const first = createBudgetHarness();
    const second = createBudgetHarness([], [], "sbx-20260719T010203Z-fedcba9876543210");
    const capability = await nextCapability(first, fixture);
    await assertAuthorizedInvocationRejected(second, fixture, capability);
  });

  it("rejects a capability after a durable revision changes", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    harness.state.replaceHistory([]);
    await assertAuthorizedInvocationRejected(harness, fixture, capability);
  });

  it.each([
    ["an incomplete restored GET intent", ["INCOMPLETE"]],
    ["a failed restored POST", ["INITIAL_GET_ELIGIBLE", "POST_REJECTED"]],
  ] as const)("rejects %s", async (_case, outcomes) => {
    const fixture = fixtureFor("S3");
    const initial = outcomes.length === 2
      ? historyFor(RUN_ID, fixture, ["INITIAL_GET_ELIGIBLE"], hmacIdentity)
      : [];
    const harness = createBudgetHarness(initial);
    const capability = await nextCapability(harness, fixture);
    harness.state.replaceHistory(historyFor(RUN_ID, fixture, outcomes, hmacIdentity));
    await assertAuthorizedInvocationRejected(
      harness,
      fixture,
      capability,
      outcomes.length === 2 ? "POST" : "GET",
    );
  });

  it("rejects malformed completion-only restored history", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    const complete = historyFor(RUN_ID, fixture, ["INITIAL_GET_ELIGIBLE"], hmacIdentity);
    harness.state.replaceHistory(complete[1] ? [complete[1]] : []);
    await assertAuthorizedInvocationRejected(harness, fixture, capability);
  });

  it("rejects a capability for the wrong canonical step", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    await assertAuthorizedInvocationRejected(harness, fixture, capability, "POST");
  });

  it("rejects the right capability with the wrong method", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    await assertAuthorizedInvocationRejected(harness, fixture, capability, "POST");
  });

  it("rejects the right capability with the wrong path", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    const request = Object.freeze({
      ...protectedGetRequest(fixture.paymentKey),
      path: "/v1/payments/wrong-payment",
    });
    await assertGenericS3InvocationRejected(harness, fixture, capability, request);
  });

  it.each([
    ["modified POST body", (request: BudgetRecord["request"]) => Object.freeze({
      ...request,
      canonicalBody: JSON.stringify({ cancelReason: "changed", cancelAmount: 1_000 }),
    })],
    ["changed operation key", (request: BudgetRecord["request"]) => Object.freeze({
      ...request,
      operationKey: deriveTossRefundOperationKey("different-operation"),
    })],
    ["changed fingerprint", (request: BudgetRecord["request"]) => Object.freeze({
      ...request,
      wireFingerprint: "f".repeat(64),
    })],
  ])("rejects the right POST capability with %s", async (_case, mutate) => {
    const fixture = fixtureFor("S3");
    const history = historyFor(RUN_ID, fixture, ["INITIAL_GET_ELIGIBLE"], hmacIdentity);
    const harness = createBudgetHarness(history);
    const capability = await nextCapability(harness, fixture);
    await assertGenericS3InvocationRejected(
      harness, fixture, capability, mutate(canonicalPostRequestFor(RUN_ID, fixture)), "POST",
    );
  });

  it("rejects a consumed capability when it is reused", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    const adapter = vi.fn(() => Promise.resolve(eligibleLookup(fixture)));
    const completion = vi.fn(() => evidence("INITIAL_GET_ELIGIBLE"));
    await harness.budget.invokeAuthorizedS3Lookup(
      capability, adapter, "Basic reuse-test-only", completion,
    );
    const before = harness.budget.intentCounts("S3");
    await expect(harness.budget.invokeAuthorizedS3Lookup(
      capability, adapter, "Basic reuse-test-only", completion,
    )).rejects.toThrow("S3_CONTINUATION_CAPABILITY_INVALID");
    expect(harness.budget.intentCounts("S3")).toEqual(before);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(completion).toHaveBeenCalledTimes(1);
  });

  it("reserves and invokes exactly the next canonical call for a valid prefix", async () => {
    const fixture = fixtureFor("S3");
    const history = historyFor(RUN_ID, fixture, ["INITIAL_GET_ELIGIBLE"], hmacIdentity);
    const harness = createBudgetHarness(history);
    const capability = await nextCapability(harness, fixture);
    const adapter = vi.fn(() => Promise.resolve(successfulPost(fixture, TRANSACTION_KEY)));
    await harness.budget.invokeAuthorizedS3Cancellation(
      capability, adapter, "Basic prefix-test-only",
      () => evidence("POST_ACCEPTED", hmacIdentity(TRANSACTION_KEY)),
    );
    expect(harness.recorded.filter((entry) => entry.phase === "INTENT")).toHaveLength(1);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(harness.budget.intentCounts("S3")).toEqual({ GET: 1, POST: 1 });
    expect(classifyS3History(
      harness.state.snapshot().history,
      createS3HistoryExpectation(RUN_ID, fixture),
    )).toEqual({ kind: "SUCCESSFUL_PREFIX", completedSteps: 2 });
  });

  it("validates a complete successful proof with zero adapter surface", () => {
    const fixture = fixtureFor("S3");
    const history = historyFor(RUN_ID, fixture, successfulOutcomes(), hmacIdentity);
    expect(completeS3DurableProof(RUN_ID, fixture, history).staticCodes)
      .toEqual(["REPLAY_OBSERVED"]);
  });
});

describe("S3 durable history classifier and proof", () => {
  it("classifies every valid successful prefix and complete proof", () => {
    const fixture = fixtureFor("S3");
    const expectation = createS3HistoryExpectation(RUN_ID, fixture);
    expect(classifyS3History([], expectation)).toEqual({ kind: "EMPTY", completedSteps: 0 });
    for (const completedSteps of [1, 2, 3] as const) {
      expect(classifyS3History(
        historyFor(RUN_ID, fixture, successfulOutcomes().slice(0, completedSteps), hmacIdentity),
        expectation,
      )).toEqual({ kind: "SUCCESSFUL_PREFIX", completedSteps });
    }
    const complete = historyFor(RUN_ID, fixture, successfulOutcomes(), hmacIdentity);
    expect(() => assertExactS3ReplayCallHistory(complete, expectation)).not.toThrow();
  });

  it.each([
    ["all sequence IDs equal", allSequenceIdsEqual],
    ["duplicate sequence IDs", duplicateIntent],
    ["skipped sequence IDs", skippedIdentity],
    ["wrong GET path", malformedGetPath],
    ["wrong POST path", malformedPostPath],
    ["invalid method", invalidMethod],
    ["empty POST body", emptyPostBody],
    ["body failing the wire normalizer", malformedPostBody],
    ["arbitrary stored fingerprint", malformedFingerprint],
    ["operation-key mismatch", mismatchedOperationKey],
    ["valid count with wrong order", wrongMethodOrder],
    ["three POSTs and one GET", threePostsOneGet],
    ["completion without intent", completionWithoutIntent],
    ["two completions for one intent", duplicateCompletion],
    ["completion classified rejected", rejectedPostCompletion],
    ["final GET not exact success", mismatchedFinalCompletion],
    ["mismatched safe transaction identity", mismatchedIdentity],
    ["four valid calls plus one extra", extraFifthCall],
  ])("does not admit adversarial proof: %s", (_case, mutate) => {
    const fixture = fixtureFor("S3");
    const expectation = createS3HistoryExpectation(RUN_ID, fixture);
    const complete = historyFor(RUN_ID, fixture, successfulOutcomes(), hmacIdentity);
    const classification = classifyS3History(mutate(complete), expectation);
    expect(classification.kind).not.toBe("COMPLETE_SUCCESS");
    expect(() => assertExactS3ReplayCallHistory(mutate(complete), expectation))
      .toThrow("S3_REPLAY_PROBE_FAILED");
  });
});

describe("provider hard-budget concurrency", () => {
  it("serializes one exact S3 GET capability without holding the mutex during provider work", async () => {
    const fixture = fixtureFor("S3");
    const harness = createBudgetHarness();
    const capability = await nextCapability(harness, fixture);
    let releaseProvider = (): void => undefined;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const adapter = vi.fn(async () => {
      await providerGate;
      return eligibleLookup(fixture);
    });
    const invocations = Array.from({ length: 3 }, () => harness.budget.invokeAuthorizedS3Lookup(
      capability,
      adapter,
      "Basic concurrency-test-only",
      () => evidence("INITIAL_GET_ELIGIBLE"),
    ));
    const settledPromise = Promise.allSettled(invocations);
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    releaseProvider();
    const settled = await settledPromise;
    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === "rejected")).toHaveLength(2);
    expect(harness.budget.intentCounts("S3")).toEqual({ GET: 1, POST: 0 });
    expect(harness.budget.history("S3").filter((entry) => (
      entry.kind === "GET" && entry.phase === "INTENT"
    ))).toHaveLength(1);
  });

  it("uses the same single-use reservation boundary for S3 POST", async () => {
    const fixture = fixtureFor("S3");
    const history = historyFor(RUN_ID, fixture, ["INITIAL_GET_ELIGIBLE"], hmacIdentity);
    const harness = createBudgetHarness(history);
    const capability = await nextCapability(harness, fixture);
    let releaseProvider = (): void => undefined;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const adapter = vi.fn(async () => {
      await providerGate;
      return successfulPost(fixture, TRANSACTION_KEY);
    });
    const invocations = Array.from({ length: 3 }, () => harness.budget.invokeAuthorizedS3Cancellation(
      capability,
      adapter,
      "Basic concurrency-test-only",
      () => evidence("POST_ACCEPTED", hmacIdentity(TRANSACTION_KEY)),
    ));
    const settledPromise = Promise.allSettled(invocations);
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    releaseProvider();
    const settled = await settledPromise;
    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === "rejected")).toHaveLength(2);
    expect(harness.budget.intentCounts("S3")).toEqual({ GET: 1, POST: 1 });
  });

  it("releases reservation serialization after durable intent persistence throws", async () => {
    const fixture = fixtureFor("S3");
    let writes = 0;
    const harness = createBudgetHarness([], [], RUN_ID, "PLANNED", () => {
      writes += 1;
      return writes === 1
        ? Promise.reject(new Error("SYNTHETIC_INTENT_PERSISTENCE_FAILURE"))
        : Promise.resolve();
    });
    const firstCapability = await nextCapability(harness, fixture);
    const adapter = vi.fn(() => Promise.resolve(eligibleLookup(fixture)));
    await expect(harness.budget.invokeAuthorizedS3Lookup(
      firstCapability, adapter, "Basic persistence-test-only",
      () => evidence("INITIAL_GET_ELIGIBLE"),
    )).rejects.toThrow("SYNTHETIC_INTENT_PERSISTENCE_FAILURE");
    expect(adapter).not.toHaveBeenCalled();
    const secondCapability = await nextCapability(harness, fixture);
    await expect(harness.budget.invokeAuthorizedS3Lookup(
      secondCapability, adapter, "Basic persistence-test-only",
      () => evidence("INITIAL_GET_ELIGIBLE"),
    )).resolves.toMatchObject({ kind: "response" });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(harness.budget.intentCounts("S3")).toEqual({ GET: 1, POST: 0 });
  });
});

type StepOutcome = S3CompletionClassification | "INCOMPLETE";
type HistoryMutation = (history: readonly BudgetRecord[]) => unknown;
let terminalCaseCounter = 10;
let credentialCaseCounter = 200;

function nextCredentialRunId(): string {
  const suffix = String(credentialCaseCounter).padStart(16, "0");
  credentialCaseCounter += 1;
  return `sbx-20260719T060000Z-${suffix}`;
}

function inertAdapterFactories(): Readonly<{
  factories: ProviderAdapterFactories;
  createLookup: ReturnType<typeof vi.fn<ProviderAdapterFactories["createLookup"]>>;
  createCancellation: ReturnType<typeof vi.fn<ProviderAdapterFactories["createCancellation"]>>;
}> {
  const createLookup = vi.fn<ProviderAdapterFactories["createLookup"]>(() => (
    () => Promise.reject(new Error("INERT_LOOKUP_FORBIDDEN"))
  ));
  const createCancellation = vi.fn<ProviderAdapterFactories["createCancellation"]>(() => (
    () => Promise.reject(new Error("INERT_CANCELLATION_FORBIDDEN"))
  ));
  return Object.freeze({
    factories: Object.freeze({ createLookup, createCancellation }),
    createLookup,
    createCancellation,
  });
}

function invalidCredentialEnv(): Readonly<Record<string, string>> {
  return Object.freeze({
    TOSS_SANDBOX_SECRET_KEY: "invalid-test-only",
    TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
    TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-test",
  });
}

function countIntentRecords(value: unknown): number {
  return budgetRecordsFromPayload(value).filter((entry) => entry.phase === "INTENT").length;
}

function successfulOutcomes(): readonly S3CompletionClassification[] {
  return Object.freeze([
    "INITIAL_GET_ELIGIBLE", "POST_ACCEPTED", "POST_ACCEPTED", "FINAL_GET_EXACT_SUCCESS",
  ]);
}

function historyFor(
  runId: string,
  fixture: ProviderFixture,
  outcomes: readonly StepOutcome[],
  identityHmac: (value: string) => string,
): readonly BudgetRecord[] {
  const expectation = createS3HistoryExpectation(runId, fixture);
  const wire = deriveTossRefundCancellationWireRequest({
    paymentKey: expectation.paymentKey,
    providerOperationKey: expectation.providerOperationKey,
    cancelAmount: expectation.cancelAmount,
  });
  const requests = [
    protectedGetRequest(fixture.paymentKey),
    protectedPostRequest(wire, JSON.stringify(wire.body)),
    protectedPostRequest(wire, JSON.stringify(wire.body)),
    protectedGetRequest(fixture.paymentKey),
  ] as const;
  const kinds = ["GET", "POST", "POST", "GET"] as const;
  const records: BudgetRecord[] = [];
  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];
    const request = requests[index];
    const kind = kinds[index];
    if (!outcome || !request || !kind) throw new Error("TEST_HISTORY_INVALID");
    const sequence = index + 1;
    records.push(Object.freeze({ scenarioId: "S3", kind, phase: "INTENT", sequence, request }));
    if (outcome !== "INCOMPLETE") {
      const protectedIdentity = outcome === "POST_ACCEPTED" || outcome === "FINAL_GET_EXACT_SUCCESS"
        ? identityHmac(TRANSACTION_KEY) : null;
      records.push(Object.freeze({
        scenarioId: "S3",
        kind,
        phase: "COMPLETED",
        sequence,
        request,
        completionEvidence: evidence(outcome, protectedIdentity),
      }));
    }
  }
  return Object.freeze(records);
}

type TestS3State = Readonly<{
  snapshot: () => S3DurableState;
  append: (entry: BudgetRecord) => void;
  replaceHistory: (history: unknown, phase?: H1LedgerPhase) => void;
}>;
type BudgetHarness = Readonly<{
  budget: ProviderCallBudget;
  state: TestS3State;
  recorded: BudgetRecord[];
}>;

const BUDGET_HARNESSES = new WeakMap<ProviderCallBudget, BudgetHarness>();

function createBudgetHarness(
  history: readonly BudgetRecord[] = [],
  recorded: BudgetRecord[] = [],
  runId = RUN_ID,
  phase: H1LedgerPhase = "PLANNED",
  beforeRecord: (entry: BudgetRecord) => Promise<void> = () => Promise.resolve(),
): BudgetHarness {
  const state = createTestS3State(history, runId, phase);
  const budget = new ProviderCallBudget(async (entry) => {
    await beforeRecord(entry);
    recorded.push(entry);
    state.append(entry);
  }, history, hmacIdentity, () => Promise.resolve(state.snapshot()));
  const harness = Object.freeze({ budget, state, recorded });
  BUDGET_HARNESSES.set(budget, harness);
  return harness;
}

function budgetWithIdentity(
  history: readonly BudgetRecord[] = [],
  recorded: BudgetRecord[] = [],
): ProviderCallBudget {
  return createBudgetHarness(history, recorded).budget;
}

function createTestS3State(
  initialHistory: readonly BudgetRecord[],
  runId: string,
  initialPhase: H1LedgerPhase,
): TestS3State {
  let history: unknown = Object.freeze([...initialHistory]);
  let revision = 1;
  let phase = initialPhase;
  return Object.freeze({
    snapshot: () => Object.freeze({ runId, revision, phase, history }),
    append: (entry: BudgetRecord) => {
      const current = budgetRecordsFromPayload(history);
      history = Object.freeze([...current, entry]);
      revision += 1;
      if (entry.kind === "POST" && entry.phase === "INTENT") phase = "POST_INTENT_RECORDED";
      if (entry.kind === "POST" && entry.phase === "COMPLETED") phase = "POST_RESPONSE_RECORDED";
    },
    replaceHistory: (replacement: unknown, nextPhase?: H1LedgerPhase) => {
      history = replacement;
      revision += 1;
      if (nextPhase) phase = nextPhase;
    },
  });
}

function continuationPlan(
  budget: ProviderCallBudget,
  fixture: ProviderFixture,
  command: "execute" | "resume" | "resume-post" = "resume",
): Readonly<{ authority: S3CommandAuthority; continuation: S3Continuation }> {
  const harness = BUDGET_HARNESSES.get(budget);
  if (!harness) throw new Error("TEST_BUDGET_HARNESS_REQUIRED");
  const decision = planS3Command(
    command,
    harness.state.snapshot(),
    createS3HistoryExpectation(harness.state.snapshot().runId, fixture),
    false,
  );
  if (decision.plan.kind !== "CONTINUE_WITH_PROVIDER_CALLS") {
    throw new Error("TEST_S3_CONTINUATION_PLAN_REQUIRED");
  }
  return decision.plan;
}

async function nextCapability(
  harness: BudgetHarness,
  fixture: ProviderFixture,
  command: "execute" | "resume" | "resume-post" = "resume",
): Promise<unknown> {
  const plan = continuationPlan(harness.budget, fixture, command);
  return harness.budget.authorizeS3Continuation(plan.authority);
}

function canonicalPostRequestFor(runId: string, fixture: ProviderFixture): BudgetRecord["request"] {
  const expectation = createS3HistoryExpectation(runId, fixture);
  const wire = deriveTossRefundCancellationWireRequest({
    paymentKey: expectation.paymentKey,
    providerOperationKey: expectation.providerOperationKey,
    cancelAmount: expectation.cancelAmount,
  });
  return protectedPostRequest(wire, JSON.stringify(wire.body));
}

function evidence(
  classification: S3CompletionClassification,
  transactionIdentityHmac: string | null = null,
): S3CompletionEvidence {
  return Object.freeze({ classification, transactionIdentityHmac });
}

function hmacIdentity(value: string): string {
  return createHmac("sha256", TEST_HMAC_KEY).update(value, "utf8").digest("hex");
}

async function createS3CommandRun(
  runId: string,
  options: Readonly<{
    outcomes?: readonly StepOutcome[];
    phase?: H1LedgerPhase;
    resultCode?: string;
    mutate?: HistoryMutation;
  }> = {},
) {
  const root = await mkdtemp(join(tmpdir(), "mira-xp5-c2-s3-"));
  const store = new H1ArtifactStore(root, runId);
  await store.initialize();
  const ledger = new RunLedgerStore(store.path("ledger"));
  const fixture = fixtureFor("S3");
  const manifest: FixtureManifest = Object.freeze({
    formatVersion: H1_FIXTURE_FORMAT_VERSION,
    runId,
    expectedMerchantAccountBinding: "merchant-test",
    expectedCredentialGenerationBinding: "generation-test",
    providerTruthNote: H1_PROVIDER_TRUTH_NOTE,
    fixtures: Object.freeze({
      S1: null, S2: null, S3: fixture, S4: null, S5: null, S6: null,
    }),
  });
  const context = Object.freeze({
    prisma: db,
    bootstrap: new AcceptanceBootstrap(db, "wig_platform_test"),
    ledger,
    integrity: Object.freeze({
      repositoryCommit: "a".repeat(40),
      runnerSourceHash: "b".repeat(64),
      policyHashes: Object.freeze({ policy: "c".repeat(64) }),
      migrationFingerprint: "d".repeat(64),
    }),
    staleLockRecovered: false,
  });
  const hmacHex = (await readFile(store.path("raw", "hmac.key"), "utf8")).trim();
  const runIdentityHmac = (value: string): string => createHmac(
    "sha256", Buffer.from(hmacHex, "hex"),
  ).update(value, "utf8").digest("hex");
  const history = historyFor(runId, fixture, options.outcomes ?? [], runIdentityHmac);
  const callRecords = options.mutate ? options.mutate(history) : history;
  const phase = options.phase ?? "PLANNED";
  if (options.outcomes || options.mutate || phase !== "PLANNED" || options.resultCode) {
    await ledger.append({
      runId,
      scenarioId: "S3",
      phase,
      repositoryCommit: context.integrity.repositoryCommit,
      runnerSourceHash: context.integrity.runnerSourceHash,
      policyHashes: context.integrity.policyHashes,
      migrationFingerprint: context.integrity.migrationFingerprint,
      scenarioInputHash: "e".repeat(64),
      payload: Object.freeze({
        scenarioId: "S3",
        callRecords,
        ...(options.resultCode ? { resultCode: Object.freeze([options.resultCode]) } : {}),
      }),
    });
  }
  return Object.freeze({ root, store, ledger, fixture, manifest, context });
}

async function invokeCommand(
  run: Awaited<ReturnType<typeof createS3CommandRun>>,
  command: "execute" | "resume" | "resume-post",
  responses: readonly Response[],
  options: Readonly<{
    env?: Readonly<Record<string, string | undefined>>;
    adapterFactories?: ProviderAdapterFactories;
  }> = {},
) {
  const originalFetch = fetch;
  const adapter = vi.fn<typeof fetch>();
  for (const response of responses) adapter.mockResolvedValueOnce(response);
  adapter.mockRejectedValue(new Error("UNEXPECTED_FAKE_PROVIDER_CONTACT"));
  vi.stubGlobal("fetch", adapter);
  try {
    const result = await providerCommand(
      { command, runId: run.manifest.runId, scenarioId: "S3" },
      options.env ?? fakeCredentialEnv(),
      run.store,
      run.manifest,
      run.context,
      run.fixture,
      options.adapterFactories,
    );
    return Object.freeze({ result, adapter });
  } finally {
    vi.stubGlobal("fetch", originalFetch);
  }
}

async function expectLocalReplay(
  run: Awaited<ReturnType<typeof createS3CommandRun>>,
  intents: number,
): Promise<void> {
  const latest = await run.ledger.loadLatest();
  expect(latest?.phase).toBe("LOCAL_COMMIT_COMPLETE");
  expect(latest?.payload.resultCode).toEqual(["REPLAY_OBSERVED"]);
  const records = budgetRecordsFromPayload(latest?.payload.callRecords);
  expect(records.filter((entry) => entry.phase === "INTENT")).toHaveLength(intents);
  expect(classifyS3History(
    records,
    createS3HistoryExpectation(run.manifest.runId, run.fixture),
  ).kind).toBe("COMPLETE_SUCCESS");
}

async function assertTerminalExecution(
  run: Awaited<ReturnType<typeof createS3CommandRun>>,
  expectedCode: string,
): Promise<void> {
  const before = await run.ledger.loadLatest();
  const priorRecords = JSON.stringify(before?.payload.callRecords);
  const first = await invokeCommand(run, "resume", []);
  expect(first.result.code).toBe(expectedCode);
  expect(first.adapter).not.toHaveBeenCalled();
  const terminal = await run.ledger.loadLatest();
  expect(terminal?.phase).toBe("REVIEW_REQUIRED");
  expect(terminal?.payload.resultCode).toEqual([expectedCode]);
  expect(JSON.stringify(terminal?.payload.callRecords)).toBe(priorRecords);
  const second = await invokeCommand(run, "resume-post", []);
  expect(second.result.code).toBe(expectedCode);
  expect(second.adapter).not.toHaveBeenCalled();
  expect(await run.ledger.loadLatest()).toEqual(terminal);
}

async function assertAuthorizedInvocationRejected(
  harness: BudgetHarness,
  fixture: ProviderFixture,
  capability: unknown,
  kind: "GET" | "POST" = "GET",
): Promise<void> {
  const before = harness.budget.intentCounts("S3");
  const recordedBefore = harness.recorded.filter((entry) => entry.phase === "INTENT").length;
  const completion = vi.fn(() => kind === "GET"
    ? evidence("INITIAL_GET_ELIGIBLE")
    : evidence("POST_ACCEPTED", hmacIdentity(TRANSACTION_KEY)));
  const lookup = vi.fn(() => Promise.resolve(eligibleLookup(fixture)));
  const cancellation = vi.fn(() => Promise.resolve(successfulPost(fixture, TRANSACTION_KEY)));
  const invocation = kind === "GET"
    ? harness.budget.invokeAuthorizedS3Lookup(
      capability, lookup, "Basic rejected-test-only", completion,
    )
    : harness.budget.invokeAuthorizedS3Cancellation(
      capability, cancellation, "Basic rejected-test-only", completion,
    );
  await expect(invocation).rejects.toThrow();
  expect(harness.budget.intentCounts("S3")).toEqual(before);
  expect(harness.recorded.filter((entry) => entry.phase === "INTENT"))
    .toHaveLength(recordedBefore);
  expect(lookup).not.toHaveBeenCalled();
  expect(cancellation).not.toHaveBeenCalled();
  expect(completion).not.toHaveBeenCalled();
}

async function assertGenericS3InvocationRejected(
  harness: BudgetHarness,
  fixture: ProviderFixture,
  capability: unknown,
  request: BudgetRecord["request"],
  kind: "GET" | "POST" = "GET",
): Promise<void> {
  const before = harness.budget.intentCounts("S3");
  const recordedBefore = harness.recorded.filter((entry) => entry.phase === "INTENT").length;
  const adapter = vi.fn(() => Promise.resolve(kind === "GET"
    ? eligibleLookup(fixture)
    : successfulPost(fixture, TRANSACTION_KEY)));
  const completion = vi.fn(() => kind === "GET"
    ? evidence("INITIAL_GET_ELIGIBLE")
    : evidence("POST_ACCEPTED", hmacIdentity(TRANSACTION_KEY)));
  await expect(harness.budget.invokeProtected(
    "S3", kind, request, adapter, completion, capability,
  )).rejects.toThrow("S3_METHOD_SPECIFIC_BOUNDARY_REQUIRED");
  expect(harness.budget.intentCounts("S3")).toEqual(before);
  expect(harness.recorded.filter((entry) => entry.phase === "INTENT"))
    .toHaveLength(recordedBefore);
  expect(adapter).not.toHaveBeenCalled();
  expect(completion).not.toHaveBeenCalled();
}

function fullSuccessResponses(fixture: ProviderFixture): readonly Response[] {
  return Object.freeze([
    jsonResponse(eligibleLookup(fixture).body),
    successResponse(fixture),
    successResponse(fixture),
    successResponse(fixture),
  ]);
}

function successResponse(fixture: ProviderFixture): Response {
  return jsonResponse(JSON.stringify(successfulBody(fixture, TRANSACTION_KEY)));
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

function calledMethods(adapter: ReturnType<typeof vi.fn<typeof fetch>>): readonly string[] {
  return adapter.mock.calls.map(([request, init]) => {
    if (init?.method) return init.method;
    return request instanceof Request ? request.method : "GET";
  });
}

function fakeCredentialEnv(): Readonly<Record<string, string>> {
  return Object.freeze({
    TOSS_SANDBOX_SECRET_KEY: "test_sk_fake_only_never_network",
    TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-test",
    TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-test",
  });
}

function fixtureFor(scenarioId: "S3" | "S4"): ProviderFixture {
  return Object.freeze({
    scenarioId,
    paymentKey: `payment-${scenarioId}`,
    providerOrderId: `provider-order-${scenarioId}`,
    amount: 1_000,
    currency: "KRW",
    reference: `reference-${scenarioId}`,
  });
}

function eligibleLookup(fixture: ProviderFixture): Extract<TossRefundLookupHttpResult, { kind: "response" }> {
  return Object.freeze({
    kind: "response",
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

function successfulPost(
  fixture: ProviderFixture,
  transactionKey: string,
  _path?: string,
): TossRefundCancellationTransportResult {
  return Object.freeze({
    kind: "success",
    body: JSON.stringify(successfulBody(fixture, transactionKey)),
  });
}

function successfulLookup(
  fixture: ProviderFixture,
  transactionKey: string,
): TossRefundLookupHttpResult {
  return Object.freeze({
    kind: "response",
    body: JSON.stringify(successfulBody(fixture, transactionKey)),
  });
}

function successfulBody(fixture: ProviderFixture, transactionKey: string) {
  return {
    paymentKey: fixture.paymentKey,
    currency: "KRW",
    status: "CANCELED",
    totalAmount: fixture.amount,
    balanceAmount: 0,
    cancels: [{
      transactionKey,
      cancelStatus: "DONE",
      cancelAmount: fixture.amount,
      cancelReason: "Mira merchant refund",
    }],
  };
}

function assertChangedReasonOnly(requests: readonly Readonly<{ body: string; path: string }>[]): void {
  const first: unknown = JSON.parse(requests[0]?.body ?? "null");
  const second: unknown = JSON.parse(requests[1]?.body ?? "null");
  expect(first).toEqual({ cancelReason: "Mira merchant refund", cancelAmount: 1_000 });
  expect(second).toEqual({ cancelReason: H1_CHANGED_CANCEL_REASON, cancelAmount: 1_000 });
}

function replaceRecord(
  history: readonly BudgetRecord[],
  index: number,
  update: (record: BudgetRecord) => object,
): readonly object[] {
  return history.map((record, recordIndex) => recordIndex === index ? update(record) : record);
}

function allSequenceIdsEqual(history: readonly BudgetRecord[]): unknown {
  return history.map((record) => ({ ...record, sequence: 1 }));
}

function duplicateIntent(history: readonly BudgetRecord[]): unknown {
  const duplicate = history[0];
  return duplicate ? [...history, duplicate] : history;
}

function skippedIdentity(history: readonly BudgetRecord[]): unknown {
  return history.map((record) => record.sequence >= 3
    ? { ...record, sequence: record.sequence + 1 } : record);
}

function malformedGetPath(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 0, (record) => ({
    ...record, request: { ...record.request, path: "/wrong" },
  }));
}

function malformedPostPath(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 2, (record) => ({
    ...record, request: { ...record.request, path: "/wrong" },
  }));
}

function emptyPostBody(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 2, (record) => ({
    ...record, request: { ...record.request, canonicalBody: "{}" },
  }));
}

function malformedPostBody(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 2, (record) => ({
    ...record,
    request: {
      ...record.request,
      canonicalBody: JSON.stringify({ cancelReason: "changed", cancelAmount: 1_000 }),
    },
  }));
}

function malformedFingerprint(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 2, (record) => ({
    ...record, request: { ...record.request, wireFingerprint: "f".repeat(64) },
  }));
}

function mismatchedOperationKey(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 2, (record) => ({
    ...record, request: { ...record.request, operationKey: deriveTossRefundOperationKey("other") },
  }));
}

function invalidMethod(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 0, (record) => ({ ...record, kind: "PATCH" }));
}

function wrongMethodOrder(history: readonly BudgetRecord[]): unknown {
  const reordered = [...history];
  const secondPair = reordered.splice(2, 2);
  reordered.splice(6, 0, ...secondPair);
  return reordered;
}

function threePostsOneGet(history: readonly BudgetRecord[]): unknown {
  const postRequest = history[2]?.request;
  if (!postRequest) return history;
  return history.map((record) => record.sequence === 4
    ? { ...record, kind: "POST", request: postRequest } : record);
}

function completionWithoutIntent(history: readonly BudgetRecord[]): unknown {
  return history.filter((record) => !(record.sequence === 1 && record.phase === "INTENT"));
}

function duplicateCompletion(history: readonly BudgetRecord[]): unknown {
  const duplicate = history[1];
  return duplicate ? [...history, duplicate] : history;
}

function rejectedPostCompletion(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 3, (record) => ({
    ...record, completionEvidence: evidence("POST_REJECTED"),
  }));
}

function mismatchedFinalCompletion(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 7, (record) => ({
    ...record, completionEvidence: evidence("FINAL_GET_MISMATCH"),
  }));
}

function mismatchedIdentity(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 5, (record) => ({
    ...record, completionEvidence: evidence("POST_ACCEPTED", "a".repeat(64)),
  }));
}

function extraFifthCall(history: readonly BudgetRecord[]): unknown {
  const request = history[0]?.request;
  if (!request) return history;
  return [
    ...history,
    { scenarioId: "S3", kind: "GET", phase: "INTENT", sequence: 5, request },
    {
      scenarioId: "S3",
      kind: "GET",
      phase: "COMPLETED",
      sequence: 5,
      request,
      completionEvidence: evidence("FINAL_GET_EXACT_SUCCESS", hmacIdentity(TRANSACTION_KEY)),
    },
  ];
}

function legacyCompletionEvidenceMissing(history: readonly BudgetRecord[]): unknown {
  return replaceRecord(history, 1, (record) => ({
    scenarioId: record.scenarioId,
    kind: record.kind,
    phase: record.phase,
    sequence: record.sequence,
    request: record.request,
  }));
}
