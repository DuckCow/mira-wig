import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REFUND_SANDBOX_CANARY_APPROVAL_FORMAT,
  REFUND_SANDBOX_CANARY_APPROVAL_GATES,
  REFUND_SANDBOX_CANARY_EVIDENCE_FORMAT,
  REFUND_SANDBOX_CANARY_SOURCE_KINDS,
  currentRefundSandboxCanaryApprovalDecision,
  evaluateRefundSandboxCanaryEvidenceReadiness,
  type RefundSandboxCanaryApprovalGate,
  type RefundSandboxCanaryOperatingMode,
  type RefundSandboxCanarySourceKind,
} from "../refund-sandbox-canary-approval-contract";
import {
  productionSourceFiles, repositoryPath, reverseReachableFiles,
} from "./production-reachability-scanner";

const ROOT = process.cwd();
const CONTRACT = join(ROOT, "src/lib/payment/refund/refund-sandbox-canary-approval-contract.ts");
const NOW = 10_000_000;
const HOUR = 60 * 60 * 1_000;
const DIGEST_A = digest("a");
const DIGEST_B = digest("b");
const DIGEST_C = digest("c");
const DIGEST_D = digest("e");
const DIGEST_E = digest("f");
const SHA = "d".repeat(40);

describe("P3E-A non-authorizing evidence readiness", () => {
  it("keeps the actual repository state blocked on all 18 derived gates", () => {
    const result = currentRefundSandboxCanaryApprovalDecision();
    expect(result.code).toBe("SANDBOX_CANARY_APPROVAL_BLOCKED");
    expect(result.executionAuthorization).toBe("NOT_ISSUED");
    expect(result.provenanceTrust).toBe("NOT_VERIFIED_BY_PURE_EVALUATOR");
    expect(result.gates).toEqual(REFUND_SANDBOX_CANARY_APPROVAL_GATES.map((id) => ({
      id, status: "BLOCKED",
    })));
    expect(result.blockers).toEqual(REFUND_SANDBOX_CANARY_APPROVAL_GATES);
  });

  it("marks a hypothetical complete package ready only for a future trusted issuer", () => {
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(hypotheticalEvidence(), NOW);
    expect(result).toEqual(readyDecision("VERIFIED_DISTINCT_HUMANS"));
    expect(JSON.stringify(result)).not.toMatch(/APPROVED_FOR|AUTHORIZED|EXECUTABLE/u);
  });

  it("cannot produce executable authorization for any accepted operating mode", () => {
    for (const mode of ["DISTINCT_HUMAN_OPERATORS", "SINGLE_OPERATOR_EXCEPTION"] as const) {
      const result = evaluateRefundSandboxCanaryEvidenceReadiness(hypotheticalEvidence(mode), NOW);
      expect(result.executionAuthorization).toBe("NOT_ISSUED");
      expect(result.scheduledOperation).toBe("BLOCKED");
      expect(result.liveOperation).toBe("BLOCKED");
      expect(result.intendedExecutionLimit).toBe(1);
      expect(result.triggerMode).toBe("MANUAL_ONLY");
    }
    expect(readFileSync(CONTRACT, "utf8"))
      .not.toContain("SANDBOX_CANARY_APPROVED_FOR_SINGLE_MANUAL_EXECUTION");
  });

  it("derives exactly 18 canonical gates and accepts no caller-supplied gate array", () => {
    const current = currentRefundSandboxCanaryApprovalDecision();
    const hypothetical = evaluateRefundSandboxCanaryEvidenceReadiness(hypotheticalEvidence(), NOW);
    for (const result of [current, hypothetical]) {
      expect(result.gates).toHaveLength(18);
      expect(result.gates.map((gate) => gate.id)).toEqual(REFUND_SANDBOX_CANARY_APPROVAL_GATES);
      expect(new Set(result.gates.map((gate) => gate.id)).size).toBe(18);
    }
    expect(current.gates.every((gate) => gate.status === "BLOCKED")).toBe(true);
    expect(hypothetical.gates.every((gate) => gate.status === "READY")).toBe(true);
    const supplied = hypotheticalEvidence();
    set(supplied, "gates", [...REFUND_SANDBOX_CANARY_APPROVAL_GATES]);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(supplied, NOW)).toEqual(invalidDecision());
  });

  it.each(gateMutations())("derives blocker %s from detailed evidence", (
    gate, mutate,
  ) => {
    const evidence = hypotheticalEvidence();
    mutate(evidence);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers).toContain(gate);
  });
});

describe("restricted provenance envelope", () => {
  it.each([
    ["missing provenance", (e: EvidenceFixture) => Reflect.deleteProperty(e, "provenance")],
    ["malformed producer", (e: EvidenceFixture) => set(e.provenance, "producerKind", "SELF_ATTESTED")],
    ["malformed bundle digest", (e: EvidenceFixture) => set(e.provenance, "bundleDigest", "bad")],
    ["duplicate source id", (e: EvidenceFixture) => set(
      e.provenance.sourceRecords[1], "sourceRecordId", e.provenance.sourceRecords[0].sourceRecordId,
    )],
    ["noncanonical source ordering", (e: EvidenceFixture) => {
      const first = e.provenance.sourceRecords[0];
      e.provenance.sourceRecords[0] = e.provenance.sourceRecords[1];
      e.provenance.sourceRecords[1] = first;
    }],
    ["unknown source kind", (e: EvidenceFixture) => set(
      e.provenance.sourceRecords[0], "sourceKind", "UNKNOWN_SOURCE",
    )],
  ])("rejects structurally unsafe provenance: %s", (_name, mutate) => {
    const evidence = hypotheticalEvidence();
    mutate(evidence);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW)).toEqual(invalidDecision());
  });

  it("blocks every gate when subject provenance does not bind the package", () => {
    const evidence = hypotheticalEvidence();
    set(evidence.provenance, "subjectBindingDigest", DIGEST_C);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.blockers).toEqual(REFUND_SANDBOX_CANARY_APPROVAL_GATES);
    expect(result.provenanceTrust).toBe("NOT_VERIFIED_BY_PURE_EVALUATOR");
  });

  it("rejects proxy, accessor, inherited, symbol, sparse, and hole-bearing records", () => {
    let getterCalls = 0;
    const accessor = hypotheticalEvidence();
    Object.defineProperty(accessor.provenance, "bundleId", {
      enumerable: true, get: () => { getterCalls += 1; return "bundle"; },
    });
    const proxied = hypotheticalEvidence();
    proxied.provenance = new Proxy(proxied.provenance, {});
    const inherited = hypotheticalEvidence();
    const bundleId = inherited.provenance.bundleId;
    Reflect.deleteProperty(inherited.provenance, "bundleId");
    Reflect.setPrototypeOf(inherited.provenance, { bundleId });
    const symbol = hypotheticalEvidence();
    Object.defineProperty(symbol.provenance, Symbol("extra"), { enumerable: true, value: true });
    const sparse = hypotheticalEvidence();
    sparse.provenance.sourceRecords.length += 1;
    const hole = hypotheticalEvidence();
    Reflect.deleteProperty(hole.provenance.sourceRecords, "2");
    for (const value of [accessor, proxied, inherited, symbol, sparse, hole]) {
      expect(evaluateRefundSandboxCanaryEvidenceReadiness(value, NOW)).toEqual(invalidDecision());
    }
    expect(getterCalls).toBe(0);
  });

  it.each<readonly [string, (evidence: EvidenceFixture, proxy: object) => unknown]>([
    ["top-level package", (_e: EvidenceFixture, proxy: object) => proxy],
    ["nested provenance", (e: EvidenceFixture, proxy: object) => {
      set(e, "provenance", proxy); return e;
    }],
    ["sourceRecords array", (e: EvidenceFixture, proxy: object) => {
      set(e.provenance, "sourceRecords", proxy);
      return e;
    }],
    ["target record", (e: EvidenceFixture, proxy: object) => {
      set(e, "target", proxy); return e;
    }],
    ["admission record", (e: EvidenceFixture, proxy: object) => {
      set(e, "admission", proxy); return e;
    }],
    ["approval record", (e: EvidenceFixture, proxy: object) => {
      set(e, "approval", proxy); return e;
    }],
  ])("bounds a revoked Proxy at the %s boundary", (_name, place) => {
    const evidence = hypotheticalEvidence();
    const target = _name === "sourceRecords array" ? evidence.provenance.sourceRecords : {};
    const revocable = Proxy.revocable(target, {});
    revocable.revoke();
    const result = place(evidence, revocable.proxy);
    expect(() => evaluateRefundSandboxCanaryEvidenceReadiness(result, NOW)).not.toThrow();
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(result, NOW)).toEqual(invalidDecision());
  });

  it("rejects every hostile canonical source-array shape without invoking accessors", () => {
    let getterCalls = 0;
    const mutations: Array<(records: object[]) => object> = [
      (records) => { records.push(records[0]); return records; },
      (records) => { set(records[0], "sourceKind", "UNKNOWN"); return records; },
      (records) => { records.pop(); return records; },
      (records) => { [records[0], records[1]] = [records[1], records[0]]; return records; },
      (records) => { records.length += 1; return records; },
      (records) => { Reflect.deleteProperty(records, "1"); return records; },
      (records) => { set(records, "extra", true); return records; },
      (records) => { Object.defineProperty(records, Symbol("extra"), { value: true }); return records; },
      (records) => { Object.defineProperty(records, "0", {
        enumerable: true, get: () => { getterCalls += 1; return records[1]; },
      }); return records; },
      (records) => { Reflect.setPrototypeOf(records, { 0: records[0] }); return records; },
      (records) => new Proxy(records, {}),
    ];
    for (const mutate of mutations) {
      const evidence = hypotheticalEvidence();
      set(evidence.provenance, "sourceRecords", mutate(evidence.provenance.sourceRecords));
      expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW)).toEqual(invalidDecision());
    }
    expect(getterCalls).toBe(0);
  });

  it("never emits restricted evidence or synthetic fixture identifiers", () => {
    const output = JSON.stringify(evaluateRefundSandboxCanaryEvidenceReadiness(
      hypotheticalEvidence(), NOW,
    ));
    for (const value of ["command-fixture", "attempt-fixture", "payment-fixture",
      "secret-resource-fixture", "project-fixture", "deploy-human", "bundle-fixture"]) {
      expect(output).not.toContain(value);
    }
  });
});

