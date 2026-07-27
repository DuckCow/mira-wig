import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/trusted-project-bootstrap-readiness-v1.json";
import schema from "../../../../../infra/refund-sandbox/p3e-b2/trusted-project-bootstrap-readiness/evidence.schema.json";
import {
  approvedTb1ReadOnlyCommand,
  buildTb1ReadOnlyCommand,
  canonicalizeTb1Restricted,
  computeTb1EvidenceDigest,
  executeTb1ReadOnlyCommand,
  preflightRejectRepositoryContainedOutputPath,
  parseAndEvaluateTb1Evidence,
  tb1EvidencePassesStructuralSchemaPrefilter,
  TB1_APPROVED_SOURCE_APIS,
  TB1_BOOTSTRAP_APIS,
  TB1_BOOTSTRAP_API_SET_SHA256,
  TB1_CANONICALIZATION,
  TB1_CANONICAL_ARRAY_WORK_BOUND,
  TB1_COMMAND_TIMEOUT_MS,
  TB1_CONTRACT_VERSION,
  TB1_DISPOSITIONS,
  TB1_EVIDENCE_WRITER,
  TB1_FUTURE_CLOCK_ALLOWANCE_SECONDS,
  TB1_JSON_SCHEMA_ROLE,
  TB1_INJECTED_DEPENDENCY_FAILURES,
  TB1_MAX_CANONICAL_DEPTH,
  TB1_MAX_CANONICAL_NODES,
  TB1_MAX_READ_ATTEMPTS,
  TB1_OUTPUT_PATH_CHECK,
  TB1_PRINCIPAL_FINGERPRINT_TRUTH,
  type Tb1CommandAttemptResult,
  type Tb1CommandAttemptStatus,
  type Tb1CommandDependencies,
  type Tb1CommandExecutionRequest,
  type Tb1CommandFailure,
} from "../../../../../scripts/refund-p3e-b2-bootstrap-readiness.mjs";

const ROOT = process.cwd();
const PROJECT_ID = "mira-refund-sbx";
const PROJECT_NUMBER = "123456789012";
const NOW_MS = Date.parse("2026-07-27T12:00:00Z");
const COLLECTOR_HASH = "1".repeat(64);
const REVIEWER_HASH = "2".repeat(64);
const RESPONSE_HASHES = ["3".repeat(64), "4".repeat(64), "5".repeat(64)];

