import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assembleTb2aReviewerAbsentEvidence,
  buildTb2aReadOnlyCommand,
  canonicalizeTb1Restricted,
  computeTb2aEvidenceDigest,
  parseTb2aCommandOutput,
  TB1_CONTRACT_VERSION,
  TB2A_COMMAND_KINDS,
  TB2A_EVIDENCE_VERSION,
  TB2A_INTRINSIC_VALIDATION_TRUTH,
  validateTb2aIntrinsicEvidence,
  type Tb2aCommandKind,
  type Tb2aCommandReceipt,
  type Tb2aCommandResult,
  type Tb2aIntrinsicEvidenceValidationResult,
} from "../../../../../scripts/refund-p3e-b2-bootstrap-readiness.mjs";

const ROOT = process.cwd();
const PROJECT_ID = "mira-refund-sbx";
const PROJECT_NUMBER = "123456789012";
const CONFIGURATION = "intrinsic-validation";
const REPOSITORY_COMMIT = "775d01f66963399798ea001623940ebc979da929";
const NONCE = "intrinsic_nonce_0001";
const LOW_ENTROPY_NONCE = "0000000000000000";
const NOW_MS = Date.parse("2026-07-27T12:00:00.000Z");
const TARGETS = Object.freeze([
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "storage.googleapis.com",
]);

describe("P3E-B2 evidence-v2 intrinsic validation success", () => {
  it("accepts exact canonical v2 bytes", () => {
    expect(validateTb2aIntrinsicEvidence(
      new TextEncoder().encode(canonicalEvidence()),
    )).toEqual({ ok: true });
  });

  it("accepts the exact canonical v2 string", () => {
    expect(validateTb2aIntrinsicEvidence(canonicalEvidence())).toEqual({
      ok: true,
    });
  });

  it("accepts a structurally valid low-entropy nonce without a uniqueness claim", () => {
    const result = validateTb2aIntrinsicEvidence(
      canonicalEvidence({ nonce: LOW_ENTROPY_NONCE }),
    );

    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain(LOW_ENTROPY_NONCE);
    expect(JSON.stringify(result)).not.toMatch(/unique|entropy|replay/iu);
  });
});