describe("detailed target binding", () => {
  it.each([
    ["command/attempt mismatch", "commandRefundAttemptId", "other-attempt"],
    ["attempt/payment mismatch", "refundAttemptPaymentId", "other-payment"],
    ["provider mismatch", "provider", "PAYPAL"],
    ["mode mismatch", "mode", "LIVE"],
    ["amount mismatch", "refundAmountMinor", 9_999],
    ["currency mismatch", "refundCurrency", "USD"],
    ["operation binding mismatch", "commandProviderOperationBindingId", "other-binding"],
    ["target count zero", "targetCount", 0],
    ["multiple targets", "targetCount", 2],
    ["broad selector", "selectorMode", "NEXT_ELIGIBLE"],
    ["non-synthetic", "syntheticOnly", false],
    ["customer marker", "customerPiiPresent", true],
    ["broad fallback", "broadSelectorFallback", true],
  ])("blocks target evidence: %s", (_name, field, value) => {
    const evidence = hypotheticalEvidence();
    set(evidence.target, field, value);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["ISOLATED_DATABASE_AND_TARGET_VERIFIED"]);
  });

  it("detects target substitution across admission, sequential, approval, and containment", () => {
    const cases: Array<readonly [Record<string, unknown>, string]> = [];
    const evidence = hypotheticalEvidence();
    cases.push([evidence.admission, "targetBindingDigest"],
      [evidence.sequentialSafety, "targetBindingDigest"], [evidence.approval, "targetBindingDigest"],
      [evidence.containment, "targetBindingDigest"]);
    const expected = ["CONCURRENT_ADMISSION_VERIFIED", "SEQUENTIAL_DUPLICATE_SAFETY_VERIFIED",
      "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED", "POST_EXECUTION_CONTAINMENT_VERIFIED"];
    for (const [[record, field], blocker] of cases.map((entry, index) => [entry, expected[index]] as const)) {
      const candidate = hypotheticalEvidence();
      const candidateRecord = candidate[record === evidence.admission ? "admission"
        : record === evidence.sequentialSafety ? "sequentialSafety"
          : record === evidence.approval ? "approval" : "containment"];
      set(candidateRecord, field, DIGEST_D);
      expect(evaluateRefundSandboxCanaryEvidenceReadiness(candidate, NOW).blockers).toEqual([blocker]);
    }
  });
});

describe("exact preflight and canary job identity", () => {
  it.each([
    ["missing preflight job UID", (e: EvidenceFixture) => set(e.release, "preflightJobUid", "")],
    ["preflight UID equals canary UID", (e: EvidenceFixture) => set(
      e.release, "preflightJobUid", e.release.canaryJobUid,
    )],
    ["release preflight generation drift", (e: EvidenceFixture) => set(
      e.release, "preflightObservedGeneration", 12,
    )],
    ["release preflight etag drift", (e: EvidenceFixture) => set(
      e.release, "preflightObservedEtag", "other-etag",
    )],
    ["preflight image drift", (e: EvidenceFixture) => set(e.preflight, "imageDigest", DIGEST_E)],
    ["release versus preflight UID", (e: EvidenceFixture) => set(
      e.preflight, "preflightJobUid", "substituted-preflight-job",
    )],
    ["release versus preflight generation", (e: EvidenceFixture) => set(
      e.preflight, "preflightApprovedGeneration", 12,
    )],
    ["release versus preflight etag", (e: EvidenceFixture) => set(
      e.preflight, "preflightApprovedEtag", "substituted-etag",
    )],
    ["missing preflight source reference", (e: EvidenceFixture) => set(
      e.preflight, "sourceRecordId", "missing-source",
    )],
    ["wrong preflight source kind", (e: EvidenceFixture) => {
      const source = evidenceSource(e, "EMERGENCY_STOP_EVIDENCE");
      set(e.preflight, "sourceRecordId", source.sourceRecordId);
      set(e.preflight, "evidenceRecordId", source.sourceRecordId);
      set(e.preflight, "sourceDigest", source.sourceDigest);
      set(e.preflight, "evidenceDigest", source.sourceDigest);
    }],
    ["wrong preflight source digest", (e: EvidenceFixture) => {
      set(e.preflight, "sourceDigest", DIGEST_E); set(e.preflight, "evidenceDigest", DIGEST_E);
    }],
  ])("blocks release and preflight for %s", (_name, mutate) => {
    const evidence = hypotheticalEvidence();
    mutate(evidence);
    const expected = ["RELEASE_IMMUTABILITY_VERIFIED", "PROVIDER_FREE_PREFLIGHT_VERIFIED"];
    if (_name === "wrong preflight source kind" || _name === "wrong preflight source digest") {
      expected.push("EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED");
    }
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(expected);
  });

  it("blocks the exact preflight gate for an evidence-record ID mismatch", () => {
    const evidence = hypotheticalEvidence();
    set(evidence.preflight, "evidenceRecordId", "substituted-evidence-record");
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["PROVIDER_FREE_PREFLIGHT_VERIFIED",
        "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED"]);
  });

  it("blocks every gate when preflight provenance changes the package subject", () => {
    const evidence = hypotheticalEvidence();
    set(evidenceSource(evidence, "PREFLIGHT_EXECUTION_EVIDENCE"), "subjectDigest", DIGEST_E);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(REFUND_SANDBOX_CANARY_APPROVAL_GATES);
  });

  it("detects only preflight drift while canary identity remains exact", () => {
    const evidence = hypotheticalEvidence();
    const canary = {
      uid: evidence.release.canaryJobUid,
      generation: evidence.release.canaryApprovedGeneration,
      etag: evidence.release.canaryApprovedEtag,
    };
    set(evidence.preflight, "preflightObservedGeneration", 12);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["RELEASE_IMMUTABILITY_VERIFIED", "PROVIDER_FREE_PREFLIGHT_VERIFIED"]);
    expect({ uid: evidence.release.canaryJobUid,
      generation: evidence.release.canaryApprovedGeneration,
      etag: evidence.release.canaryApprovedEtag }).toEqual(canary);
  });
});

describe("detailed concurrent admission", () => {
  it.each([
    ["mechanism", "LOCAL_MEMORY"], ["implementationStatus", "DESIGN_ONLY"],
    ["dedicatedConnection", false], ["heldForFullProviderCapableExecution", false],
    ["acquisitionBeforeSecretRead", false], ["acquisitionBeforeAdapterConstruction", false],
    ["acquisitionBeforeProviderLookup", false], ["acquisitionBeforeProviderCancellation", false],
    ["losingResult", "RETRY"], ["losingSecretReadCount", 1], ["losingProviderRequestCount", 1],
    ["losingFinancialMutationCount", 1], ["concurrentWinnerCount", 2],
    ["concurrentLoserCount", 0], ["releaseBindingDigest", DIGEST_C],
    ["jobBindingDigest", DIGEST_C], ["targetBindingDigest", DIGEST_D],
    ["evidenceRecordId", "missing-record"],
  ])("blocks admission when %s is invalid", (field, value) => {
    const evidence = hypotheticalEvidence();
    set(evidence.admission, field, value);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["CONCURRENT_ADMISSION_VERIFIED"]);
  });

  it.each([
    ["too many losers", 2, 1, 99], ["missing invocation", 3, 1, 1],
    ["zero winners", 2, 0, 2], ["two winners", 2, 2, 0],
    ["zero losers", 2, 1, 0], ["negative invocation", -1, 1, 1],
    ["fractional loser", 2, 1, 0.5], ["NaN winner", 2, Number.NaN, 1],
    ["infinite invocation", Number.POSITIVE_INFINITY, 1, 1],
    ["unsafe invocation", Number.MAX_SAFE_INTEGER + 1, 1, Number.MAX_SAFE_INTEGER],
    ["overflow-prone operands", Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER],
  ])("rejects contradictory admission counts: %s", (_name, invocation, winner, loser) => {
    const evidence = hypotheticalEvidence();
    set(evidence.admission, "concurrentTestInvocationCount", invocation);
    set(evidence.admission, "concurrentWinnerCount", winner);
    set(evidence.admission, "concurrentLoserCount", loser);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.blockers).toEqual(["CONCURRENT_ADMISSION_VERIFIED"]);
    expect(result.code).toBe("SANDBOX_CANARY_APPROVAL_BLOCKED");
  });

  it.each([[2, 1, 1], [25, 1, 24]])(
    "accepts exactly reconciled admission counts %i = %i + %i",
    (invocation, winner, loser) => {
      const evidence = hypotheticalEvidence();
      set(evidence.admission, "concurrentTestInvocationCount", invocation);
      set(evidence.admission, "concurrentWinnerCount", winner);
      set(evidence.admission, "concurrentLoserCount", loser);
      expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW))
        .toEqual(readyDecision("VERIFIED_DISTINCT_HUMANS"));
    },
  );
});