describe("P3E-B2 TB1 evidence contract", () => {
  it("accepts coherent fresh evidence with a distinct reviewer as ready", () => {
    const result = evaluate(makeEvidence());

    expect(result.disposition).toBe("READY_FOR_STATE_BUCKET_PACKAGE");
    expect(result.canonicalEvidence).toBe(canonicalizeTb1Restricted(result.evidence));
    expect(result.evidence).toMatchObject({
      contractVersion: TB1_CONTRACT_VERSION,
      evidenceScope: "PROJECT_BOOTSTRAP_READINESS",
    });
  });

  it("accepts coherent one-person collection only as independent-review-required", () => {
    const evidence = makeEvidence();
    record(record(evidence.operators).reviewer).status = "ABSENT";
    delete record(record(evidence.operators).reviewer).principalClass;
    delete record(record(evidence.operators).reviewer).principalIdentifierSha256;
    evidence.review = { disposition: "INDEPENDENT_REVIEW_REQUIRED" };

    const result = evaluate(evidence);

    expect(result.disposition).toBe("INDEPENDENT_REVIEW_REQUIRED");
    expect(record(record(result.evidence.operators).reviewer)).toEqual({ status: "ABSENT" });
    expect(result.evidence.downstreamAuthority).toEqual(allAuthorityFalse());
  });

  it("rejects self-review and never produces ready evidence", () => {
    const evidence = makeEvidence();
    record(record(evidence.operators).reviewer).principalIdentifierSha256 = COLLECTOR_HASH;

    expectInvalid(evidence);
  });

  it.each([
    ["one disabled API", [1]],
    ["multiple disabled APIs", [0, 2]],
  ])("classifies %s as activation-required", (_name, indexes) => {
    const evidence = makeEvidence();
    const observations = array(record(evidence.bootstrapApis).observations);
    for (const index of indexes) record(observations[index]).state = "DISABLED";
    record(evidence.review).disposition = "BOOTSTRAP_API_ACTIVATION_REQUIRED";

    expect(evaluate(evidence).disposition).toBe("BOOTSTRAP_API_ACTIVATION_REQUIRED");
  });

  it("classifies an unobservable API as observation-incomplete", () => {
    const evidence = makeEvidence();
    record(array(record(evidence.bootstrapApis).observations)[1]).state = "UNOBSERVABLE";
    record(evidence.review).disposition = "OBSERVATION_INCOMPLETE";

    expect(evaluate(evidence).disposition).toBe("OBSERVATION_INCOMPLETE");
  });

  it.each([
    ["DISABLED", "BILLING_NOT_READY"],
    ["UNOBSERVABLE", "OBSERVATION_INCOMPLETE"],
  ])("classifies %s billing without granting readiness", (classification, disposition) => {
    const evidence = makeEvidence();
    record(evidence.billing).classification = classification;
    record(evidence.review).disposition = disposition;

    expect(evaluate(evidence).disposition).toBe(disposition);
  });

  it("rejects a crossed consumer project number", () => {
    const evidence = makeEvidence();
    record(array(record(evidence.bootstrapApis).observations)[2]).consumerProjectNumber =
      "987654321098";

    expectInvalid(evidence);
  });

  it("rejects a non-ACTIVE project lifecycle", () => {
    const evidence = makeEvidence();
    record(evidence.project).lifecycleState = "DELETE_REQUESTED";

    expectInvalid(evidence);
  });

  it.each([
    ["empty", ""],
    ["zero", "0"],
    ["positive sign", "+123"],
    ["negative", "-123"],
    ["fractional", "123.5"],
    ["padded", "0123"],
    ["leading whitespace", " 123"],
    ["trailing whitespace", "123 "],
    ["hexadecimal", "0x7b"],
    ["unsafe", "9007199254740992"],
    ["overlong", "1".repeat(17)],
    ["number instead of string", 123],
    ["bigint-like text", "123n"],
  ])("rejects %s project number", (_name, value) => {
    const evidence = makeEvidence();
    record(evidence.project).projectNumber = value;

    expectInvalid(evidence);
  });

  it.each([
    ["production", "mira-production-refund"],
    ["live", "mira-live-refund"],
    ["development", "mira-development-refund"],
    ["acceptance", "mira-acceptance-refund"],
    ["default", "mira-default-refund"],
    ["uppercase", "Mira-refund-sbx"],
    ["too short", "mira"],
    ["punctuation", "mira_refund_sbx"],
  ])("rejects project classification %s", (_name, value) => {
    const evidence = makeEvidence();
    record(evidence.project).projectId = value;

    expectInvalid(evidence);
  });

  it.each([
    ["altered inventory", (evidence: Record<string, unknown>) => {
      array(record(evidence.bootstrapApis).names)[2] = "iam.googleapis.com";
    }],
    ["wrong API hash", (evidence: Record<string, unknown>) => {
      record(evidence.bootstrapApis).setSha256 = "0".repeat(64);
    }],
    ["duplicate API name", (evidence: Record<string, unknown>) => {
      array(record(evidence.bootstrapApis).names)[2] =
        array(record(evidence.bootstrapApis).names)[1];
    }],
    ["reordered API names", (evidence: Record<string, unknown>) => {
      array(record(evidence.bootstrapApis).names).reverse();
    }],
    ["reordered observations", (evidence: Record<string, unknown>) => {
      array(record(evidence.bootstrapApis).observations).reverse();
    }],
    ["missing observation", (evidence: Record<string, unknown>) => {
      array(record(evidence.bootstrapApis).observations).pop();
    }],
    ["unsupported observation", (evidence: Record<string, unknown>) => {
      record(array(record(evidence.bootstrapApis).observations)[0]).name =
        "run.googleapis.com";
    }],
  ])("rejects %s", (_name, mutate) => {
    const evidence = makeEvidence();
    mutate(evidence);

    expectInvalid(evidence);
  });

  it("evaluates archived evidence as stale without destroying historical validity", () => {
    const evidence = makeEvidence();
    record(evidence.collection).startedAt = "2026-07-27T10:59:00Z";
    record(evidence.collection).completedAt = "2026-07-27T11:00:00Z";
    record(evidence.review).reviewedAt = "2026-07-27T11:01:00Z";

    expect(evaluate(evidence).disposition).toBe("EVIDENCE_STALE_OR_UNTRUSTED");
  });

  it.each([
    ["future completion", "2026-07-27T12:02:00Z", "2026-07-27T12:02:01Z"],
    ["non-UTC completion", "2026-07-27T11:56:00+00:00", "2026-07-27T11:57:00Z"],
    ["invalid calendar date", "2026-02-30T11:56:00Z", "2026-07-27T11:57:00Z"],
  ])("rejects %s", (_name, completedAt, reviewedAt) => {
    const evidence = makeEvidence();
    record(evidence.collection).completedAt = completedAt;
    record(evidence.review).reviewedAt = reviewedAt;

    expectInvalid(evidence);
  });

  it("rejects completion before collection start", () => {
    const evidence = makeEvidence();
    record(evidence.collection).completedAt = "2026-07-27T11:54:59Z";
    record(evidence.review).reviewedAt = "2026-07-27T11:56:00Z";

    expectInvalid(evidence);
  });

  it("rejects review before collection completion", () => {
    const evidence = makeEvidence();
    record(evidence.review).reviewedAt = "2026-07-27T11:55:00Z";

    expectInvalid(evidence);
  });

  it("accepts review exactly at collection completion", () => {
    const evidence = makeEvidence();
    record(evidence.review).reviewedAt =
      record(evidence.collection).completedAt;

    expect(evaluate(evidence).disposition).toBe(
      "READY_FOR_STATE_BUCKET_PACKAGE",
    );
  });

  it("accepts review exactly at the maximum future allowance", () => {
    const evidence = makeEvidence();
    record(evidence.review).reviewedAt = new Date(
      NOW_MS + TB1_FUTURE_CLOCK_ALLOWANCE_SECONDS * 1_000,
    ).toISOString();

    expect(evaluate(evidence).disposition).toBe(
      "READY_FOR_STATE_BUCKET_PACKAGE",
    );
  });

  it.each([
    ["one millisecond beyond allowance", NOW_MS + 60_001],
    ["arbitrarily far future", NOW_MS + 365 * 24 * 60 * 60 * 1_000],
  ])("rejects review %s", (_name, reviewedAtMs) => {
    const evidence = makeEvidence();
    record(evidence.review).reviewedAt = new Date(reviewedAtMs).toISOString();

    expectInvalid(evidence);
  });

  it.each(unknownKeyMutations())("rejects an unknown key at %s", (_name, mutate) => {
    const evidence = makeEvidence();
    mutate(evidence);

    expectInvalid(evidence);
  });

  it("rejects duplicate raw JSON keys before materializing the object", () => {
    const raw = seal(makeEvidence()).replace(
      `"contractVersion":"${TB1_CONTRACT_VERSION}"`,
      `"contractVersion":"${TB1_CONTRACT_VERSION}","contractVersion":"${TB1_CONTRACT_VERSION}"`,
    );

    expect(parseAndEvaluateTb1Evidence(raw, NOW_MS)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it("rejects escape-equivalent duplicate raw JSON keys", () => {
    const raw = seal(makeEvidence()).replace(
      "\"projectId\":\"mira-refund-sbx\"",
      "\"projectId\":\"mira-refund-sbx\",\"project\\u0049d\":\"mira-refund-sbx\"",
    );

    expect(parseAndEvaluateTb1Evidence(raw, NOW_MS)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it.each([
    ["billing-account identifier", "billingAccounts/ABCDEF-123456"],
    ["access token", "ya29.synthetic-token"],
    ["bearer token", "Bearer synthetic-token"],
    ["credential path", "/Users/synthetic/.config/gcloud/configurations/config_default"],
    ["raw principal", "synthetic.operator@example.test"],
    ["database URL", "postgresql://synthetic@localhost/db"],
    ["secret", "client_secret=synthetic"],
    ["provider target", "https://api.tosspayments.com/v1/payments"],
    ["payment data", "paymentKey=synthetic"],
  ])("rejects %s leakage", (_name, leakedValue) => {
    const evidence = makeEvidence();
    record(array(evidence.sources)[0]).toolVersion = leakedValue;

    expectInvalid(evidence);
  });

  it.each([
    "apiMutationAuthorized",
    "stateAuthorityAuthorized",
    "denyAuthorityAuthorized",
    "foundationAuthorityAuthorized",
    "runtimeAuthorityAuthorized",
    "jobExecutionAuthorized",
    "providerContactAuthorized",
  ])("rejects prohibited downstream authority %s", (key) => {
    const evidence = makeEvidence();
    record(evidence.downstreamAuthority)[key] = true;

    expectInvalid(evidence);
  });

  it("enforces exact reviewer-absent and review-absent shapes", () => {
    const extraReviewer = makeAbsentReviewerEvidence();
    record(record(extraReviewer.operators).reviewer).principalClass = "USER";
    expectInvalid(extraReviewer);

    const extraReview = makeAbsentReviewerEvidence();
    record(extraReview.review).reviewedAt = "2026-07-27T11:56:00Z";
    expectInvalid(extraReview);
  });

  it("enforces exact reviewer-present and review-present shapes", () => {
    const missingIdentity = makeEvidence();
    delete record(record(missingIdentity.operators).reviewer).principalIdentifierSha256;
    expectInvalid(missingIdentity);

    const missingReviewedAt = makeEvidence();
    delete record(missingReviewedAt.review).reviewedAt;
    expectInvalid(missingReviewedAt);
  });

  it("emits RFC8785-compatible bytes for restricted golden vectors", () => {
    expect(canonicalizeTb1Restricted({
      z: true,
      a: [3, null, "é", "\u000f", false],
      nested: { beta: "β", alpha: "a" },
    })).toBe(
      "{\"a\":[3,null,\"é\",\"\\u000f\",false],\"nested\":{\"alpha\":\"a\",\"beta\":\"β\"},\"z\":true}",
    );
    expect(canonicalizeTb1Restricted({ "\u{1F600}": 1, "\uE000": 2 })).toBe(
      "{\"😀\":1,\"\":2}",
    );
  });

  it("omits only evidenceSha256 from the digest preimage", () => {
    const evidence = makeEvidence();
    record(evidence.integrity).evidenceSha256 = "a".repeat(64);
    const first = computeTb1EvidenceDigest(evidence);
    record(evidence.integrity).evidenceSha256 = "b".repeat(64);
    const second = computeTb1EvidenceDigest(evidence);
    record(evidence.integrity).algorithm = "SHA-512";
    const changed = computeTb1EvidenceDigest(evidence);

    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });

  it("rejects a malformed or unrecomputed evidence digest", () => {
    const malformed = makeEvidence();
    record(malformed.integrity).evidenceSha256 = "ABC";
    expectInvalidWithoutResealing(malformed);

    const changedEvidence: unknown = JSON.parse(seal(makeEvidence()));
    record(record(changedEvidence).billing).classification = "DISABLED";
    expect(parseAndEvaluateTb1Evidence(JSON.stringify(changedEvidence), NOW_MS)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it.each([
    ["fraction", 0.5],
    ["NaN", Number.NaN],
    ["positive Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["negative", -1],
    ["negative zero", -0],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["undefined", undefined],
    ["bigint", BigInt(1)],
    ["function", () => undefined],
    ["binary", new Uint8Array([1])],
    ["lone high surrogate", "\ud800"],
    ["lone low surrogate", "\udfff"],
  ])("rejects unsupported canonical value %s", (_name, value) => {
    expect(() => canonicalizeTb1Restricted(value)).toThrow(
      "TB1_CANONICALIZATION_REJECTED",
    );
  });

  it.each([
    ["fraction", "0.5"],
    ["negative zero", "-0"],
    ["unsafe integer", "9007199254740992"],
  ])("rejects unsupported raw JSON number %s", (_name, rawNumber) => {
    const raw = seal(makeEvidence()).replace(
      "\"maxAgeSeconds\":900",
      `"maxAgeSeconds":${rawNumber}`,
    );
    expect(parseAndEvaluateTb1Evidence(raw, NOW_MS)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it("rejects unsupported Unicode scalar sequences in raw JSON", () => {
    const raw = seal(makeEvidence()).replace("mira-refund-sbx", "mira-refund-\ud800");
    expect(parseAndEvaluateTb1Evidence(raw, NOW_MS)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it("rejects decoded sensitive material hidden behind JSON escapes", () => {
    const evidence = makeEvidence();
    record(array(evidence.sources)[0]).toolVersion = "ya29.synthetic-token";
    const raw = seal(evidence).replace("ya29.synthetic-token", "ya2\\u0039.synthetic-token");

    expect(parseAndEvaluateTb1Evidence(raw, NOW_MS)).toEqual({
      ok: false,
      reason: "EVIDENCE_INVALID",
    });
  });

  it("treats the JSON Schema boundary as structural prefilter only", () => {
    const accepted = makeEvidence();
    expect(tb1EvidencePassesStructuralSchemaPrefilter(accepted)).toBe(true);
    expect(evaluate(accepted).disposition).toBe("READY_FOR_STATE_BUCKET_PACKAGE");

    for (const semanticMutation of [
      (evidence: Record<string, unknown>) => {
        record(evidence.project).projectId = "mira-production-refund";
      },
      (evidence: Record<string, unknown>) => {
        record(array(record(evidence.bootstrapApis).observations)[0])
          .consumerProjectNumber = "987654321098";
      },
      (evidence: Record<string, unknown>) => {
        record(record(evidence.operators).reviewer).principalIdentifierSha256 =
          COLLECTOR_HASH;
      },
      (evidence: Record<string, unknown>) => {
        record(evidence.review).disposition = "BILLING_NOT_READY";
      },
    ]) {
      const evidence = makeEvidence();
      semanticMutation(evidence);
      expect(tb1EvidencePassesStructuralSchemaPrefilter(evidence)).toBe(true);
      expectInvalid(evidence);
    }
  });

  it("rejects structurally invalid project numbers before readiness evaluation", () => {
    const evidence = makeEvidence();
    record(evidence.project).projectNumber = "0";

    expect(tb1EvidencePassesStructuralSchemaPrefilter(evidence)).toBe(false);
    expectInvalid(evidence);
  });

  it("reconstructs and deeply freezes accepted evidence without caller aliases", () => {
    const caller = makeEvidence();
    const originalBilling = caller.billing;
    const originalNames = record(caller.bootstrapApis).names;
    const result = evaluate(caller);
    const canonical = result.canonicalEvidence;
    const digest = result.evidenceSha256;

    record(caller.billing).classification = "DISABLED";
    array(record(caller.bootstrapApis).names)[0] = "mutated.googleapis.com";
    expect(result.evidence.billing).not.toBe(originalBilling);
    expect(record(result.evidence.bootstrapApis).names).not.toBe(originalNames);
    expect(record(result.evidence.billing).classification).toBe("ENABLED_ACTIVE");
    expect(array(record(result.evidence.bootstrapApis).names)[0]).toBe(
      TB1_BOOTSTRAP_APIS[0],
    );

    expect(Reflect.set(
      record(result.evidence.downstreamAuthority),
      "apiMutationAuthorized",
      true,
    )).toBe(false);
    expect(Reflect.set(record(result.evidence.billing), "classification", "DISABLED"))
      .toBe(false);
    expect(Reflect.set(record(result.evidence.review), "disposition", "BILLING_NOT_READY"))
      .toBe(false);
    expect(Reflect.set(
      record(array(record(result.evidence.bootstrapApis).observations)[0]),
      "state",
      "DISABLED",
    )).toBe(false);
    expect(Reflect.set(array(record(result.evidence.bootstrapApis).names), "0", "changed"))
      .toBe(false);
    expect(result.canonicalEvidence).toBe(canonical);
    expect(result.evidenceSha256).toBe(digest);
    expect(computeTb1EvidenceDigest(result.evidence)).toBe(digest);
  });
});

describe("P3E-B2 TB1 hostile canonicalization boundary", () => {
  it("rejects an accessor-bearing array without invoking its getter", () => {
    const getter = vi.fn(() => "secret");
    const value: unknown[] = [];
    Object.defineProperty(value, "0", { enumerable: true, get: getter });
    Object.defineProperty(value, "length", { value: 1 });

    expect(() => canonicalizeTb1Restricted(value)).toThrow(
      "TB1_CANONICALIZATION_REJECTED",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    ["symbol", (value: unknown[]) => {
      Object.defineProperty(value, Symbol("extra"), { value: true });
    }],
    ["extra property", (value: unknown[]) => {
      Object.defineProperty(value, "extra", { value: true });
    }],
  ])("rejects an array with an own %s", (_name, mutate) => {
    const value = [1];
    mutate(value);
    expect(() => canonicalizeTb1Restricted(value)).toThrow(
      "TB1_CANONICALIZATION_REJECTED",
    );
  });

  it("rejects a sparse array", () => {
    const value = new Array<unknown>(2);
    value[1] = true;
    expect(() => canonicalizeTb1Restricted(value)).toThrow(
      "TB1_CANONICALIZATION_REJECTED",
    );
  });

  it("rejects an accessor-bearing object without invoking its getter", () => {
    const getter = vi.fn(() => "secret");
    const value = {};
    Object.defineProperty(value, "value", { enumerable: true, get: getter });
    expect(() => canonicalizeTb1Restricted(value)).toThrow(
      "TB1_CANONICALIZATION_REJECTED",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    ["object", cyclicObject()],
    ["array", cyclicArray()],
  ])("rejects a cyclic %s", (_name, value) => {
    expect(() => canonicalizeTb1Restricted(value)).toThrow(
      "TB1_CANONICALIZATION_REJECTED",
    );
  });

  it("admits the exact depth bound and rejects one level beyond it", () => {
    expect(() => canonicalizeTb1Restricted(
      nestedArrayValue(TB1_MAX_CANONICAL_DEPTH),
    )).not.toThrow();
    expect(() => canonicalizeTb1Restricted(
      nestedArrayValue(TB1_MAX_CANONICAL_DEPTH + 1),
    )).toThrow("TB1_CANONICALIZATION_REJECTED");
  });

  it("admits the exact node bound and rejects one node beyond it", () => {
    expect(() => canonicalizeTb1Restricted(
      Array.from({ length: TB1_MAX_CANONICAL_NODES - 1 }, () => null),
    )).not.toThrow();
    expect(() => canonicalizeTb1Restricted(
      Array.from({ length: TB1_MAX_CANONICAL_NODES }, () => null),
    )).toThrow("TB1_CANONICALIZATION_REJECTED");
  });

  it.each([
    ["one hundred million", 100_000_000],
    ["maximum JavaScript array length", 4_294_967_295],
    ["10,001", 10_001],
    ["10,000", 10_000],
  ])("rejects sparse length %s before attacker-sized work", (_name, length) => {
    const value = new Array<unknown>(length);
    expectCanonicalRejection(value);
  });

  it("rejects a huge sparse array even when it has one element", () => {
    const value = new Array<unknown>(100_000_000);
    value[0] = null;
    expectCanonicalRejection(value);
  });

  it("accounts for prior graph nodes before admitting nested array length", () => {
    const exactRemaining = {
      prefix: null,
      values: Array.from(
        { length: TB1_MAX_CANONICAL_NODES - 3 },
        () => null,
      ),
    };
    expect(() => canonicalizeTb1Restricted(exactRemaining)).not.toThrow();

    const oneBeyondRemaining = {
      prefix: null,
      values: Array.from(
        { length: TB1_MAX_CANONICAL_NODES - 2 },
        () => null,
      ),
    };
    expectCanonicalRejection(oneBeyondRemaining);
  });

  it("rejects a sparse array below the length limit", () => {
    const value = new Array<unknown>(8);
    value[7] = null;
    expectCanonicalRejection(value);
  });

  it("normalizes a hostile array-length proxy failure", () => {
    const secret = "ya29.array-length-getter-token";
    const lengthGetter = vi.fn(() => {
      throw new Error(secret);
    });
    const value = new Proxy([null], {
      get(target, property, receiver) {
        if (property === "length") return lengthGetter();
        const forwarded: unknown = Reflect.get(target, property, receiver);
        return forwarded;
      },
    });
    let observed: unknown;
    try {
      canonicalizeTb1Restricted(value);
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(Error);
    if (!(observed instanceof Error)) return;
    expect(observed.message).toBe("TB1_CANONICALIZATION_REJECTED");
    expect(observed.message).not.toContain(secret);
    expect(lengthGetter).toHaveBeenCalledTimes(1);
  });

  it("rejects a nonwritable-length sparse array without length-proportional allocation", () => {
    const value = new Array<unknown>(4);
    value[0] = null;
    Object.defineProperty(value, "length", { writable: false });
    expectCanonicalRejection(value);
  });

  it("contains no attacker-length expected-index allocation path", () => {
    const source = readFileSync(
      join(ROOT, "scripts/refund-p3e-b2-bootstrap-readiness.mts"),
      "utf8",
    );
    expect(source).not.toContain("Array.from({ length: value.length");
    expect(source).toContain(
      "length > remainingNodeCapacity",
    );
    expect(TB1_CANONICAL_ARRAY_WORK_BOUND).toBe(
      "LENGTH_REJECTED_BEFORE_LENGTH_PROPORTIONAL_WORK",
    );
  });

  it("preserves array order and independently freezes key and escape bytes", () => {
    expect(canonicalizeTb1Restricted([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalizeTb1Restricted({ z: "\n", a: "\"" })).toBe(
      "{\"a\":\"\\\"\",\"z\":\"\\n\"}",
    );
  });
});

describe("P3E-B2 TB1 read-only command boundary", () => {
  it("freezes the exact command inventory and explicit project binding", () => {
    expect(buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID)).toEqual([
      "projects", "describe", PROJECT_ID,
      "--format=json(projectId,projectNumber,lifecycleState)",
    ]);
    expect(buildTb1ReadOnlyCommand("BILLING_INFO_GET", PROJECT_ID)).toEqual([
      "beta", "billing", "projects", "describe", PROJECT_ID,
      "--format=json(projectId,billingEnabled)",
    ]);
    expect(buildTb1ReadOnlyCommand("BOOTSTRAP_SERVICES_LIST", PROJECT_ID)).toEqual([
      "services", "list", `--project=${PROJECT_ID}`, "--available",
      `--filter=config.name:(${TB1_BOOTSTRAP_APIS.join(" OR ")})`,
      "--format=json(config.name,state,parent)",
    ]);
    expect(buildTb1ReadOnlyCommand("GCLOUD_VERSION", PROJECT_ID)).toEqual([
      "version", "--format=json",
    ]);
    expect(buildTb1ReadOnlyCommand("COLLECTOR_IDENTITY", PROJECT_ID)).toEqual([
      "auth", "list", "--filter=status:ACTIVE", "--format=json(account)",
    ]);
    for (const kind of [
      "PROJECT_GET",
      "BILLING_INFO_GET",
      "BOOTSTRAP_SERVICES_LIST",
      "GCLOUD_VERSION",
      "COLLECTOR_IDENTITY",
    ] satisfies readonly Parameters<typeof buildTb1ReadOnlyCommand>[0][]) {
      expect(approvedTb1ReadOnlyCommand(
        buildTb1ReadOnlyCommand(kind, PROJECT_ID),
        PROJECT_ID,
      )).toBe(true);
    }
  });

  it.each([
    ["unknown", "UNKNOWN_COMMAND"],
    ["null", null],
    ["object", { kind: "COLLECTOR_IDENTITY" }],
  ])("rejects a forged %s command kind before executor invocation", async (_name, kind) => {
    const harness = commandHarness([
      { status: "SUCCESS", stdout: projectCommandJson(), stderr: "" },
    ]);
    const result: unknown = await Reflect.apply(
      executeTb1ReadOnlyCommand,
      undefined,
      [{
        kind,
        args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
        projectId: PROJECT_ID,
        cloudSdkConfigPath: "/tmp/tb1-gcloud",
        repositoryRoot: ROOT,
      }, harness.dependencies],
    );

    expect(result).toEqual({
      ok: false,
      reason: "COMMAND_FAILED",
      attemptCount: 0,
    });
    expect(harness.execute).not.toHaveBeenCalled();
    expect(() => {
      Reflect.apply(
        buildTb1ReadOnlyCommand,
        undefined,
        [kind, PROJECT_ID],
      );
    }).toThrow("TB1_COMMAND_KIND_REJECTED");
  });

  it.each([
    ["token error", new Error("ya29.synthetic-token")],
    ["principal error", new Error("synthetic.operator@example.test")],
    ["billing error", new Error("billingAccounts/000000-000000-000000")],
    [
      "credential error",
      new Error("/home/user/.config/gcloud/application_default_credentials.json"),
    ],
    ["database error", new Error("postgresql://user:password@host/db")],
  ])("normalizes synchronous executor rejection: %s", async (_name, rejection) => {
    const harness = executorFailureHarness("SYNC_THROW", rejection);
    const result = await executeTb1ReadOnlyCommand(
      projectCommandInput(),
      harness.dependencies,
    );

    expect(result).toEqual({
      ok: false,
      reason: "EXECUTOR_REJECTED",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain(rejection.message);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.wait).not.toHaveBeenCalled();
  });

  it.each([
    ["token error", new Error("ya29.synthetic-token")],
    ["principal error", new Error("synthetic.operator@example.test")],
    ["billing error", new Error("billingAccounts/000000-000000-000000")],
    [
      "credential error",
      new Error("/home/user/.config/gcloud/application_default_credentials.json"),
    ],
    ["database error", new Error("postgresql://user:password@host/db")],
  ])("normalizes asynchronous executor rejection: %s", async (_name, rejection) => {
    const harness = executorFailureHarness("ASYNC_REJECTION", rejection);
    const result = await executeTb1ReadOnlyCommand(
      projectCommandInput(),
      harness.dependencies,
    );

    expect(result).toEqual({
      ok: false,
      reason: "EXECUTOR_REJECTED",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain(rejection.message);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.wait).not.toHaveBeenCalled();
  });

  it.each([
    ["raw string", "ya29.raw-string-token"],
    ["plain object", { token: "ya29.object-token" }],
    ["non-Error primitive", 42],
    ["null", null],
  ])("normalizes executor rejection value: %s", async (_name, rejection) => {
    const harness = executorFailureHarness("ASYNC_REJECTION", rejection);
    const result = await executeTb1ReadOnlyCommand(
      projectCommandInput(),
      harness.dependencies,
    );

    expect(result).toEqual({
      ok: false,
      reason: "EXECUTOR_REJECTED",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).toBe(
      "{\"ok\":false,\"reason\":\"EXECUTOR_REJECTED\",\"attemptCount\":1}",
    );
    expect(harness.execute).toHaveBeenCalledTimes(1);
  });

  it("never observes hostile rejected-object properties", async () => {
    const propertyGetter = vi.fn(() => {
      throw new Error("ya29.hostile-getter-token");
    });
    const rejection = {};
    for (const key of ["message", "stack", "toString"]) {
      Object.defineProperty(rejection, key, { get: propertyGetter });
    }
    const harness = executorFailureHarness("ASYNC_REJECTION", rejection);

    expect(await executeTb1ReadOnlyCommand(
      projectCommandInput(),
      harness.dependencies,
    )).toEqual({
      ok: false,
      reason: "EXECUTOR_REJECTED",
      attemptCount: 1,
    });
    expect(propertyGetter).not.toHaveBeenCalled();
  });

  it("normalizes a hostile thenable executor rejection", async () => {
    const thenGetter = vi.fn(() => {
      throw new Error("ya29.hostile-thenable-token");
    });
    const hostileThenable = {};
    Object.defineProperty(hostileThenable, "then", { get: thenGetter });
    const harness = commandHarness([]);
    const dependencies = {
      ...harness.dependencies,
      execute: vi.fn(() => hostileThenable),
    };
    const result: unknown = await Reflect.apply(
      executeTb1ReadOnlyCommand,
      undefined,
      [projectCommandInput(), dependencies],
    );

    expect(result).toEqual({
      ok: false,
      reason: "EXECUTOR_REJECTED",
      attemptCount: 1,
    });
    expect(thenGetter).toHaveBeenCalledTimes(1);
    expect(dependencies.execute).toHaveBeenCalledTimes(1);
  });

  it.each(["SYNC_THROW", "ASYNC_REJECTION"] as const)(
    "normalizes %s from retry wait without another executor call",
    async (mode) => {
      const harness = commandHarness([
        { status: "TRANSIENT_429", stdout: "", stderr: "bounded" },
        { status: "SUCCESS", stdout: projectCommandJson(), stderr: "" },
      ]);
      const rejection = new Error("postgresql://retry:secret@host/db");
      harness.wait.mockImplementationOnce(() => {
        if (mode === "SYNC_THROW") throw rejection;
        return Promise.reject(rejection);
      });

      const result = await executeTb1ReadOnlyCommand(
        projectCommandInput(),
        harness.dependencies,
      );

      expect(result).toEqual({
        ok: false,
        reason: "RETRY_WAIT_REJECTED",
        attemptCount: 1,
      });
      expect(JSON.stringify(result)).not.toContain(rejection.message);
      expect(harness.execute).toHaveBeenCalledTimes(1);
      expect(harness.wait).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["SYNC_THROW", "ASYNC_REJECTION"] as const)(
    "normalizes %s from command-path canonicalization before executor invocation",
    async (mode) => {
      const harness = commandHarness([]);
      const rejection = new Error("billingAccounts/000000-000000-000000");
      const dependencies: Tb1CommandDependencies = {
        ...harness.dependencies,
        canonicalizePath: () => {
          if (mode === "SYNC_THROW") throw rejection;
          return Promise.reject(rejection);
        },
      };

      const result = await executeTb1ReadOnlyCommand(
        projectCommandInput(),
        dependencies,
      );

      expect(result).toEqual({
        ok: false,
        reason: "PATH_CANONICALIZATION_FAILED",
        attemptCount: 0,
      });
      expect(JSON.stringify(result)).not.toContain(rejection.message);
      expect(harness.execute).not.toHaveBeenCalled();
    },
  );

  it.each(["SYNC_THROW", "ASYNC_REJECTION"] as const)(
    "normalizes %s from advisory path canonicalization",
    async (mode) => {
      const rejection = new Error("/home/user/.config/gcloud/credentials.db");
      const canonicalize = () => {
        if (mode === "SYNC_THROW") throw rejection;
        return Promise.reject<string>(rejection);
      };

      const result = await preflightRejectRepositoryContainedOutputPath(
        "/tmp/tb1-evidence.json",
        ROOT,
        canonicalize,
      );

      expect(result).toEqual({
        reject: true,
        reason: "PATH_PREFLIGHT_CANONICALIZATION_FAILED",
      });
      expect(JSON.stringify(result)).not.toContain(rejection.message);
    },
  );

  it("does not log or expose a rejected collector principal", async () => {
    const principal = "synthetic.operator@example.test";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const harness = executorFailureHarness(
        "ASYNC_REJECTION",
        new Error(principal),
      );
      const result = await executeTb1ReadOnlyCommand(
        commandInput("COLLECTOR_IDENTITY"),
        harness.dependencies,
      );

      expect(result).toEqual({
        ok: false,
        reason: "EXECUTOR_REJECTED",
        attemptCount: 1,
      });
      expect(JSON.stringify(result)).not.toContain(principal);
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("returns an exact sanitized billing result without account identity", async () => {
    const raw = JSON.stringify({
      projectId: PROJECT_ID,
      billingEnabled: true,
    });
    const result = await successfulCommand("BILLING_INFO_GET", raw);

    expect(result).toEqual({
      ok: true,
      kind: "BILLING_INFO_GET",
      projectId: PROJECT_ID,
      billingEnabled: true,
      responseSha256: sha256Text(raw),
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /billingAccount|stdout|stderr/iu,
    );
  });

  it("rejects and never exposes a billing-account identifier", async () => {
    const secret = "billingAccounts/ABCDEF-123456";
    const raw = JSON.stringify({
      projectId: PROJECT_ID,
      billingEnabled: true,
      billingAccountName: secret,
    });
    const result = await successfulCommand("BILLING_INFO_GET", raw);

    expect(result).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("returns exactly three sanitized ordered service observations", async () => {
    const raw = servicesCommandJson();
    const result = await successfulCommand("BOOTSTRAP_SERVICES_LIST", raw);

    expect(result).toEqual({
      ok: true,
      kind: "BOOTSTRAP_SERVICES_LIST",
      observations: TB1_BOOTSTRAP_APIS.map((name) => ({
        name,
        state: "ENABLED",
        consumerProjectNumber: PROJECT_NUMBER,
      })),
      responseSha256: sha256Text(raw),
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(/stdout|stderr/iu);
  });

  it.each([
    ["missing", (values: unknown[]) => values.pop()],
    ["duplicate", (values: unknown[]) => {
      values[2] = values[1];
    }],
    ["reordered", (values: unknown[]) => values.reverse()],
    ["crossed project", (values: unknown[]) => {
      record(values[2]).parent =
        `projects/987654321098/services/${TB1_BOOTSTRAP_APIS[2]}`;
    }],
    ["extra", (values: unknown[]) => values.push(values[0])],
  ])("rejects %s service output", async (_name, mutate) => {
    const values: unknown = JSON.parse(servicesCommandJson());
    const services = array(values);
    mutate(services);
    const result = await successfulCommand(
      "BOOTSTRAP_SERVICES_LIST",
      JSON.stringify(services),
    );

    expect(result).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
  });

  it("returns one bounded sanitized gcloud version", async () => {
    const raw = JSON.stringify({ "Google Cloud SDK": "531.0.0" });
    const result = await successfulCommand("GCLOUD_VERSION", raw);

    expect(result).toEqual({
      ok: true,
      kind: "GCLOUD_VERSION",
      version: "531.0.0",
      responseSha256: sha256Text(raw),
      attemptCount: 1,
    });
  });

  it("hashes and discards the exact collector account", async () => {
    const principal = "synthetic.operator@example.test";
    const raw = JSON.stringify([{ account: principal }]);
    const result = await successfulCommand("COLLECTOR_IDENTITY", raw);

    expect(result).toEqual({
      ok: true,
      kind: "COLLECTOR_IDENTITY",
      principalClass: "USER",
      principalIdentifierSha256: sha256Text(principal),
      responseSha256: sha256Text(raw),
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain(principal);
    expect(JSON.stringify(result)).not.toMatch(/stdout|stderr|account/iu);
  });

  it.each([
    ["multiple identities", JSON.stringify([
      { account: "first@example.test" },
      { account: "second@example.test" },
    ])],
    ["identity extra key", JSON.stringify([
      { account: "first@example.test", status: "ACTIVE" },
    ])],
    ["malformed identity", JSON.stringify([{ account: "not-an-account" }])],
  ])("rejects %s without raw principal exposure", async (_name, raw) => {
    const result = await successfulCommand("COLLECTOR_IDENTITY", raw);
    expect(result).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain(raw);
  });

  it.each([
    ["access token", "ya29.synthetic-token", "ya2\\u0039.synthetic-token"],
    [
      "credential path",
      "/Users/synthetic/.config/gcloud/config_default",
      "/Use\\u0072s/synthetic/.config/gcloud/config_default",
    ],
    [
      "database URL",
      "postgresql://synthetic@localhost/db",
      "postg\\u0072esql://synthetic@localhost/db",
    ],
    [
      "provider target",
      "https://api.tosspayments.com/v1/payments",
      "https://api.toss\\u0070ayments.com/v1/payments",
    ],
    ["payment value", "paymentKey=synthetic", "payment\\u004bey=synthetic"],
    [
      "raw principal",
      "synthetic.operator@example.test",
      "synthetic.operator\\u0040example.test",
    ],
  ])("rejects decoded escaped %s in non-identity output", async (
    _name,
    leaked,
    escaped,
  ) => {
    const raw = `{"Google Cloud SDK":"${escaped}"}`;
    const result = await successfulCommand("GCLOUD_VERSION", raw);

    expect(result).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain(leaked);
  });

  it("rejects duplicate command JSON keys before last-write-wins parsing", async () => {
    const raw =
      `{"projectId":"${PROJECT_ID}","projectId":"${PROJECT_ID}",`
      + `"projectNumber":"${PROJECT_NUMBER}","lifecycleState":"ACTIVE"}`;
    expect(await successfulCommand("PROJECT_GET", raw)).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
  });

  it("rejects malformed UTF-8 with a static bounded result", async () => {
    const harness = commandHarness([{
      status: "SUCCESS",
      stdout: new Uint8Array([0xc3, 0x28]),
      stderr: "",
    }]);
    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-gcloud",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({
      ok: false,
      reason: "MALFORMED_OUTPUT",
      attemptCount: 1,
    });
  });

  it.each([
    ["API enable", ["services", "enable", "storage.googleapis.com", `--project=${PROJECT_ID}`]],
    ["API disable", ["services", "disable", "storage.googleapis.com", `--project=${PROJECT_ID}`]],
    ["auth login", ["auth", "login"]],
    ["credential activation", ["auth", "activate-service-account"]],
    ["project selection", ["config", "set", "project", PROJECT_ID]],
    ["Terraform", ["terraform", "apply"]],
    ["Job run", ["run", "jobs", "execute", "refund-worker"]],
    ["implicit project", ["projects", "describe"]],
  ])("rejects %s before the executor can run", async (_name, args) => {
    const harness = commandHarness([{ status: "SUCCESS", stdout: "{}", stderr: "" }]);

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args,
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-gcloud",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({ ok: false, reason: "COMMAND_FAILED", attemptCount: 0 });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("returns an exact sanitized project result and passes only explicit config", async () => {
    const rawProject = projectCommandJson();
    const harness = commandHarness([
      { status: "SUCCESS", stdout: rawProject, stderr: "" },
    ]);
    const args = buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID);

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args,
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-gcloud",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({
      ok: true,
      kind: "PROJECT_GET",
      projectId: PROJECT_ID,
      projectNumber: PROJECT_NUMBER,
      lifecycleState: "ACTIVE",
      responseSha256: sha256Text(rawProject),
      attemptCount: 1,
    });
    expect(result).not.toHaveProperty("capturedStdout");
    expect(result).not.toHaveProperty("capturedStderr");
    expect(JSON.stringify(result)).not.toContain(rawProject);
    expect(harness.execute).toHaveBeenCalledWith({
      executable: "gcloud",
      args,
      env: { CLOUDSDK_CONFIG: "/tmp/tb1-gcloud" },
      timeoutMs: TB1_COMMAND_TIMEOUT_MS,
    });
    expect(Object.keys(record(harness.execute.mock.calls[0]?.[0]?.env))).toEqual([
      "CLOUDSDK_CONFIG",
    ]);
  });

  it("rejects a Cloud SDK configuration resolving inside the repository", async () => {
    const harness = commandHarness([{ status: "SUCCESS", stdout: "{}", stderr: "" }]);

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
      projectId: PROJECT_ID,
      cloudSdkConfigPath: join(ROOT, ".gcloud"),
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({ ok: false, reason: "COMMAND_FAILED", attemptCount: 0 });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("rejects an external-looking symlink resolved into the repository", async () => {
    const harness = commandHarness([{ status: "SUCCESS", stdout: "{}", stderr: "" }], {
      "/tmp/tb1-link": join(ROOT, ".gcloud"),
    });

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-link",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({ ok: false, reason: "COMMAND_FAILED", attemptCount: 0 });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("classifies repository containment only as an advisory rejection", async () => {
    const identity = (path: string) => Promise.resolve(path);
    expect(await preflightRejectRepositoryContainedOutputPath(
      "/tmp/tb1-evidence.json",
      ROOT,
      identity,
    )).toEqual({
      reject: false,
      status: "ADVISORY_EXTERNAL_CANDIDATE_NOT_WRITE_AUTHORIZATION",
    });
    expect(await preflightRejectRepositoryContainedOutputPath(
      ROOT,
      ROOT,
      identity,
    )).toEqual({
      reject: true,
      reason: "PATH_PREFLIGHT_REPOSITORY_CONTAINED_OR_INVALID",
    });
    expect(await preflightRejectRepositoryContainedOutputPath(
      join(ROOT, "tb1-evidence.json"),
      ROOT,
      identity,
    )).toEqual({
      reject: true,
      reason: "PATH_PREFLIGHT_REPOSITORY_CONTAINED_OR_INVALID",
    });
    expect(await preflightRejectRepositoryContainedOutputPath(
      "tb1-evidence.json",
      ROOT,
      identity,
    )).toEqual({
      reject: true,
      reason: "PATH_PREFLIGHT_REPOSITORY_CONTAINED_OR_INVALID",
    });
    expect(await preflightRejectRepositoryContainedOutputPath(
      join(ROOT, "..", "tb1-evidence.json"),
      ROOT,
      identity,
    )).toEqual({
      reject: false,
      status: "ADVISORY_EXTERNAL_CANDIDATE_NOT_WRITE_AUTHORIZATION",
    });
    expect(await preflightRejectRepositoryContainedOutputPath(
      "/tmp/tb1-link",
      ROOT,
      (path) => Promise.resolve(
        path === "/tmp/tb1-link" ? join(ROOT, "evidence.json") : path,
      ),
    )).toEqual({
      reject: true,
      reason: "PATH_PREFLIGHT_REPOSITORY_CONTAINED_OR_INVALID",
    });
    expect(TB1_EVIDENCE_WRITER).toBe("DEFERRED");
    expect(TB1_OUTPUT_PATH_CHECK).toBe(
      "ADVISORY_PREFLIGHT_ONLY_NOT_A_WRITE_SAFETY_BOUNDARY",
    );
  });

  it("retries only bounded transient read failures", async () => {
    const harness = commandHarness([
      { status: "TRANSIENT_429", stdout: "", stderr: "bounded" },
      { status: "TRANSIENT_5XX", stdout: "", stderr: "bounded" },
      { status: "SUCCESS", stdout: projectCommandJson(), stderr: "" },
    ]);

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-gcloud",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({
      ok: true,
      kind: "PROJECT_GET",
      projectId: PROJECT_ID,
      projectNumber: PROJECT_NUMBER,
      lifecycleState: "ACTIVE",
      responseSha256: sha256Text(projectCommandJson()),
      attemptCount: 3,
    });
    expect(harness.execute).toHaveBeenCalledTimes(3);
    expect(harness.wait).toHaveBeenNthCalledWith(1, 250);
    expect(harness.wait).toHaveBeenNthCalledWith(2, 1_000);
  });

  it.each(nonretryCases())("does not retry %s", async (status, reason) => {
    const harness = commandHarness([
      { status, stdout: "", stderr: "bounded" },
      { status: "SUCCESS", stdout: "{}", stderr: "" },
    ]);

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-gcloud",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({ ok: false, reason, attemptCount: 1 });
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.wait).not.toHaveBeenCalled();
  });

  it("stops after the exact retry limit", async () => {
    const attempts: FakeCommandAttempt[] = Array.from(
      { length: TB1_MAX_READ_ATTEMPTS },
      () => ({ status: "TRANSIENT_5XX", stdout: "", stderr: "bounded" }),
    );
    const harness = commandHarness(attempts);

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-gcloud",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({
      ok: false,
      reason: "RETRY_EXHAUSTED",
      attemptCount: TB1_MAX_READ_ATTEMPTS,
    });
    expect(harness.execute).toHaveBeenCalledTimes(TB1_MAX_READ_ATTEMPTS);
  });

  it.each(oversizedAttempts())(
    "rejects oversized %s without retry or raw output",
    async (_name, attempt) => {
    const harness = commandHarness([
      attempt,
      { status: "SUCCESS", stdout: "{}", stderr: "" },
    ]);

    const result = await executeTb1ReadOnlyCommand({
      kind: "PROJECT_GET",
      args: buildTb1ReadOnlyCommand("PROJECT_GET", PROJECT_ID),
      projectId: PROJECT_ID,
      cloudSdkConfigPath: "/tmp/tb1-gcloud",
      repositoryRoot: ROOT,
    }, harness.dependencies);

    expect(result).toEqual({
      ok: false,
      reason: "OUTPUT_LIMIT_EXCEEDED",
      attemptCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("x".repeat(32));
    expect(harness.execute).toHaveBeenCalledTimes(1);
    },
  );
});

describe("P3E-B2 TB1 repository policy", () => {
  it("freezes the machine contract, schema, API hash, and absent authorities", () => {
    expect(contract.contractVersion).toBe(TB1_CONTRACT_VERSION);
    expect(contract.packageId).toBe("P3E-B2-TB1");
    expect(contract.principalIdentifierSha256).toBe(TB1_PRINCIPAL_FINGERPRINT_TRUTH);
    expect(contract.bootstrapApis.names).toEqual(TB1_BOOTSTRAP_APIS);
    expect(contract.bootstrapApis.setSha256).toBe(TB1_BOOTSTRAP_API_SET_SHA256);
    expect(contract.dispositions).toEqual(TB1_DISPOSITIONS);
    expect(contract.readOnlySources).toEqual(TB1_APPROVED_SOURCE_APIS);
    expect(contract.commandBoundary.realSubprocessAdapterIncluded).toBe(false);
    expect(contract.commandBoundary).toMatchObject({
      publicResult: "SANITIZED_COMMAND_SPECIFIC_DISCRIMINATED_UNION_ONLY",
      rawStdoutReturned: false,
      rawStderrReturned: false,
      rawPrincipalIdentifierReturned: false,
    });
    expect(contract.commandBoundary.nonretryableClasses).toEqual(
      expect.arrayContaining([
        "EXECUTOR_REJECTED",
        "RETRY_WAIT_REJECTED",
        "PATH_CANONICALIZATION_FAILED",
      ]),
    );
    expect(contract.jsonSchema.role).toBe(TB1_JSON_SCHEMA_ROLE);
    expect(contract.evidence).toMatchObject({
      maxCanonicalDepth: TB1_MAX_CANONICAL_DEPTH,
      maxCanonicalNodes: TB1_MAX_CANONICAL_NODES,
    });
    expect(contract.evidenceWriter).toEqual({
      status: TB1_EVIDENCE_WRITER,
      outputPathCheck: TB1_OUTPUT_PATH_CHECK,
    });
    expect(contract.failureAndWorkBounds).toEqual({
      injectedDependencyFailures: TB1_INJECTED_DEPENDENCY_FAILURES,
      canonicalArrayWorkBound: TB1_CANONICAL_ARRAY_WORK_BOUND,
    });
    expect(Object.values(contract.authority)).toEqual([
      "NONE", "NONE", "NONE", "NONE", "NONE", "NONE",
    ]);
    expect(Object.values(contract.downstream).filter((value) => value === "ABSENT"))
      .toHaveLength(7);

    expect(schema.additionalProperties).toBe(false);
    expect(schema.$comment).toBe(
      "TB1_JSON_SCHEMA_ROLE: STRUCTURAL_PREFILTER_ONLY_NOT_READINESS_AUTHORITY",
    );
    expect(schema.description).toContain("Structural prefilter only");
    expect(schema.properties.contractVersion.const).toBe(TB1_CONTRACT_VERSION);
    expect(schema.properties.integrity.$ref).toBe("#/$defs/integrity");
    expect(schema.$defs.downstreamAuthority.additionalProperties).toBe(false);
  });

  it("documents the exact no-authority and fingerprint truth statements", () => {
    const document = readFileSync(
      join(ROOT, "docs/payment_policy/refund_worker_p3e_b2_trusted_project_bootstrap_readiness_v1.md"),
      "utf8",
    );
    for (const statement of [
      "TB1_CLOUD_MUTATION: NONE",
      "TB1_CLOUD_OBSERVATION_DURING_IMPLEMENTATION: NONE",
      "TB1_RUNTIME_AUTHORITY: NONE",
      "TB1_JOB_EXECUTION_AUTHORITY: NONE",
      "TB1_PROVIDER_CONTACT_AUTHORITY: NONE",
      "TB1_JSON_SCHEMA_ROLE: STRUCTURAL_PREFILTER_ONLY_NOT_READINESS_AUTHORITY",
      "TB1_EVIDENCE_WRITER: DEFERRED",
      "TB1_OUTPUT_PATH_CHECK: ADVISORY_PREFLIGHT_ONLY_NOT_A_WRITE_SAFETY_BOUNDARY",
      "TB1_INJECTED_DEPENDENCY_FAILURES: STATIC_BOUNDED_NO_RAW_CAUSE_PROPAGATION",
      "TB1_CANONICAL_ARRAY_WORK_BOUND: LENGTH_REJECTED_BEFORE_LENGTH_PROPORTIONAL_WORK",
      "CORRELATION_FINGERPRINT_NOT_ANONYMIZATION",
    ]) {
      expect(document).toContain(statement);
    }
  });

  it("contains no real subprocess, network, authentication, or mutation adapter", () => {
    const source = readFileSync(
      join(ROOT, "scripts/refund-p3e-b2-bootstrap-readiness.mts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /node:child_process|node:https|node:http|fetch\(|spawn\(|execFile\(|auth login|services enable|services disable/u,
    );
    expect(source).not.toContain("GOOGLE_APPLICATION_CREDENTIALS:");
    expect(source).not.toContain("capturedStdout");
    expect(source).not.toContain("capturedStderr");
    expect(source).toContain("containsSensitiveDecodedValue(sanitized)");
  });
});

function makeEvidence(): Record<string, unknown> {
  return {
    contractVersion: TB1_CONTRACT_VERSION,
    evidenceScope: "PROJECT_BOOTSTRAP_READINESS",
    project: {
      projectId: PROJECT_ID,
      projectNumber: PROJECT_NUMBER,
      lifecycleState: "ACTIVE",
      bindingSource: "cloudresourcemanager.googleapis.com/v3/projects.get",
      bindingResponseSha256: "6".repeat(64),
    },
    billing: {
      classification: "ENABLED_ACTIVE",
      accountIdentifierRetained: false,
      observationSource: "cloudbilling.googleapis.com/v1/projects.getBillingInfo",
    },
    operators: {
      collector: {
        principalClass: "USER",
        principalIdentifierSha256: COLLECTOR_HASH,
      },
      reviewer: {
        status: "PRESENT",
        principalClass: "USER",
        principalIdentifierSha256: REVIEWER_HASH,
      },
    },
    bootstrapApis: {
      names: [...TB1_BOOTSTRAP_APIS],
      setSha256: TB1_BOOTSTRAP_API_SET_SHA256,
      observations: TB1_BOOTSTRAP_APIS.map((name) => ({
        name,
        state: "ENABLED",
        consumerProjectNumber: PROJECT_NUMBER,
      })),
    },
    collection: {
      startedAt: "2026-07-27T11:55:00Z",
      completedAt: "2026-07-27T11:55:30Z",
      maxAgeSeconds: 900,
    },
    sources: TB1_APPROVED_SOURCE_APIS.map((api, index) => ({
      tool: "gcloud",
      toolVersion: "531.0.0",
      api,
      responseSha256: RESPONSE_HASHES[index],
    })),
    downstreamAuthority: allAuthorityFalse(),
    review: {
      disposition: "READY_FOR_STATE_BUCKET_PACKAGE",
      reviewedAt: "2026-07-27T11:56:00Z",
    },
    integrity: {
      canonicalization: TB1_CANONICALIZATION,
      algorithm: "SHA-256",
      evidenceSha256: "0".repeat(64),
    },
  };
}

function makeAbsentReviewerEvidence(): Record<string, unknown> {
  const evidence = makeEvidence();
  record(evidence.operators).reviewer = { status: "ABSENT" };
  evidence.review = { disposition: "INDEPENDENT_REVIEW_REQUIRED" };
  return evidence;
}

function allAuthorityFalse(): Record<string, unknown> {
  return {
    apiMutationAuthorized: false,
    stateAuthorityAuthorized: false,
    denyAuthorityAuthorized: false,
    foundationAuthorityAuthorized: false,
    runtimeAuthorityAuthorized: false,
    jobExecutionAuthorized: false,
    providerContactAuthorized: false,
  };
}

function evaluate(evidence: Record<string, unknown>) {
  const result = parseAndEvaluateTb1Evidence(seal(evidence), NOW_MS);
  if (!result.ok) throw new Error("Expected valid TB1 evidence.");
  return result;
}

function expectInvalid(evidence: Record<string, unknown>): void {
  const raw = sealIfPossible(evidence);
  expect(parseAndEvaluateTb1Evidence(raw, NOW_MS)).toEqual({
    ok: false,
    reason: "EVIDENCE_INVALID",
  });
}

function expectInvalidWithoutResealing(evidence: Record<string, unknown>): void {
  expect(parseAndEvaluateTb1Evidence(JSON.stringify(evidence), NOW_MS)).toEqual({
    ok: false,
    reason: "EVIDENCE_INVALID",
  });
}

function sealIfPossible(evidence: Record<string, unknown>): string {
  try {
    return seal(evidence);
  } catch {
    return JSON.stringify(evidence);
  }
}

function seal(evidence: Record<string, unknown>): string {
  record(evidence.integrity).evidenceSha256 = "0".repeat(64);
  record(evidence.integrity).evidenceSha256 = computeTb1EvidenceDigest(evidence);
  return JSON.stringify(evidence);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected test record.");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected test array.");
  return value;
}

function unknownKeyMutations(): readonly Readonly<[
  string,
  (evidence: Record<string, unknown>) => void,
]>[] {
  return [
    ["outer", (evidence) => { evidence.extra = false; }],
    ["project", (evidence) => { record(evidence.project).extra = false; }],
    ["billing", (evidence) => { record(evidence.billing).extra = false; }],
    ["operators", (evidence) => { record(evidence.operators).extra = false; }],
    ["collector", (evidence) => {
      record(record(evidence.operators).collector).extra = false;
    }],
    ["reviewer", (evidence) => {
      record(record(evidence.operators).reviewer).extra = false;
    }],
    ["bootstrapApis", (evidence) => { record(evidence.bootstrapApis).extra = false; }],
    ["observation", (evidence) => {
      record(array(record(evidence.bootstrapApis).observations)[0]).extra = false;
    }],
    ["collection", (evidence) => { record(evidence.collection).extra = false; }],
    ["source", (evidence) => { record(array(evidence.sources)[0]).extra = false; }],
    ["downstreamAuthority", (evidence) => {
      record(evidence.downstreamAuthority).extra = false;
    }],
    ["review", (evidence) => { record(evidence.review).extra = false; }],
    ["integrity", (evidence) => { record(evidence.integrity).extra = false; }],
  ];
}

function commandHarness(
  attempts: readonly FakeCommandAttempt[],
  canonicalOverrides: Readonly<Record<string, string>> = {},
) {
  let attemptIndex = 0;
  const execute = vi.fn((
    _request: Tb1CommandExecutionRequest,
  ): Promise<Tb1CommandAttemptResult> => {
    const fakeAttempt = attempts[attemptIndex] ?? attempts.at(-1);
    attemptIndex += 1;
    const attempt = fakeAttempt
      ? {
        status: fakeAttempt.status,
        stdout: utf8Bytes(fakeAttempt.stdout),
        stderr: utf8Bytes(fakeAttempt.stderr),
      }
      : null;
    return attempt
      ? Promise.resolve(attempt)
      : Promise.reject(new Error("Missing fake attempt."));
  });
  const wait = vi.fn(() => Promise.resolve());
  const dependencies: Tb1CommandDependencies = {
    canonicalizePath: (path) => Promise.resolve(canonicalOverrides[path] ?? path),
    execute,
    wait,
  };
  return { dependencies, execute, wait };
}

function executorFailureHarness(
  mode: "SYNC_THROW" | "ASYNC_REJECTION",
  rejection: unknown,
) {
  const execute = vi.fn((
    _request: Tb1CommandExecutionRequest,
  ): Promise<Tb1CommandAttemptResult> => {
    if (mode === "SYNC_THROW") throw rejection;
    return rejectWithUnknown(rejection);
  });
  const wait = vi.fn(() => Promise.resolve());
  const dependencies: Tb1CommandDependencies = {
    canonicalizePath: (path) => Promise.resolve(path),
    execute,
    wait,
  };
  return { dependencies, execute, wait };
}

function rejectWithUnknown(reason: unknown): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    Reflect.apply(reject, undefined, [reason]);
  });
}

type FakeCommandAttempt = Readonly<{
  status: Tb1CommandAttemptStatus;
  stdout: string | Uint8Array;
  stderr: string | Uint8Array;
}>;

function utf8Bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

async function successfulCommand(
  kind: Parameters<typeof buildTb1ReadOnlyCommand>[0],
  stdout: string,
) {
  const harness = commandHarness([{ status: "SUCCESS", stdout, stderr: "" }]);
  const result = await executeTb1ReadOnlyCommand({
    kind,
    args: buildTb1ReadOnlyCommand(kind, PROJECT_ID),
    projectId: PROJECT_ID,
    cloudSdkConfigPath: "/tmp/tb1-gcloud",
    repositoryRoot: ROOT,
  }, harness.dependencies);
  expect(harness.execute).toHaveBeenCalledTimes(1);
  return result;
}

function commandInput(
  kind: Parameters<typeof buildTb1ReadOnlyCommand>[0],
) {
  return {
    kind,
    args: buildTb1ReadOnlyCommand(kind, PROJECT_ID),
    projectId: PROJECT_ID,
    cloudSdkConfigPath: "/tmp/tb1-gcloud",
    repositoryRoot: ROOT,
  };
}

function projectCommandInput() {
  return commandInput("PROJECT_GET");
}

function projectCommandJson(): string {
  return JSON.stringify({
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    lifecycleState: "ACTIVE",
  });
}

function servicesCommandJson(): string {
  return JSON.stringify(TB1_BOOTSTRAP_APIS.map((name) => ({
    config: { name },
    state: "ENABLED",
    parent: `projects/${PROJECT_NUMBER}/services/${name}`,
  })));
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nonretryCases(): readonly Readonly<[
  Tb1CommandAttemptStatus,
  Tb1CommandFailure,
]>[] {
  return [
    ["AUTHENTICATION_FAILED", "AUTHENTICATION_FAILED"],
    ["AUTHORIZATION_FAILED", "AUTHORIZATION_FAILED"],
    ["NOT_FOUND", "NOT_FOUND"],
    ["PROJECT_MISMATCH", "PROJECT_MISMATCH"],
    ["MALFORMED_OUTPUT", "MALFORMED_OUTPUT"],
    ["COMMAND_FAILED", "COMMAND_FAILED"],
  ];
}

function oversizedAttempts(): readonly Readonly<[
  string,
  FakeCommandAttempt,
]>[] {
  return [
    ["stdout", { status: "SUCCESS", stdout: "x".repeat(65_537), stderr: "" }],
    ["stderr", { status: "COMMAND_FAILED", stdout: "", stderr: "x".repeat(4_097) }],
  ];
}

function cyclicObject(): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  value.self = value;
  return value;
}

function cyclicArray(): unknown[] {
  const value: unknown[] = [];
  value.push(value);
  return value;
}

function nestedArrayValue(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) value = [value];
  return value;
}

function expectCanonicalRejection(value: unknown): void {
  let observed: unknown;
  try {
    canonicalizeTb1Restricted(value);
  } catch (error) {
    observed = error;
  }
  expect(observed).toBeInstanceOf(Error);
  if (!(observed instanceof Error)) return;
  expect(observed).not.toBeInstanceOf(RangeError);
  expect(observed.message).toBe("TB1_CANONICALIZATION_REJECTED");
}