describe("P3E-B2 evidence-v2 intrinsic input admission and version", () => {
  it("classifies v1 bytes as VERSION_MISMATCH", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      contractVersion: TB1_CONTRACT_VERSION,
    }));

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "VERSION_MISMATCH",
    });
  });

  it("classifies malformed JSON and unsupported runtime values as STRUCTURE_INVALID", () => {
    expect(validateTb2aIntrinsicEvidence("{")).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
    for (const value of [null, 1, {}, []]) {
      expect(Reflect.apply(
        validateTb2aIntrinsicEvidence,
        undefined,
        [value],
      )).toEqual({ ok: false, reason: "STRUCTURE_INVALID" });
    }
  });

  it("rejects duplicate JSON keys through the byte boundary", () => {
    const raw = new TextEncoder().encode(
      `{"contractVersion":"${TB2A_EVIDENCE_VERSION}",`
      + `"contractVersion":"${TB2A_EVIDENCE_VERSION}"}`,
    );

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("rejects BOM-prefixed bytes", () => {
    const evidence = new TextEncoder().encode(canonicalEvidence());
    const raw = new Uint8Array(evidence.byteLength + 3);
    raw.set([0xef, 0xbb, 0xbf]);
    raw.set(evidence, 3);

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("rejects a BOM-prefixed string", () => {
    expect(validateTb2aIntrinsicEvidence(
      `\uFEFF${canonicalEvidence()}`,
    )).toEqual({ ok: false, reason: "STRUCTURE_INVALID" });
  });

  it("rejects invalid UTF-8 bytes", () => {
    expect(validateTb2aIntrinsicEvidence(
      new Uint8Array([0xc3, 0x28]),
    )).toEqual({ ok: false, reason: "STRUCTURE_INVALID" });
  });

  it("rejects a lone high surrogate string", () => {
    expect(validateTb2aIntrinsicEvidence("\ud800")).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("rejects a lone low surrogate string", () => {
    expect(validateTb2aIntrinsicEvidence("\udfff")).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("rejects a malformed surrogate sequence", () => {
    expect(validateTb2aIntrinsicEvidence("\ud800x")).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("rejects byte input above 65,536 bytes", () => {
    expect(validateTb2aIntrinsicEvidence(
      new Uint8Array(65_537),
    )).toEqual({ ok: false, reason: "STRUCTURE_INVALID" });
  });

  it("rejects string input above 65,536 code units before encoding", () => {
    expect(validateTb2aIntrinsicEvidence(
      "x".repeat(65_537),
    )).toEqual({ ok: false, reason: "STRUCTURE_INVALID" });
  });

  it("rejects a lying oversized subclass without consulting its traps", () => {
    let byteLengthReads = 0;
    let iteratorCalls = 0;
    class LyingOversizedBytes extends Uint8Array {
      override get byteLength(): number {
        byteLengthReads += 1;
        return 0;
      }

      override [Symbol.iterator](): ArrayIterator<number> {
        iteratorCalls += 1;
        throw new Error("TEST_ITERATOR_MUST_NOT_RUN");
      }
    }
    const bytes = new LyingOversizedBytes(65_537);

    expect(validateTb2aIntrinsicEvidence(bytes)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
    expect(byteLengthReads).toBe(0);
    expect(iteratorCalls).toBe(0);
  });

  it("accepts valid subclass backing without consulting its oversized iterator", () => {
    let iteratorCalls = 0;
    class HostileIteratorBytes extends Uint8Array {
      override [Symbol.iterator](): ArrayIterator<number> {
        iteratorCalls += 1;
        throw new Error("TEST_OVERSIZED_ITERATOR_MUST_NOT_RUN");
      }
    }
    const bytes = new HostileIteratorBytes(
      new TextEncoder().encode(canonicalEvidence()),
    );

    expect(validateTb2aIntrinsicEvidence(bytes)).toEqual({ ok: true });
    expect(iteratorCalls).toBe(0);
  });

  it("does not invoke a byteLength getter that would mutate valid backing", () => {
    let byteLengthReads = 0;
    let iteratorCalls = 0;
    class GetterMutationBytes extends Uint8Array {
      override get byteLength(): number {
        byteLengthReads += 1;
        this.fill(0);
        return 0;
      }

      override [Symbol.iterator](): ArrayIterator<number> {
        iteratorCalls += 1;
        throw new Error("TEST_ITERATOR_MUST_NOT_RUN");
      }
    }
    const bytes = new GetterMutationBytes(
      new TextEncoder().encode(canonicalEvidence()),
    );

    expect(validateTb2aIntrinsicEvidence(bytes)).toEqual({ ok: true });
    expect(byteLengthReads).toBe(0);
    expect(iteratorCalls).toBe(0);
  });

  it("copies exactly a nonzero-offset Uint8Array subarray", () => {
    const evidence = new TextEncoder().encode(canonicalEvidence());
    const wrapped = new Uint8Array(evidence.length + 7);
    wrapped.fill(0xff);
    wrapped.set(evidence, 3);
    const view = wrapped.subarray(3, 3 + evidence.length);

    expect(view.byteOffset).toBeGreaterThan(0);
    expect(validateTb2aIntrinsicEvidence(view)).toEqual({ ok: true });
  });

  it("rejects DataView and Uint16Array inputs", () => {
    for (const value of [
      new DataView(new ArrayBuffer(8)),
      new Uint16Array(4),
    ]) {
      expect(Reflect.apply(
        validateTb2aIntrinsicEvidence,
        undefined,
        [value],
      )).toEqual({ ok: false, reason: "STRUCTURE_INVALID" });
    }
  });

  it("uses internal lengths at the exact and over-limit boundaries", () => {
    class BoundaryBytes extends Uint8Array {
      byteLengthReads = 0;
      iteratorCalls = 0;

      override get byteLength(): number {
        this.byteLengthReads += 1;
        throw new Error("TEST_BYTE_LENGTH_MUST_NOT_RUN");
      }

      override [Symbol.iterator](): ArrayIterator<number> {
        this.iteratorCalls += 1;
        throw new Error("TEST_ITERATOR_MUST_NOT_RUN");
      }
    }
    const exact = new BoundaryBytes(65_536);
    const over = new BoundaryBytes(65_537);

    expect(validateTb2aIntrinsicEvidence(exact)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
    expect(validateTb2aIntrinsicEvidence(over)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
    expect(exact.byteLengthReads).toBe(0);
    expect(exact.iteratorCalls).toBe(0);
    expect(over.byteLengthReads).toBe(0);
    expect(over.iteratorCalls).toBe(0);
  });

  it("rejects a string within the code-unit bound but above the UTF-8 byte bound", () => {
    const input = "😀".repeat(20_000);

    expect(input.length).toBeLessThanOrEqual(65_536);
    expect(new TextEncoder().encode(input).byteLength).toBeGreaterThan(65_536);
    expect(validateTb2aIntrinsicEvidence(input)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("admits a well-formed surrogate pair through exact version classification", () => {
    const input = canonicalizeTb1Restricted({
      contractVersion: TB1_CONTRACT_VERSION,
      marker: "😀",
    });

    expect(validateTb2aIntrinsicEvidence(input)).toEqual({
      ok: false,
      reason: "VERSION_MISMATCH",
    });
  });
});

describe("P3E-B2 evidence-v2 intrinsic canonical and digest boundary", () => {
  it("classifies surrounding whitespace as CANONICAL_MISMATCH", () => {
    expect(validateTb2aIntrinsicEvidence(
      `${canonicalEvidence()}\n`,
    )).toEqual({ ok: false, reason: "CANONICAL_MISMATCH" });
  });

  it("classifies an alternate JSON escape as CANONICAL_MISMATCH", () => {
    const raw = canonicalEvidence().replace(
      PROJECT_ID,
      "mira-refund-\\u0073bx",
    );

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "CANONICAL_MISMATCH",
    });
  });

  it("classifies a changed canonical body with a stale digest as DIGEST_MISMATCH", () => {
    const raw = canonicalEvidence().replace(
      "\"classification\":\"ENABLED_ACTIVE\"",
      "\"classification\":\"DISABLED\"",
    );

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "DIGEST_MISMATCH",
    });
  });

  it("classifies a direct valid-format digest mutation as DIGEST_MISMATCH", () => {
    const raw = canonicalEvidence();
    const evidence = parsedRecord(raw);
    const integrity = record(evidence.integrity);
    const digest = requiredString(integrity.evidenceSha256);
    const changed = `${digest[0] === "0" ? "1" : "0"}${digest.slice(1)}`;
    const mutated = raw.replace(digest, changed);

    expect(validateTb2aIntrinsicEvidence(mutated)).toEqual({
      ok: false,
      reason: "DIGEST_MISMATCH",
    });
  });

  it("ignores an iterator trap that would mutate caller backing during admission", () => {
    let iteratorCalls = 0;
    class IteratorMutationBytes extends Uint8Array {
      override [Symbol.iterator](): ArrayIterator<number> {
        iteratorCalls += 1;
        this.fill(0);
        return super[Symbol.iterator]();
      }
    }
    const evidence = new TextEncoder().encode(canonicalEvidence());
    const bytes = new IteratorMutationBytes(evidence);

    expect(validateTb2aIntrinsicEvidence(bytes)).toEqual({ ok: true });
    expect(iteratorCalls).toBe(0);
    expect(bytes[0]).toBe(evidence[0]);
  });
});

describe("P3E-B2 evidence-v2 intrinsic semantics", () => {
  it("classifies a digest-valid crossed project tuple as SEMANTIC_INVALID", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      const observations = array(record(evidence.bootstrapApis).observations);
      record(observations[2]).consumerProjectNumber = "987654321098";
    });

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "SEMANTIC_INVALID",
    });
  });

  it("accepts all-enabled Method-A evidence", () => {
    expect(validateTb2aIntrinsicEvidence(canonicalEvidence())).toEqual({
      ok: true,
    });
  });

  it("accepts intrinsically coherent UNOBSERVABLE Method-A evidence", () => {
    const raw = canonicalEvidence({
      services: TARGETS.slice(0, 2),
    });

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({ ok: true });
  });

  it("rejects an explicit DISABLED state from evidence v2", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      const observations = array(record(evidence.bootstrapApis).observations);
      record(observations[0]).state = "DISABLED";
    });

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("rejects a sealed v2 review-disposition mismatch", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      record(evidence.review).disposition = "OBSERVATION_INCOMPLETE";
    });

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("accepts DISABLED billing without importing v1 billing precedence", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      record(evidence.billing).classification = "DISABLED";
    });
    const result = validateTb2aIntrinsicEvidence(raw);

    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain("BILLING_NOT_READY");
  });

  it("accepts clock-stale evidence without evaluating freshness", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      shiftEvidenceTimeline(evidence, -24 * 60 * 60 * 1_000);
    });

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({ ok: true });
  });

  it("accepts clock-future evidence without evaluating freshness", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      shiftEvidenceTimeline(evidence, 24 * 60 * 60 * 1_000);
    });

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({ ok: true });
  });

  it("rejects invalid repository-commit syntax", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      record(evidence.provenance).repositoryCommit = "not-a-commit";
    });

    expect(validateTb2aIntrinsicEvidence(raw)).toEqual({
      ok: false,
      reason: "STRUCTURE_INVALID",
    });
  });

  it("accepts arbitrary valid commit syntax without an approval output", () => {
    const raw = mutateCanonicalEvidence((evidence) => {
      record(evidence.provenance).repositoryCommit = "a".repeat(40);
    });
    const result = validateTb2aIntrinsicEvidence(raw);

    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toMatch(/commit|approved|source/iu);
  });
});