describe("detailed sequential duplicate safety", () => {
  it.each([
    "leaseGenerationFencing", "leaseTokenFencing", "dispatchOrdinalUniqueness",
    "commandDispatchCas", "contactMarkerBeforeProviderCancellation",
    "immutableProviderOperationBinding", "idempotencyEvidenceBinding",
    "recoveryStateClassification", "unknownOutcomeMapsToPossibleContact",
    "blindRetryProhibited", "firstExecutionBlocksSecondProviderAction",
  ])("blocks sequential safety when %s is absent", (field) => {
    const evidence = hypotheticalEvidence();
    set(evidence.sequentialSafety, field, false);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["SEQUENTIAL_DUPLICATE_SAFETY_VERIFIED"]);
  });

  it.each([
    ["secondInvocationProviderOperationCount", 1], ["sequentialTestInvocationCount", 1],
    ["commandId", "other-command"], ["releaseBindingDigest", DIGEST_C],
    ["evidenceRecordId", "missing-record"],
  ])("blocks sequential safety for %s", (field, value) => {
    const evidence = hypotheticalEvidence();
    set(evidence.sequentialSafety, field, value);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["SEQUENTIAL_DUPLICATE_SAFETY_VERIFIED"]);
  });
});

describe("durable single-use consumption", () => {
  it.each([
    ["mechanism", "IN_MEMORY"], ["implementationStatus", "DESIGN_ONLY"],
    ["independentTestStatus", "NOT_TESTED"], ["durableStoreAuthority", ""],
    ["approvalId", "other-approval"],
    ["atomicCompareAndSet", false], ["consumeBeforeProviderCapableExecution", false],
    ["consumeBeforeSecretRead", false], ["secondConsumptionRejected", false],
    ["unconsumedToConsumedOnly", false], ["consumptionPersistsOnSuccess", false],
    ["consumptionPersistsOnFailure", false], ["consumptionPersistsOnCancellation", false],
    ["consumptionPersistsOnTimeout", false], ["consumptionPersistsOnAmbiguousOutcome", false],
    ["releaseBindingDigest", DIGEST_C], ["canaryJobBindingDigest", DIGEST_C],
    ["preflightJobBindingDigest", DIGEST_C],
    ["imageBindingDigest", DIGEST_C], ["secretGenerationBindingDigest", DIGEST_C],
    ["targetBindingDigest", DIGEST_D], ["executionLimit", 2],
    ["evidenceRecordId", "missing-record"], ["evidenceDigest", DIGEST_E],
    ["implementationTestProvenance", ""],
  ])("blocks durable consumption for %s", (field, value) => {
    const evidence = hypotheticalEvidence();
    set(evidence.consumption, field, value);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["DURABLE_SINGLE_USE_APPROVAL_CONSUMPTION_VERIFIED"]);
  });

  it("blocks durable consumption when its provenance binding is substituted", () => {
    const evidence = hypotheticalEvidence();
    set(evidenceSource(evidence, "SINGLE_USE_CONSUMPTION_EVIDENCE"),
      "evidenceBindingDigest", DIGEST_E);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["DURABLE_SINGLE_USE_APPROVAL_CONSUMPTION_VERIFIED"]);
  });

  it("blocks every gate for durable-consumption subject substitution", () => {
    const evidence = hypotheticalEvidence();
    set(evidenceSource(evidence, "SINGLE_USE_CONSUMPTION_EVIDENCE"),
      "subjectDigest", DIGEST_E);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(REFUND_SANDBOX_CANARY_APPROVAL_GATES);
  });
});

describe("post-preflight approval provenance and ordering", () => {
  it("accepts a provenance-backed deliberate approval strictly after preflight", () => {
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(hypotheticalEvidence(), NOW))
      .toEqual(readyDecision("VERIFIED_DISTINCT_HUMANS"));
  });

  it.each([
    ["equal to completion", NOW - 3_000], ["before completion", NOW - 3_001],
  ])("blocks approval when approvedAt is %s", (_name, approvedAt) => {
    const evidence = hypotheticalEvidence();
    setApprovalTime(evidence, approvedAt, NOW - 1_000 + HOUR);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED"]);
  });

  it.each([
    ["absent source", (e: EvidenceFixture) => set(e.approval, "approvalSourceRecordId", "absent")],
    ["source ID mismatch", (e: EvidenceFixture) => set(
      e.approval, "approvalEvidenceRecordId", "different-evidence-id",
    )],
    ["source digest mismatch", (e: EvidenceFixture) => set(
      e.approval, "approvalSourceDigest", DIGEST_E,
    )],
    ["wrong source kind", (e: EvidenceFixture) => {
      const source = evidenceSource(e, "STAFFED_WINDOW_APPROVAL");
      set(e.approval, "approvalEvidenceRecordId", source.sourceRecordId);
      set(e.approval, "approvalSourceRecordId", source.sourceRecordId);
      set(e.approval, "approvalEvidenceDigest", source.sourceDigest);
      set(e.approval, "approvalSourceDigest", source.sourceDigest);
    }],
    ["source observed before approval", (e: EvidenceFixture) => set(
      evidenceSource(e, "EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE"),
      "observedAtMs", e.approval.approvedAtMs - 1,
    )],
    ["wrong preflight record", (e: EvidenceFixture) => set(
      e.approval, "preflightEvidenceRecordId", "other-preflight-record",
    )],
    ["wrong preflight digest", (e: EvidenceFixture) => set(
      e.approval, "preflightEvidenceDigest", DIGEST_E,
    )],
    ["unrelated synthetic source", (e: EvidenceFixture) => {
      const source = evidenceSource(e, "ADMISSION_TEST_EVIDENCE");
      set(e.approval, "approvalEvidenceRecordId", source.sourceRecordId);
      set(e.approval, "approvalSourceRecordId", source.sourceRecordId);
      set(e.approval, "approvalEvidenceDigest", source.sourceDigest);
      set(e.approval, "approvalSourceDigest", source.sourceDigest);
    }],
  ])("blocks linked approval for %s", (_name, mutate) => {
    const evidence = hypotheticalEvidence();
    mutate(evidence);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED"]);
  });

  it.each([
    ["release", "releaseBindingDigest", DIGEST_E],
    ["canary job", "canaryJobBindingDigest", DIGEST_E],
    ["preflight job", "preflightJobBindingDigest", DIGEST_E],
    ["image", "imageBindingDigest", DIGEST_E],
    ["secret", "secretGenerationBindingDigest", DIGEST_E],
    ["target", "targetBindingDigest", DIGEST_E],
  ])("blocks approval for a %s binding mismatch", (_name, field, value) => {
    const evidence = hypotheticalEvidence();
    set(evidence.approval, field, value);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED"]);
  });

  it("blocks approval when preflight provenance predates completion", () => {
    const evidence = hypotheticalEvidence();
    set(evidenceSource(evidence, "PREFLIGHT_EXECUTION_EVIDENCE"),
      "observedAtMs", evidence.preflight.completedAtMs - 1);
    const blockers = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers;
    expect(blockers).toEqual(["RELEASE_IMMUTABILITY_VERIFIED",
      "PROVIDER_FREE_PREFLIGHT_VERIFIED", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED"]);
  });

  it("blocks all gates for approval-source subject substitution", () => {
    const evidence = hypotheticalEvidence();
    set(evidenceSource(evidence, "EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE"),
      "subjectDigest", DIGEST_E);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(REFUND_SANDBOX_CANARY_APPROVAL_GATES);
  });
});

describe("emergency, preflight, and containment evidence", () => {
  it.each([
    ["no cancellation authority", "canCancelExecution"],
    ["no future-invocation removal", "canRemoveInvocationAuthority"],
    ["unsafe secret-removal boundary", "canRemoveSecretAccessAfterStop"],
    ["no evidence preservation", "preservesLogsAndDatabaseEvidence"],
    ["no provider-free observations", "providerFreeObservationsAvailable"],
    ["timeout not possible contact", "possibleContactClassification"],
  ])("blocks emergency-stop evidence for %s", (_name, field) => {
    const evidence = hypotheticalEvidence();
    set(evidence.emergencyStop, field, false);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["EMERGENCY_STOP_VERIFIED"]);
  });

  it.each([
    ["secret binding present", "noTossSecretBinding"],
    ["provider adapter reachable", "providerAdapterUnreachable"],
    ["provider network reachable", "providerNetworkUnreachable"],
    ["financial mutation possible", "noFinancialMutation"],
    ["incomplete result evidence", "checksComplete"],
  ])("blocks provider-free preflight for %s", (_name, field) => {
    const evidence = hypotheticalEvidence();
    set(evidence.preflight, field, false);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["PROVIDER_FREE_PREFLIGHT_VERIFIED"]);
  });

  it.each([
    ["job identity", "preflightJobUid", "substituted-job"],
    ["release image", "imageDigest", DIGEST_E],
    ["migration inventory", "migrationDigest", DIGEST_E],
  ])("blocks release and preflight for %s mismatch", (_name, field, value) => {
    const evidence = hypotheticalEvidence();
    set(evidence.preflight, field, value);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["RELEASE_IMMUTABILITY_VERIFIED", "PROVIDER_FREE_PREFLIGHT_VERIFIED"]);
  });

  it.each([
    ["automatic rerun", "automaticSecondExecutionForbidden"],
    ["executor authority retained", "invocationAuthorityRemovedAfterExecution"],
    ["scheduler present", "schedulerRemainsAbsent"],
    ["job configuration discarded", "jobConfigurationRetainedForAudit"],
    ["execution evidence discarded", "evidenceRetained"],
    ["unsafe runtime secret cleanup", "secretAccessRemovedAfterSafeStop"],
    ["missing reconciliation snapshot", "manualAndReconciliationSnapshotCaptured"],
  ])("blocks containment for %s", (_name, field) => {
    const evidence = hypotheticalEvidence();
    set(evidence.containment, field, false);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers)
      .toEqual(["POST_EXECUTION_CONTAINMENT_VERIFIED"]);
  });
});

describe("operator authority and exact time", () => {
  it.each([
    ["same human in distinct mode", "executeHumanSubjectId", "deploy-human"],
    ["same principal", "executePrincipalId", "deploy-principal"],
    ["separation false", "separateAuthenticatedDeployAndExecutePrincipals", false],
    ["shared login", "sharedLoginOrPrincipal", true], ["deployer can execute", "deployerCanExecute", true],
    ["executor can deploy", "executorCanDeploy", true],
    ["execution override", "executorHasRunWithOverrides", true],
    ["job update", "executorCanUpdateJob", true],
    ["broad Cloud Run authority", "executorHasBroadCloudRunAuthority", true],
    ["secret access", "executorCanReadSecrets", true],
    ["database access", "executorHasDirectDatabaseAccess", true],
    ["IAM modification", "runtimeCanDeployOrModifyIam", true],
    ["default runtime account", "defaultOrSharedRuntimeServiceAccount", true],
    ["service-account key", "serviceAccountKeyPresent", true],
    ["scheduler identity", "schedulerIdentityExists", true],
    ["runtime collision", "canaryRuntimePrincipalId", "execute-principal"],
  ])("rejects contradictory distinct-human evidence: %s", (_name, field, value) => {
    const evidence = hypotheticalEvidence();
    set(evidence.iam, field, value);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.blockers).toContain("IAM_SEPARATION_VERIFIED");
    expect(result.operatorSeparation).toBe("UNDETERMINED");
  });

  it.each([
    ["different human", "executeHumanSubjectId", "other-human", "IAM_SEPARATION_VERIFIED"],
    ["same principal", "executePrincipalId", "deploy-principal", "IAM_SEPARATION_VERIFIED"],
    ["missing risk", "riskAcceptanceReference", "", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED"],
    ["missing post-preflight", "postPreflightDeliberateApproval", false, "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED"],
    ["override", "executorHasRunWithOverrides", true, "NO_EXECUTION_OVERRIDES_VERIFIED"],
  ])("blocks single-operator safeguard: %s", (_name, field, value, blocker) => {
    const evidence = hypotheticalEvidence("SINGLE_OPERATOR_EXCEPTION");
    if (field in evidence.iam) set(evidence.iam, field, value);
    else set(evidence.approval, field, value);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW).blockers).toContain(blocker);
  });

  it("accepts exactly 60 minutes and rejects every unsafe time boundary", () => {
    const exact = hypotheticalEvidence();
    setApprovalTime(exact, NOW - 1, NOW - 1 + HOUR);
    expect(evaluateRefundSandboxCanaryEvidenceReadiness(exact, NOW).blockers)
      .not.toContain("EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED");
    for (const [approvedAt, expiresAt, now] of [
      [NOW - 1, NOW - 1 + HOUR + 1, NOW], [NOW - HOUR, NOW, NOW],
      [NOW + 1, NOW + 2, NOW], [NOW + 2, NOW + 1, NOW], [-1, NOW + 1, NOW],
      [0.5, NOW + 1, NOW], [Number.NaN, NOW + 1, NOW],
      [NOW, Number.POSITIVE_INFINITY, NOW], [Number.MAX_SAFE_INTEGER, 1, NOW],
    ]) {
      const evidence = hypotheticalEvidence();
      setApprovalTime(evidence, approvedAt, expiresAt);
      expect(evaluateRefundSandboxCanaryEvidenceReadiness(evidence, now).blockers)
        .toContain("EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED");
    }
  });

  it("rejects unsafe authoritative time without using wall clock time", () => {
    for (const now of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1, undefined, null]) {
      expect(evaluateRefundSandboxCanaryEvidenceReadiness(hypotheticalEvidence(), now))
        .toEqual(invalidDecision());
    }
  });
});

describe("complete single-operator exception safeguards", () => {
  it.each([
    ["same human subject", "IAM_SEPARATION_VERIFIED", (e: EvidenceFixture) => set(
      e.iam, "executeHumanSubjectId", "different-human",
    )],
    ["distinct authenticated principals", "IAM_SEPARATION_VERIFIED", (e: EvidenceFixture) => set(
      e.iam, "executePrincipalId", e.iam.deployPrincipalId,
    )],
    ["no shared login", "IAM_SEPARATION_VERIFIED", (e: EvidenceFixture) => set(
      e.iam, "sharedLoginOrPrincipal", true,
    )],
    ["written risk acceptance", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "riskAcceptanceReference", "")],
    ["second deliberate approval", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "postPreflightDeliberateApproval", false)],
    ["approval provenance", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "approvalSourceRecordId", "missing-source")],
    ["approval after preflight", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => setApprovalTime(e, e.preflight.completedAtMs, NOW - 1_000 + HOUR)],
    ["no execution override", "NO_EXECUTION_OVERRIDES_VERIFIED",
      (e: EvidenceFixture) => set(e.iam, "executorHasRunWithOverrides", true)],
    ["no scheduler", "MANUAL_ONLY_NO_SCHEDULER_VERIFIED",
      (e: EvidenceFixture) => set(e.job, "schedulerTargetCount", 1)],
    ["no automatic retry", "CLOUD_RUN_JOB_CONFIGURATION_VERIFIED",
      (e: EvidenceFixture) => set(e.job, "maxRetries", 1)],
    ["exactly one target", "ISOLATED_DATABASE_AND_TARGET_VERIFIED",
      (e: EvidenceFixture) => set(e.target, "targetCount", 2)],
    ["release binding", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "releaseBindingDigest", DIGEST_E)],
    ["canary job binding", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "canaryJobBindingDigest", DIGEST_E)],
    ["preflight job binding", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "preflightJobBindingDigest", DIGEST_E)],
    ["image binding", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "imageBindingDigest", DIGEST_E)],
    ["secret binding", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "secretGenerationBindingDigest", DIGEST_E)],
    ["target binding", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "targetBindingDigest", DIGEST_E)],
    ["maximum validity", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => setApprovalTime(e, NOW - 1, NOW - 1 + HOUR + 1)],
    ["invocation authority removal", "POST_EXECUTION_CONTAINMENT_VERIFIED",
      (e: EvidenceFixture) => set(e.containment, "invocationAuthorityRemovedAfterExecution", false)],
    ["no second execution", "POST_EXECUTION_CONTAINMENT_VERIFIED",
      (e: EvidenceFixture) => set(e.containment, "noSecondExecutionBeforeReconciliation", false)],
    ["runtime identity separation", "IAM_SEPARATION_VERIFIED",
      (e: EvidenceFixture) => set(e.iam, "preflightRuntimePrincipalId", e.iam.executePrincipalId)],
    ["default service account", "IAM_SEPARATION_VERIFIED",
      (e: EvidenceFixture) => set(e.iam, "defaultOrSharedRuntimeServiceAccount", true)],
    ["service-account key", "IAM_SEPARATION_VERIFIED",
      (e: EvidenceFixture) => set(e.iam, "serviceAccountKeyPresent", true)],
  ])("blocks an incoherent exception without a verified label: %s", (
    _name, blocker, mutate,
  ) => {
    const evidence = hypotheticalEvidence("SINGLE_OPERATOR_EXCEPTION");
    mutate(evidence);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.code).toBe("SANDBOX_CANARY_APPROVAL_BLOCKED");
    expect(result.blockers).toContain(blocker);
    expect(result.operatorSeparation).toBe("UNDETERMINED");
  });
});