describe("P3E-B2 evidence-v2 intrinsic bounded and negative capability", () => {
  it("returns an exact fresh frozen success shape", () => {
    const first = validateTb2aIntrinsicEvidence(canonicalEvidence());
    const second = validateTb2aIntrinsicEvidence(canonicalEvidence());

    expect(first).toEqual({ ok: true });
    expect(Object.keys(first)).toEqual(["ok"]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("returns exact fresh frozen failure shapes for all five reasons", () => {
    const version = validateTb2aIntrinsicEvidence(JSON.stringify({
      contractVersion: TB1_CONTRACT_VERSION,
    }));
    const structure = validateTb2aIntrinsicEvidence("{");
    const canonical = validateTb2aIntrinsicEvidence(`${canonicalEvidence()} `);
    const digest = validateTb2aIntrinsicEvidence(
      canonicalEvidence().replace(
        "\"classification\":\"ENABLED_ACTIVE\"",
        "\"classification\":\"DISABLED\"",
      ),
    );
    const semantic = validateTb2aIntrinsicEvidence(
      mutateCanonicalEvidence((evidence) => {
        const observations = array(record(evidence.bootstrapApis).observations);
        record(observations[0]).consumerProjectNumber = "987654321098";
      }),
    );

    expect([version, structure, canonical, digest, semantic]).toEqual([
      { ok: false, reason: "VERSION_MISMATCH" },
      { ok: false, reason: "STRUCTURE_INVALID" },
      { ok: false, reason: "CANONICAL_MISMATCH" },
      { ok: false, reason: "DIGEST_MISMATCH" },
      { ok: false, reason: "SEMANTIC_INVALID" },
    ]);
    for (const result of [version, structure, canonical, digest, semantic]) {
      expect(Object.keys(result)).toEqual(["ok", "reason"]);
      expect(Object.isFrozen(result)).toBe(true);
    }
    expect(new Set([version, structure, canonical, digest, semantic]).size).toBe(5);
  });

  it("never returns sensitive or input-derived evidence values", () => {
    const raw = canonicalEvidence();
    const evidence = parsedRecord(raw);
    const digest = requiredString(record(evidence.integrity).evidenceSha256);
    const result = validateTb2aIntrinsicEvidence(raw);
    const serialized = JSON.stringify(result);

    for (const value of [
      PROJECT_ID,
      PROJECT_NUMBER,
      NONCE,
      REPOSITORY_COMMIT,
      digest,
    ]) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).toBe("{\"ok\":true}");
  });

  it("returns no readiness, review, custody, retention, approval, consumer, or READY token", () => {
    const serialized = JSON.stringify(
      validateTb2aIntrinsicEvidence(canonicalEvidence()),
    );

    expect(serialized).not.toMatch(
      /readiness|review|custody|retention|approval|consumer|ready/iu,
    );
  });

  it("introduces no filesystem-write, subprocess, network, credential, cloud, or provider surface", () => {
    const source = readFileSync(
      join(ROOT, "scripts/refund-p3e-b2-bootstrap-readiness.mts"),
      "utf8",
    );

    expect(source).not.toMatch(
      /from "node:(?:fs|child_process|http|https|net|tls)"/u,
    );
    expect(source).not.toMatch(/\b(?:fetch|spawn|execFile)\s*\(/u);
    expect(source).not.toContain("GOOGLE_APPLICATION_CREDENTIALS:");
  });

  it("has arity one and does not use a clock for stale or future evidence", () => {
    const stale = mutateCanonicalEvidence((evidence) => {
      shiftEvidenceTimeline(evidence, -24 * 60 * 60 * 1_000);
    });
    const future = mutateCanonicalEvidence((evidence) => {
      shiftEvidenceTimeline(evidence, 24 * 60 * 60 * 1_000);
    });

    expect(validateTb2aIntrinsicEvidence.length).toBe(1);
    expect(validateTb2aIntrinsicEvidence(stale)).toEqual({ ok: true });
    expect(validateTb2aIntrinsicEvidence(future)).toEqual({ ok: true });
  });

  it("exports the exact immutable truth marker and keeps it out of results", () => {
    const document = readFileSync(
      join(
        ROOT,
        "docs/payment_policy/"
          + "refund_worker_p3e_b2_evidence_intrinsic_validation_v1.md",
      ),
      "utf8",
    );
    const result: Tb2aIntrinsicEvidenceValidationResult =
      validateTb2aIntrinsicEvidence(canonicalEvidence());

    expect(TB2A_INTRINSIC_VALIDATION_TRUTH).toBe(
      "INTRINSIC_ONLY_NOT_FRESHNESS_NOT_PROVIDER_TRUTH",
    );
    expect(Object.isFrozen(TB2A_INTRINSIC_VALIDATION_TRUTH)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(
      TB2A_INTRINSIC_VALIDATION_TRUTH,
    );
    for (const marker of [
      "TB2A_INTRINSIC_VALIDATION_PACKAGE_ID: NONE",
      "TB2A_INTRINSIC_VALIDATION_FRESHNESS: NOT_EVALUATED",
      "TB2A_INTRINSIC_VALIDATION_PROVIDER_TRUTH: NOT_ATTESTED",
      "TB2A_INTRINSIC_VALIDATION_SOURCE_COMMIT_APPROVAL: NONE",
      "TB2A_INTRINSIC_VALIDATION_STORAGE: NONE",
      "TB2A_INTRINSIC_VALIDATION_WRITER: NONE",
      "TB2A_INTRINSIC_VALIDATION_REVIEW: NONE",
      "TB2A_INTRINSIC_VALIDATION_READINESS: NONE",
      "TB2A_INTRINSIC_VALIDATION_MUTATION_AUTHORITY: NONE",
    ]) {
      expect(document).toContain(marker);
    }
  });
});

function canonicalEvidence(
  options: Readonly<{
    nonce?: string;
    services?: readonly string[];
  }> = {},
): string {
  const assembled = assembleTb2aReviewerAbsentEvidence({
    projectId: PROJECT_ID,
    configurationName: CONFIGURATION,
    repositoryCommit: REPOSITORY_COMMIT,
    nonce: options.nonce ?? NONCE,
    receipts: makeReceipts(options.services ?? TARGETS),
    authoritativeNowMs: NOW_MS,
  });
  if (!assembled.ok) throw new Error("TEST_FIXTURE_INVALID");
  return assembled.canonicalEvidence;
}

function mutateCanonicalEvidence(
  mutate: (evidence: Record<string, unknown>) => void,
): string {
  const evidence = structuredClone(parsedRecord(canonicalEvidence()));
  mutate(evidence);
  record(evidence.integrity).evidenceSha256 =
    computeTb2aEvidenceDigest(evidence);
  return canonicalizeTb1Restricted(evidence);
}

function makeReceipts(services: readonly string[]): Tb2aCommandReceipt[] {
  const results = new Map<Tb2aCommandKind, Tb2aCommandResult>([
    ["EFFECTIVE_CONFIG_GET", parseCommand("EFFECTIVE_CONFIG_GET", {
      core: { account: "collector@example.invalid", project: PROJECT_ID },
    })],
    ["GCLOUD_VERSION", parseCommand("GCLOUD_VERSION", {
      "Google Cloud SDK": "577.0.0",
    })],
    ["COLLECTOR_IDENTITY", parseCommand("COLLECTOR_IDENTITY", [
      { account: "collector@example.invalid" },
    ])],
    ["PROJECT_GET", parseCommand("PROJECT_GET", {
      projectId: PROJECT_ID,
      projectNumber: PROJECT_NUMBER,
      lifecycleState: "ACTIVE",
    })],
    ["BILLING_INFO_GET", parseCommand("BILLING_INFO_GET", {
      projectId: PROJECT_ID,
      billingEnabled: true,
    })],
    ["BOOTSTRAP_SERVICES_LIST", parseCommand(
      "BOOTSTRAP_SERVICES_LIST",
      services.map(serviceRecord),
    )],
  ]);
  const startedAt = NOW_MS - 60_000;
  return TB2A_COMMAND_KINDS.map((kind, index) => {
    const result = results.get(kind);
    if (!result) throw new Error("TEST_FIXTURE_INVALID");
    const commandStartedAt = startedAt + index * 10;
    return Object.freeze({
      kind,
      args: buildTb2aReadOnlyCommand(kind, {
        projectId: PROJECT_ID,
        configurationName: CONFIGURATION,
      }),
      startedAt: new Date(commandStartedAt).toISOString(),
      completedAt: new Date(commandStartedAt + 10).toISOString(),
      durationMs: 10,
      result,
    });
  });
}

function parseCommand(
  kind: Tb2aCommandKind,
  value: unknown,
): Tb2aCommandResult {
  return parseTb2aCommandOutput(
    kind,
    new TextEncoder().encode(JSON.stringify(value)),
    { projectId: PROJECT_ID, projectNumber: PROJECT_NUMBER },
  );
}

function serviceRecord(name: string): Record<string, unknown> {
  return {
    name: `projects/${PROJECT_NUMBER}/services/${name}`,
    parent: `projects/${PROJECT_NUMBER}`,
    config: { name },
    state: "ENABLED",
  };
}

function shiftEvidenceTimeline(
  evidence: Record<string, unknown>,
  offsetMs: number,
): void {
  const collection = record(evidence.collection);
  collection.startedAt = shiftedTimestamp(collection.startedAt, offsetMs);
  collection.completedAt = shiftedTimestamp(collection.completedAt, offsetMs);
  for (const command of array(collection.commands)) {
    const receipt = record(command);
    receipt.startedAt = shiftedTimestamp(receipt.startedAt, offsetMs);
    receipt.completedAt = shiftedTimestamp(receipt.completedAt, offsetMs);
  }
}

function shiftedTimestamp(value: unknown, offsetMs: number): string {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) throw new Error("TEST_FIXTURE_INVALID");
  return new Date(parsed + offsetMs).toISOString();
}

function parsedRecord(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  return record(parsed);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("TEST_FIXTURE_INVALID");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("TEST_FIXTURE_INVALID");
  return value;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new Error("TEST_FIXTURE_INVALID");
  return value;
}