describe("finalized-gate operator-separation invariant", () => {
  it("does not verify distinct humans when package provenance blocks the IAM gate", () => {
    const evidence = hypotheticalEvidence("DISTINCT_HUMAN_OPERATORS");
    set(evidence.provenance, "subjectBindingDigest", DIGEST_E);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.code).toBe("SANDBOX_CANARY_APPROVAL_BLOCKED");
    expect(gateStatus(result, "IAM_SEPARATION_VERIFIED")).toBe("BLOCKED");
    expect(result.blockers).toContain("IAM_SEPARATION_VERIFIED");
    expect(result.operatorSeparation).toBe("UNDETERMINED");
    expect(result.operatorSeparation).not.toBe("VERIFIED_DISTINCT_HUMANS");
    expectNonAuthorizing(result);
  });

  it("does not verify distinct humans when the executor has override authority", () => {
    const evidence = hypotheticalEvidence("DISTINCT_HUMAN_OPERATORS");
    set(evidence.iam, "executorHasRunWithOverrides", true);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.code).toBe("SANDBOX_CANARY_APPROVAL_BLOCKED");
    expect(gateStatus(result, "NO_EXECUTION_OVERRIDES_VERIFIED")).toBe("BLOCKED");
    expect(gateStatus(result, "IAM_SEPARATION_VERIFIED")).toBe("BLOCKED");
    expect(result.blockers).toContain("NO_EXECUTION_OVERRIDES_VERIFIED");
    expect(result.blockers).toContain("IAM_SEPARATION_VERIFIED");
    expect(result.operatorSeparation).toBe("UNDETERMINED");
    expectNonAuthorizing(result);
  });

  it("reports verified distinct humans only from a ready finalized IAM gate", () => {
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(
      hypotheticalEvidence("DISTINCT_HUMAN_OPERATORS"), NOW,
    );
    expect(result.code).toBe("SANDBOX_CANARY_EVIDENCE_READY_FOR_TRUSTED_ISSUER");
    expect(gateStatus(result, "IAM_SEPARATION_VERIFIED")).toBe("READY");
    expect(result.operatorSeparation).toBe("VERIFIED_DISTINCT_HUMANS");
    expect(result.operatorSeparation).not.toBe("ABSENT_SINGLE_OPERATOR_EXCEPTION");
    expectNonAuthorizing(result);
  });

  it("does not report a coherent exception when provider-free preflight is incomplete", () => {
    const evidence = hypotheticalEvidence("SINGLE_OPERATOR_EXCEPTION");
    set(evidence.preflight, "completed", false);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.code).toBe("SANDBOX_CANARY_APPROVAL_BLOCKED");
    expect(gateStatus(result, "PROVIDER_FREE_PREFLIGHT_VERIFIED")).toBe("BLOCKED");
    expect(result.blockers).toContain("PROVIDER_FREE_PREFLIGHT_VERIFIED");
    expect(result.operatorSeparation).toBe("UNDETERMINED");
    expect(result.operatorSeparation).not.toBe("ABSENT_SINGLE_OPERATOR_EXCEPTION");
    expectNonAuthorizing(result);
  });

  it("reports the exception label only when every dependent finalized gate is ready", () => {
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(
      hypotheticalEvidence("SINGLE_OPERATOR_EXCEPTION"), NOW,
    );
    expect(result.code).toBe("SANDBOX_CANARY_EVIDENCE_READY_FOR_TRUSTED_ISSUER");
    for (const gate of ["IAM_SEPARATION_VERIFIED", "MANUAL_ONLY_NO_SCHEDULER_VERIFIED",
      "NO_EXECUTION_OVERRIDES_VERIFIED", "ISOLATED_DATABASE_AND_TARGET_VERIFIED",
      "PROVIDER_FREE_PREFLIGHT_VERIFIED", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      "POST_EXECUTION_CONTAINMENT_VERIFIED"] as const) {
      expect(gateStatus(result, gate)).toBe("READY");
    }
    expect(result.operatorSeparation).toBe("ABSENT_SINGLE_OPERATOR_EXCEPTION");
    expect(result.operatorSeparation).not.toBe("VERIFIED_DISTINCT_HUMANS");
    expectNonAuthorizing(result);
  });

  it.each<readonly [string, RefundSandboxCanaryApprovalGate, (evidence: EvidenceFixture) => void]>([
    ["IAM separation", "IAM_SEPARATION_VERIFIED", (e: EvidenceFixture) => set(
      e.iam, "deployerCanExecute", true,
    )],
    ["no overrides", "NO_EXECUTION_OVERRIDES_VERIFIED", (e: EvidenceFixture) => set(
      e.iam, "executorHasRunWithOverrides", true,
    )],
    ["manual only", "MANUAL_ONLY_NO_SCHEDULER_VERIFIED", (e: EvidenceFixture) => set(
      e.job, "schedulerTargetCount", 1,
    )],
    ["exact target", "ISOLATED_DATABASE_AND_TARGET_VERIFIED", (e: EvidenceFixture) => set(
      e.target, "targetCount", 2,
    )],
    ["provider-free preflight", "PROVIDER_FREE_PREFLIGHT_VERIFIED", (e: EvidenceFixture) => set(
      e.preflight, "completed", false,
    )],
    ["explicit approval", "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
      (e: EvidenceFixture) => set(e.approval, "riskAcceptanceReference", "")],
    ["containment", "POST_EXECUTION_CONTAINMENT_VERIFIED", (e: EvidenceFixture) => set(
      e.containment, "invocationAuthorityRemovedAfterExecution", false,
    )],
  ])("makes the exception label unreachable when %s is blocked", (
    _name, blocker, mutate,
  ) => {
    const evidence = hypotheticalEvidence("SINGLE_OPERATOR_EXCEPTION");
    mutate(evidence);
    const result = evaluateRefundSandboxCanaryEvidenceReadiness(evidence, NOW);
    expect(result.code).toBe("SANDBOX_CANARY_APPROVAL_BLOCKED");
    expect(gateStatus(result, blocker)).toBe("BLOCKED");
    expect(result.blockers).toContain(blocker);
    expect(result.blockers).not.toContain("APPROVAL_EVIDENCE_INVALID");
    expect(result.operatorSeparation).toBe("UNDETERMINED");
    expectNonAuthorizing(result);
  });
});

describe("reachability and documentation", () => {
  it("has no production caller or package command", () => {
    const callers = reverseReachableFiles(CONTRACT, productionSourceFiles())
      .map(repositoryPath).filter((path) => path !== repositoryPath(CONTRACT));
    expect(callers).toEqual([]);
    expect(readFileSync(join(ROOT, "package.json"), "utf8"))
      .not.toContain("sandbox-canary-approval");
  });

  it.each([
    ["worker cycle", "src/lib/payment/refund/run-refund-execution-worker-cycle.ts", 'import "./refund-sandbox-canary-approval-contract";'],
    ["provider adapter", "src/lib/payment/refund/providers/toss/caller.ts", 'import "../../refund-sandbox-canary-approval-contract";'],
    ["route", "src/app/canary.ts", 'import "../lib/payment/refund/refund-sandbox-canary-approval-contract";'],
    ["Server Action", "src/app/actions/canary.ts", 'import "../../lib/payment/refund/refund-sandbox-canary-approval-contract";'],
    ["operations CLI", "scripts/canary.ts", 'import "../src/lib/payment/refund/refund-sandbox-canary-approval-contract";'],
    ["deployment rehearsal", "src/lib/payment/refund/run-refund-deployment-rehearsal.ts", 'import "./refund-sandbox-canary-approval-contract";'],
    ["scheduler", "src/scheduler/canary.ts", 'import "../lib/payment/refund/refund-sandbox-canary-approval-contract";'],
    ["daemon", "src/daemon/canary.ts", 'import "../lib/payment/refund/refund-sandbox-canary-approval-contract";'],
    ["queue", "src/queue/canary.ts", 'import "../lib/payment/refund/refund-sandbox-canary-approval-contract";'],
  ])("rejects %s caller through shared scanner", async (_name, callerPath, source) => {
    const root = await mkdtemp(join(tmpdir(), "mira-p3e-readiness-"));
    const target = join(root, "src/lib/payment/refund/refund-sandbox-canary-approval-contract.ts");
    const caller = join(root, callerPath);
    try {
      await Promise.all([mkdir(dirname(target), { recursive: true }),
        mkdir(dirname(caller), { recursive: true })]);
      await Promise.all([writeFile(target, "export const ready = true;\n"),
        writeFile(caller, `${source}\n`)]);
      expect(reverseReachableFiles(target, [target, caller]).sort()).toEqual([caller, target].sort());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses exact reconciled P3E-A/B/C/D status in all five documents", () => {
    const docs = ["refund_worker_sandbox_canary_platform_v1.md",
      "refund_worker_deployment_rehearsal_v1.md", "refund_worker_operations_runbook_v1.md",
      "refund_worker_lifecycle_v1.md", "refund_worker_observability_v1.md"];
    for (const name of docs) {
      const text = readFileSync(join(ROOT, "docs/payment_policy", name), "utf8")
        .replace(/\s+/gu, " ");
      for (const phrase of ["P3D provider-free rehearsal is implemented",
        "P3E-A evidence-readiness contract is implemented",
        "P3E-A cannot issue executable approval",
        "P3E-B1 repository IaC/admission implementation exists",
        "No GCP resource has been provisioned", "No image has been built or pushed",
        "No cloud preflight has run", "No provider secret exists",
        "No exact target is sealed", "No approval is issued",
        "No trusted evidence producer/verifier exists",
        "No durable single-use consumption ledger exists",
        "P3E-B2 remains unimplemented and unauthorized",
        "P3E-C remains unimplemented and unauthorized",
        "P3E-D provider-contact execution remains unimplemented and unauthorized",
        "Scheduled SANDBOX remains blocked", "LIVE remains unreachable"]) {
        expect(text, `${name}: ${phrase}`).toContain(phrase);
      }
    }

    const host = readFileSync(
      join(ROOT, "docs/payment_policy/refund_worker_host_v1.md"), "utf8",
    ).replace(/\s+/gu, " ");
    expect(host).toContain(
      "P3E-B1 repository code implements a PostgreSQL session-level job-wide distributed-admission boundary integrated before protected worker work",
    );
    expect(host).toContain("not deployed or proven in Cloud Run or Cloud SQL");
    expect(host).toContain(
      "Deployed platform enforcement remains unverified until separately authorized P3E-B2 provisioning and evidence",
    );
    expect(host).toContain(
      "Cloud Run task count and parallelism are not the admission authority",
    );
    expect(host).not.toContain("overlap enforcement");

    const platform = readFileSync(
      join(ROOT, "docs/payment_policy/refund_worker_sandbox_canary_platform_v1.md"), "utf8",
    ).replace(/\s+/gu, " ").replace(/\*/gu, "");
    expect(platform).toContain(
      "P3E-B1 now implements repository IaC, provider-free preflight, and PostgreSQL job-wide distributed-admission code",
    );
    expect(platform).toContain(
      "P3E-B2 remains future provider-free provisioning and cloud preflight execution",
    );
    expect(platform).toContain(
      "P3E-C remains future trusted evidence production/verification, exact target and secret sealing, approval issuance, and durable atomic single-use consumption",
    );
    expect(platform).toContain("P3E-D remains the single provider-contact canary phase");
    for (const check of ["database connectivity", "PostgreSQL major", "migration readiness",
      "disabled worker readiness", "zero-backlog health", "an empty manual-review queue",
      "an empty reconciliation snapshot", "absent credential metadata",
      "a production distributed-admission no-op probe"]) {
      expect(platform, check).toContain(check);
    }
    expect(platform).toContain("Provider and secret boundaries and network contact are unreachable");
    expect(platform).toContain("it performs no financial mutation");
    expect(platform).toContain("The P3E-B preflight does not invoke the P3D rehearsal command");
    expect(platform).toContain("P3D remains a separate local deployment-rehearsal contract");
    expect(platform).toContain(
      "the two share some underlying provider-free observations but are not the same execution",
    );
    expect(platform).not.toContain("P3E-B may later");
    expect(platform).not.toContain("rehearsal checks");
  });
});

type EvidenceFixture = ReturnType<typeof hypotheticalEvidence>;
type Mutation = (evidence: EvidenceFixture) => void;

function hypotheticalEvidence(
  mode: RefundSandboxCanaryOperatingMode = "DISTINCT_HUMAN_OPERATORS",
) {
  const sourceRecords = REFUND_SANDBOX_CANARY_SOURCE_KINDS.map((sourceKind, index) => {
    const recordDigest = sourceDigest(index);
    return {
      sourceKind, sourceRecordId: sourceId(sourceKind), sourceDigest: recordDigest,
      observedAtMs: sourceKind === "PREFLIGHT_EXECUTION_EVIDENCE" ? NOW - 3_000
        : sourceKind === "EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE" ? NOW - 1_000
          : NOW - 5_000,
      subjectDigest: DIGEST_A,
      evidenceBindingDigest: sourceKind === "PREFLIGHT_EXECUTION_EVIDENCE" ? DIGEST_D
        : sourceKind === "EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE"
          || sourceKind === "SINGLE_USE_CONSUMPTION_EVIDENCE" ? recordDigest : DIGEST_A,
      producerReference: `producer-reference-${index}`,
    };
  });
  const source = (kind: RefundSandboxCanarySourceKind) => {
    const record = sourceRecords.find((candidate) => candidate.sourceKind === kind);
    if (!record) throw new Error("Missing hypothetical source record.");
    return record;
  };
  return {
    formatVersion: REFUND_SANDBOX_CANARY_APPROVAL_FORMAT, operatingMode: mode,
    provenance: {
      evidenceFormatVersion: REFUND_SANDBOX_CANARY_EVIDENCE_FORMAT,
      producerKind: "EXTERNAL_EVIDENCE_PRODUCER", producerVersion: "future-v1",
      bundleId: "bundle-fixture", bundleDigest: DIGEST_B, issuedAtMs: NOW - 4_000,
      sourceRecords, subjectBindingDigest: DIGEST_A,
      provenanceVerificationExpectation: "TRUSTED_ISSUER_MUST_REVERIFY",
    },
    release: {
      bindingDigest: DIGEST_A, gitCommitSha: SHA, canaryImageDigest: DIGEST_B,
      preflightImageDigest: DIGEST_B, artifactRepository: "artifact-fixture",
      canaryJobUid: "canary-job-fixture", canaryApprovedGeneration: 7,
      canaryObservedGeneration: 7, canaryApprovedEtag: "canary-etag-fixture",
      canaryObservedEtag: "canary-etag-fixture", preflightJobUid: "preflight-job-fixture",
      preflightApprovedGeneration: 11, preflightObservedGeneration: 11,
      preflightApprovedEtag: "preflight-etag-fixture",
      preflightObservedEtag: "preflight-etag-fixture",
      canaryJobBindingDigest: DIGEST_B, preflightJobBindingDigest: DIGEST_D,
      packageLockDigest: DIGEST_B, migrationDigest: DIGEST_C,
      sourceBuildEvidenceRecordId: source("SOURCE_BUILD_ATTESTATION").sourceRecordId,
      sourceBuildEvidenceDigest: source("SOURCE_BUILD_ATTESTATION").sourceDigest,
      artifactEvidenceRecordId: source("ARTIFACT_REGISTRY_EVIDENCE").sourceRecordId,
      artifactEvidenceDigest: source("ARTIFACT_REGISTRY_EVIDENCE").sourceDigest,
    },
    platform: {
      bindingDigest: DIGEST_B, projectIdentity: "project-fixture", region: "asia-northeast3",
      isolatedProject: true, artifactRegistry: true, cloudRunJobs: true, cloudSqlPostgres: true,
      secretManager: true, cloudLogging: true, cloudMonitoring: true,
      noProductionDevelopmentAcceptanceData: true, noCustomerPii: true,
    },
    job: {
      bindingDigest: DIGEST_B, releaseBindingDigest: DIGEST_A, targetBindingDigest: DIGEST_C,
      triggerMode: "MANUAL_ONLY", taskCount: 1, parallelism: 1, maxRetries: 0,
      taskTimeoutSeconds: 150, internalBudgetSeconds: 120, containerCount: 1,
      schedulerTargetCount: 0, imageDigestPinned: true, entrypointPinned: true,
      argumentsPinned: true, noShellInterpolation: true, liveUnreachable: true,
      evidenceRecordId: source("CLOUD_RUN_JOB_EVIDENCE").sourceRecordId,
      evidenceDigest: source("CLOUD_RUN_JOB_EVIDENCE").sourceDigest,
    },
    iam: {
      operatingMode: mode, deployHumanSubjectId: "deploy-human",
      executeHumanSubjectId: mode === "DISTINCT_HUMAN_OPERATORS" ? "execute-human" : "deploy-human",
      credentialOwnerHumanSubjectId: "credential-human", deployPrincipalId: "deploy-principal",
      executePrincipalId: "execute-principal", credentialOwnerPrincipalId: "credential-principal",
      preflightRuntimePrincipalId: "preflight-runtime", canaryRuntimePrincipalId: "canary-runtime",
      separateAuthenticatedDeployAndExecutePrincipals: true, sharedLoginOrPrincipal: false,
      executorHasRunWithOverrides: false, executorCanUpdateJob: false,
      executorCanReadSecrets: false, executorHasBroadCloudRunAuthority: false,
      executorHasDirectDatabaseAccess: false,
      deployerCanExecute: false, executorCanDeploy: false, runtimeCanDeployOrModifyIam: false,
      defaultOrSharedRuntimeServiceAccount: false, serviceAccountKeyPresent: false,
      schedulerIdentityExists: false, evidenceRecordId: source("IAM_POLICY_EVIDENCE").sourceRecordId,
      evidenceDigest: source("IAM_POLICY_EVIDENCE").sourceDigest,
    },
    secret: {
      bindingDigest: DIGEST_B, provider: "TOSS", mode: "SANDBOX",
      resourceIdentity: "secret-resource-fixture", numericVersion: 3, observedNumericVersion: 3,
      usesLatest: false, sharedProviderSecret: false, sharedEnvironmentSecret: false,
      liveCredential: false, googleApplicationCredentialsPresent: false,
      runtimeAccessLimitedToExactSecrets: true,
      evidenceRecordId: source("SECRET_VERSION_EVIDENCE").sourceRecordId,
      evidenceDigest: source("SECRET_VERSION_EVIDENCE").sourceDigest,
    },
    database: {
      bindingDigest: DIGEST_B, environment: "P3E_SANDBOX", databaseIdentity: "database-fixture",
      region: "asia-northeast3", exactP3EEnvironmentIdentity: true, syntheticOnly: true,
      migrationDigest: DIGEST_C, preflightRole: "preflight-role", canaryRole: "canary-role",
      rolesDistinct: true, preflightReadOnly: true, canaryNotSuperuser: true,
      canaryDoesNotOwnDatabase: true, canaryCannotModifySchemaOrMigrations: true,
      evidenceRecordId: source("CLOUD_SQL_EVIDENCE").sourceRecordId,
      evidenceDigest: source("CLOUD_SQL_EVIDENCE").sourceDigest,
    },
    target: {
      bindingDigest: DIGEST_C, targetCount: 1, commandId: "command-fixture",
      commandRefundAttemptId: "attempt-fixture", refundAttemptId: "attempt-fixture",
      refundAttemptPaymentId: "payment-fixture", paymentId: "payment-fixture",
      providerOperationBindingId: "operation-binding-fixture",
      commandProviderOperationBindingId: "operation-binding-fixture", provider: "TOSS",
      mode: "SANDBOX", commandAmountMinor: 10_000, refundAmountMinor: 10_000,
      paymentCurrency: "KRW", refundCurrency: "KRW", syntheticOnly: true,
      customerPiiPresent: false, initialCommandState: "READY",
      initialRefundAttemptState: "PROCESSING", selectorMode: "EXACT_COMMAND_ONLY",
      providerSandboxEvidenceRecordId: "sandbox-payment-evidence-fixture",
      providerOperationLimit: 1, broadSelectorFallback: false,
    },
    admission: {
      mechanism: "POSTGRES_NONBLOCKING_ADVISORY_LOCK",
      implementationStatus: "IMPLEMENTED_AND_INDEPENDENTLY_TESTED",
      lockAuthorityId: "lock-authority", lockKeyDerivationVersion: "v1",
      dedicatedConnection: true, heldForFullProviderCapableExecution: true,
      acquisitionBeforeSecretRead: true, acquisitionBeforeAdapterConstruction: true,
      acquisitionBeforeProviderLookup: true, acquisitionBeforeProviderCancellation: true,
      losingResult: "OVERLAP_SKIPPED", losingSecretReadCount: 0,
      losingProviderRequestCount: 0, losingFinancialMutationCount: 0,
      concurrentTestInvocationCount: 2, concurrentWinnerCount: 1, concurrentLoserCount: 1,
      evidenceRecordId: source("ADMISSION_TEST_EVIDENCE").sourceRecordId,
      evidenceDigest: source("ADMISSION_TEST_EVIDENCE").sourceDigest,
      releaseBindingDigest: DIGEST_A, jobBindingDigest: DIGEST_B, targetBindingDigest: DIGEST_C,
    },
    sequentialSafety: {
      commandId: "command-fixture", initialCommandState: "READY", leaseGenerationFencing: true,
      leaseTokenFencing: true, dispatchOrdinalUniqueness: true, commandDispatchCas: true,
      contactMarkerBeforeProviderCancellation: true, immutableProviderOperationBinding: true,
      idempotencyEvidenceBinding: true, recoveryStateClassification: true,
      unknownOutcomeMapsToPossibleContact: true, blindRetryProhibited: true,
      firstExecutionBlocksSecondProviderAction: true, secondInvocationProviderOperationCount: 0,
      sequentialTestInvocationCount: 2,
      evidenceRecordId: source("DUPLICATE_SAFETY_TEST_EVIDENCE").sourceRecordId,
      evidenceDigest: source("DUPLICATE_SAFETY_TEST_EVIDENCE").sourceDigest,
      releaseBindingDigest: DIGEST_A, jobBindingDigest: DIGEST_B, targetBindingDigest: DIGEST_C,
    },
    observability: {
      executionLogs: true, retentionConfigured: true, monitoringIncidentPolicy: true,
      boundedFailureAlerts: true, taskTimeoutAlert: true, missingFinalResultAlert: true,
      possibleContactAlert: true, manualReviewAlert: true, overlapSkippedNotification: true,
      credentialConfigurationAlert: true, notificationChannels: 2, emailChannelTested: true,
      secondaryChannelTested: true, sensitiveLabelsExcluded: true,
      evidenceRecordId: source("ALERT_DELIVERY_EVIDENCE").sourceRecordId,
      evidenceDigest: source("ALERT_DELIVERY_EVIDENCE").sourceDigest,
    },
    staffing: {
      ownersAssigned: true, ownersReachable: true, unattendedExecutionForbidden: true,
      preflightWindowMinutes: 30, continuousObservation: true, postExecutionWindowMinutes: 60,
      noSecondCanaryDuringWindow: true, noConcurrentRefundMaintenanceOrMigration: true,
      noCredentialRotationDuringWindow: true, criticalAcknowledgementMinutes: 5,
      investigationStartMinutes: 10, possibleContactPlanMinutes: 30,
      evidenceRecordId: source("STAFFED_WINDOW_APPROVAL").sourceRecordId,
      evidenceDigest: source("STAFFED_WINDOW_APPROVAL").sourceDigest,
    },
    emergencyStop: {
      canCancelExecution: true, canRemoveInvocationAuthority: true,
      canRemoveSecretAccessAfterStop: true, preservesLogsAndDatabaseEvidence: true,
      providerFreeObservationsAvailable: true, possibleContactClassification: true,
      providerRevocationNotInferred: true,
      evidenceRecordId: source("EMERGENCY_STOP_EVIDENCE").sourceRecordId,
      evidenceDigest: source("EMERGENCY_STOP_EVIDENCE").sourceDigest,
    },
    preflight: {
      completed: true, noTossSecretBinding: true,
      dedicatedRuntimeIdentity: true, readOnlyDatabaseRole: true, providerAdapterUnreachable: true,
      providerNetworkUnreachable: true, noFinancialMutation: true, checksComplete: true,
      preflightJobUid: "preflight-job-fixture", preflightApprovedGeneration: 11,
      preflightObservedGeneration: 11, preflightApprovedEtag: "preflight-etag-fixture",
      preflightObservedEtag: "preflight-etag-fixture", imageDigest: DIGEST_B,
      migrationDigest: DIGEST_C, completedAtMs: NOW - 3_000,
      evidenceRecordId: source("PREFLIGHT_EXECUTION_EVIDENCE").sourceRecordId,
      evidenceDigest: source("PREFLIGHT_EXECUTION_EVIDENCE").sourceDigest,
      sourceRecordId: source("PREFLIGHT_EXECUTION_EVIDENCE").sourceRecordId,
      sourceDigest: source("PREFLIGHT_EXECUTION_EVIDENCE").sourceDigest,
      releaseBindingDigest: DIGEST_A, canaryJobBindingDigest: DIGEST_B,
      preflightJobBindingDigest: DIGEST_D,
    },
    consumption: {
      mechanism: "POSTGRES_ATOMIC_APPROVAL_CONSUMPTION",
      implementationStatus: "IMPLEMENTED_AND_INDEPENDENTLY_TESTED",
      independentTestStatus: "INDEPENDENT_TEST_PASSED",
      durableStoreAuthority: "approval-ledger", approvalId: "approval-fixture",
      releaseBindingDigest: DIGEST_A, canaryJobBindingDigest: DIGEST_B,
      preflightJobBindingDigest: DIGEST_D, imageBindingDigest: DIGEST_B,
      secretGenerationBindingDigest: DIGEST_B, targetBindingDigest: DIGEST_C,
      consumeBeforeProviderCapableExecution: true, consumeBeforeSecretRead: true,
      atomicCompareAndSet: true, unconsumedToConsumedOnly: true, secondConsumptionRejected: true,
      consumptionPersistsOnSuccess: true, consumptionPersistsOnFailure: true,
      consumptionPersistsOnCancellation: true, consumptionPersistsOnTimeout: true,
      consumptionPersistsOnAmbiguousOutcome: true, executionLimit: 1,
      evidenceRecordId: source("SINGLE_USE_CONSUMPTION_EVIDENCE").sourceRecordId,
      evidenceDigest: source("SINGLE_USE_CONSUMPTION_EVIDENCE").sourceDigest,
      implementationTestProvenance: "future-independent-test",
    },
    approval: {
      approvalId: "approval-fixture",
      approvalEvidenceRecordId: source("EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE").sourceRecordId,
      approvalEvidenceDigest: source("EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE").sourceDigest,
      approvalSourceRecordId: source("EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE").sourceRecordId,
      approvalSourceDigest: source("EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE").sourceDigest,
      approvalMode: mode,
      approvingHumanSubjectId: mode === "DISTINCT_HUMAN_OPERATORS" ? "execute-human" : "deploy-human",
      authenticatedPrincipalId: "execute-principal", postPreflightDeliberateApproval: true,
      approvedAtMs: NOW - 1_000, expiresAtMs: NOW - 1_000 + HOUR,
      preflightEvidenceRecordId: source("PREFLIGHT_EXECUTION_EVIDENCE").sourceRecordId,
      preflightEvidenceDigest: source("PREFLIGHT_EXECUTION_EVIDENCE").sourceDigest,
      preflightCompletedAtMs: NOW - 3_000, releaseBindingDigest: DIGEST_A,
      canaryJobBindingDigest: DIGEST_B, preflightJobBindingDigest: DIGEST_D,
      imageBindingDigest: DIGEST_B,
      secretGenerationBindingDigest: DIGEST_B, targetBindingDigest: DIGEST_C,
      riskAcceptanceReference: mode === "SINGLE_OPERATOR_EXCEPTION" ? "risk-fixture" : "",
      intendedExecutionLimit: 1,
    },
    containment: {
      approvalId: "approval-fixture", targetBindingDigest: DIGEST_C,
      automaticSecondExecutionForbidden: true, invocationAuthorityRemovedAfterExecution: true,
      schedulerRemainsAbsent: true, jobConfigurationRetainedForAudit: true,
      executionIdentityRecorded: true, releaseIdentityRecorded: true,
      secretAccessRemovedAfterSafeStop: true, evidenceRetained: true,
      manualAndReconciliationSnapshotCaptured: true, possibleContactBlocksNextCanary: true,
      blindRetryForbidden: true, noSecondExecutionBeforeReconciliation: true,
      evidenceRecordId: source("CONTAINMENT_PLAN_EVIDENCE").sourceRecordId,
      evidenceDigest: source("CONTAINMENT_PLAN_EVIDENCE").sourceDigest,
    },
  };
}

function gateMutations(): ReadonlyArray<readonly [RefundSandboxCanaryApprovalGate, Mutation]> {
  return [
    ["RELEASE_IMMUTABILITY_VERIFIED", (e) => set(e.release, "gitCommitSha", "not-a-sha")],
    ["ISOLATED_GCP_ENVIRONMENT_VERIFIED", (e) => set(e.platform, "isolatedProject", false)],
    ["CLOUD_RUN_JOB_CONFIGURATION_VERIFIED", (e) => set(e.job, "taskCount", 2)],
    ["MANUAL_ONLY_NO_SCHEDULER_VERIFIED", (e) => set(e.job, "schedulerTargetCount", 1)],
    ["NO_EXECUTION_OVERRIDES_VERIFIED", (e) => set(e.iam, "executorHasRunWithOverrides", true)],
    ["IAM_SEPARATION_VERIFIED", (e) => set(e.iam, "deployerCanExecute", true)],
    ["PINNED_SANDBOX_SECRET_VERIFIED", (e) => set(e.secret, "usesLatest", true)],
    ["ISOLATED_DATABASE_AND_TARGET_VERIFIED", (e) => set(e.target, "targetCount", 2)],
    ["CONCURRENT_ADMISSION_VERIFIED", (e) => set(e.admission, "dedicatedConnection", false)],
    ["SEQUENTIAL_DUPLICATE_SAFETY_VERIFIED", (e) => set(e.sequentialSafety, "leaseTokenFencing", false)],
    ["OBSERVABILITY_VERIFIED", (e) => set(e.observability, "executionLogs", false)],
    ["ALERT_DELIVERY_VERIFIED", (e) => set(e.observability, "emailChannelTested", false)],
    ["STAFFED_WINDOW_VERIFIED", (e) => set(e.staffing, "ownersAssigned", false)],
    ["EMERGENCY_STOP_VERIFIED", (e) => set(e.emergencyStop, "canCancelExecution", false)],
    ["PROVIDER_FREE_PREFLIGHT_VERIFIED", (e) => set(e.preflight, "completed", false)],
    ["DURABLE_SINGLE_USE_APPROVAL_CONSUMPTION_VERIFIED", (e) => set(e.consumption, "atomicCompareAndSet", false)],
    ["EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED", (e) => set(e.approval, "expiresAtMs", NOW)],
    ["POST_EXECUTION_CONTAINMENT_VERIFIED", (e) => set(e.containment, "invocationAuthorityRemovedAfterExecution", false)],
  ];
}

function readyDecision(operatorSeparation: "VERIFIED_DISTINCT_HUMANS" | "ABSENT_SINGLE_OPERATOR_EXCEPTION") {
  return {
    formatVersion: REFUND_SANDBOX_CANARY_APPROVAL_FORMAT,
    code: "SANDBOX_CANARY_EVIDENCE_READY_FOR_TRUSTED_ISSUER",
    executionAuthorization: "NOT_ISSUED",
    provenanceTrust: "NOT_VERIFIED_BY_PURE_EVALUATOR",
    scheduledOperation: "BLOCKED", liveOperation: "BLOCKED", intendedExecutionLimit: 1,
    triggerMode: "MANUAL_ONLY", operatorSeparation,
    gates: REFUND_SANDBOX_CANARY_APPROVAL_GATES.map((id) => ({ id, status: "READY" })),
    blockers: [],
  };
}

function invalidDecision() {
  return {
    formatVersion: REFUND_SANDBOX_CANARY_APPROVAL_FORMAT,
    code: "SANDBOX_CANARY_APPROVAL_BLOCKED", executionAuthorization: "NOT_ISSUED",
    provenanceTrust: "NOT_VERIFIED_BY_PURE_EVALUATOR", scheduledOperation: "BLOCKED",
    liveOperation: "BLOCKED", intendedExecutionLimit: 1, triggerMode: "MANUAL_ONLY",
    operatorSeparation: "UNDETERMINED", gates: [], blockers: ["APPROVAL_EVIDENCE_INVALID"],
  };
}

function set(record: object, key: string, value: unknown): void {
  Object.defineProperty(record, key, { configurable: true, enumerable: true, value, writable: true });
}
function setApprovalTime(evidence: EvidenceFixture, approvedAtMs: unknown, expiresAtMs: unknown): void {
  set(evidence.approval, "approvedAtMs", approvedAtMs);
  set(evidence.approval, "expiresAtMs", expiresAtMs);
  const source = evidence.provenance.sourceRecords.find((record) =>
    record.sourceKind === "EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE");
  if (source && typeof approvedAtMs === "number" && Number.isSafeInteger(approvedAtMs)
    && approvedAtMs >= 0) set(source, "observedAtMs", approvedAtMs);
}
function evidenceSource(evidence: EvidenceFixture, kind: RefundSandboxCanarySourceKind) {
  const source = evidence.provenance.sourceRecords.find((record) => record.sourceKind === kind);
  if (!source) throw new Error("Missing hypothetical source record.");
  return source;
}
function gateStatus(
  result: ReturnType<typeof evaluateRefundSandboxCanaryEvidenceReadiness>,
  gate: RefundSandboxCanaryApprovalGate,
): "READY" | "BLOCKED" {
  const state = result.gates.find((candidate) => candidate.id === gate);
  if (!state) throw new Error("Missing canonical gate in evaluator result.");
  return state.status;
}
function expectNonAuthorizing(
  result: ReturnType<typeof evaluateRefundSandboxCanaryEvidenceReadiness>,
): void {
  expect(result.executionAuthorization).toBe("NOT_ISSUED");
  expect(result.provenanceTrust).toBe("NOT_VERIFIED_BY_PURE_EVALUATOR");
  expect(result.scheduledOperation).toBe("BLOCKED");
  expect(result.liveOperation).toBe("BLOCKED");
}
function digest(character: string): string { return `sha256:${character.repeat(64)}`; }
function sourceDigest(index: number): string {
  return digest(index.toString(16));
}
function sourceId(kind: RefundSandboxCanarySourceKind): string {
  return `record-${kind.toLowerCase().replaceAll("_", "-")}`;
}
