import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import {
  ACCEPTANCE_DATABASE_NAME,
  databaseNameFromUrl,
  defaultDriftCheck,
  migrationFingerprint,
  PRISMA_VERIFY_TIMEOUT_MS,
  verifyAcceptanceDatabase,
  verifyMigrationRecords,
  type PrismaCommandRunner,
} from "../../../scripts/refund-sandbox-acceptance/database-verifier";
import {
  checkManifestHash,
  DATABASE_CHECK_INVARIANTS_INVALID,
  DATABASE_INVARIANT_MANIFEST_INVALID,
  DATABASE_INVARIANT_POSTGRES_VERSION_UNSUPPORTED,
  DATABASE_PARTIAL_INDEX_INVARIANT_INVALID,
  EXPECTED_CHECK_COUNTS_BY_TABLE,
  EXPECTED_CHECK_INVARIANT_COUNT,
  EXPECTED_CHECK_INVARIANTS,
  EXPECTED_CHECK_MANIFEST_SHA256,
  EXPECTED_PARTIAL_INDEX,
  verifyCheckInvariants,
  verifyPartialIndexInvariant,
  verifyPostgresVersion,
  type CatalogCheckRow,
  type CatalogPartialIndexRow,
} from "../../../scripts/refund-sandbox-acceptance/database-invariants";
import {
  buildBaseLedgerIntegrity,
  GIT_IDENTITY_TIMEOUT_MS,
} from "../../../scripts/refund-sandbox-acceptance/integrity";
import {
  assertSanitizedEvidence,
  parseSanitizedEvidence,
  SANITIZED_REPORT_KEYS,
} from "../../../scripts/refund-sandbox-acceptance/redaction";
import { RunLedgerStore, type H1Ledger } from "../../../scripts/refund-sandbox-acceptance/run-ledger";
import { appendRuntimeLedger } from "../../../scripts/refund-sandbox-acceptance/runtime-ledger";
import { buildSanitizedReport } from "../../../scripts/refund-sandbox-acceptance/sanitized-report";
import { AcceptanceBootstrap } from "../../../scripts/refund-sandbox-acceptance/bootstrap";
import { cleanupCommand } from "../../../scripts/refund-sandbox-acceptance/cli-runtime";
import {
  protectedGetRequest,
  protectedPostRequest,
  type BudgetRecord,
} from "../../../scripts/refund-sandbox-acceptance/call-budget";
import { createS3HistoryExpectation } from "../../../scripts/refund-sandbox-acceptance/resume-planner";
import { deriveTossRefundCancellationWireRequest } from "../../lib/payment/refund/providers/toss/refund-wire-request";

const OLD_COMMIT = "62ad6d709c0db767732e8cf2abd4ddbeeba08031";
const SYNTHETIC_COMMIT = "a".repeat(40);
const RUN_ID = "sbx-20260718T010203Z-0123456789abcdef";
const CONFIGURED_ACCEPTANCE_URL =
  "postgresql://configured-user@localhost:5432/wig_platform_acceptance?schema=public";
const AMBIENT_WRONG_URL =
  "postgresql://wrong-user@localhost:5432/wrong_database?schema=public";

describe("refund SANDBOX acceptance database and migration verifier", () => {
  const repository = Object.freeze([
    Object.freeze({ name: "001_first", checksum: "a".repeat(64) }),
    Object.freeze({ name: "002_second", checksum: "b".repeat(64) }),
  ]);
  const applied = Object.freeze(repository.map((entry) => Object.freeze({
    migration_name: entry.name,
    checksum: entry.checksum,
    finished_at: new Date("2026-07-18T00:00:00.000Z"),
    rolled_back_at: null,
    applied_steps_count: 1,
  })));

  it("requires the exact configured database name", () => {
    expect(databaseNameFromUrl("postgresql://localhost/wig_platform_acceptance"))
      .toBe("wig_platform_acceptance");
    expect(databaseNameFromUrl("postgresql://localhost/wig_platform_test")).toBe("wig_platform_test");
    expect(() => databaseNameFromUrl("not a url")).toThrow("DATABASE_URL_INVALID");
  });

  it("pins the exact ordered migration set, checksums, and success state", () => {
    expect(() => verifyMigrationRecords(repository, applied)).not.toThrow();
    expect(migrationFingerprint(repository)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => verifyMigrationRecords(repository, applied.slice(0, 1))).toThrow("MIGRATION_SET_MISMATCH");
    expect(() => verifyMigrationRecords(repository, [
      { ...applied[0], checksum: "c".repeat(64) },
      applied[1],
    ])).toThrow("MIGRATION_CHECKSUM_MISMATCH");
    expect(() => verifyMigrationRecords(repository, [
      { ...applied[0], rolled_back_at: new Date("2026-07-18T00:01:00.000Z") },
      applied[1],
    ])).toThrow("MIGRATION_STATE_INVALID");
  });
});

describe("refund SANDBOX acceptance reachability and evidence privacy", () => {
  it("keeps the harness unreachable from production and package scripts", async () => {
    const root = process.cwd();
    const harnessTests = join(root, "src", "__tests__", "refund-sandbox-acceptance");
    const production = (await sourceFiles(join(root, "src")))
      .filter((path) => !path.startsWith(harnessTests));
    const bodies = await Promise.all(production.map((path) => readFile(path, "utf8")));
    expect(bodies.some((body) => body.includes("scripts/refund-sandbox-acceptance"))).toBe(false);
    const packageBody = await readFile(join(root, "package.json"), "utf8");
    expect(packageBody).not.toContain("refund-sandbox-acceptance");
  });

  it("imports the guarded CLI without provider network contact or scenario execution", async () => {
    const originalFetch = fetch;
    const originalSecret = process.env.TOSS_SANDBOX_SECRET_KEY;
    const network = vi.fn<typeof fetch>();
    process.env.TOSS_SANDBOX_SECRET_KEY = "test_sk_configured-looking-but-inert";
    vi.stubGlobal("fetch", network);
    try {
      await import("../../../scripts/refund-sandbox-acceptance/cli");
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
      if (originalSecret === undefined) delete process.env.TOSS_SANDBOX_SECRET_KEY;
      else process.env.TOSS_SANDBOX_SECRET_KEY = originalSecret;
    }
  });

  it("keeps the S6 replacement matrix non-sensitive, complete, and outside runtime authority", async () => {
    const root = process.cwd();
    const matrixPath = join(
      root, "docs", "payment_policy", "toss_refund_capability_matrix_v1.md",
    );
    const matrix = await readFile(matrixPath, "utf8");
    for (const heading of [
      "Environment", "Payment-method / product scope", "Test-payment provisionability",
      "Lookup visibility", "Cancellation support", "Evidence type",
      "Evidence source / reference", "Observed or reviewed", "Confidence / status",
      "Provider contact currently authorized", "Operational consequence or blocker",
    ]) expect(matrix).toContain(heading);
    for (const status of [
      "CONFIRMED", "OBSERVED", "PARTIAL", "UNDOCUMENTED", "UNKNOWN", "NOT_AUTHORIZED",
    ]) expect(matrix).toContain(status);
    expect(matrix).toContain("grants no provider-contact");
    expect(matrix).toContain("LIVE requires a separate activation decision");
    expect(matrix).not.toMatch(/(?:test|live)_(?:sk|gsk)_[A-Za-z0-9]/u);
    expect(matrix).not.toMatch(/sbx-\d{8}T\d{6}Z-[0-9a-f]{16}/u);
    const runtimeBodies = await Promise.all((await sourceFiles(join(
      root, "scripts", "refund-sandbox-acceptance",
    ))).map((path) => readFile(path, "utf8")));
    expect(runtimeBodies.some((body) => body.includes("toss_refund_capability_matrix_v1")))
      .toBe(false);
  });

  it("accepts only the exact report schema with safe assertion and HMAC representations", () => {
    const report = validEvidence();
    expect(Object.keys(report).sort()).toEqual([...SANITIZED_REPORT_KEYS].sort());
    expect(() => assertSanitizedEvidence(report)).not.toThrow();
    const nullPrototype = { ...report };
    Object.setPrototypeOf(nullPrototype, null);
    const nullBooleans = { ...report.booleans };
    Object.setPrototypeOf(nullBooleans, null);
    nullPrototype.booleans = nullBooleans;
    expect(() => assertSanitizedEvidence(nullPrototype)).not.toThrow();
    expect(() => assertSanitizedEvidence({
      ...report,
      paymentKeyHmac: null,
      operationKeyHmac: null,
      wireFingerprintHmac: null,
      transactionKeyHmac: null,
    })).not.toThrow();
  });

  it.each([
    "operationKey", "transactionKey", "paymentKey", "providerOrderId", "providerRefundId",
    "Authorization", "secret", "secretKey", "rawBody", "requestBody", "responseBody",
    "OperationKey", "TRANSACTIONKEY", "SECRETKEY",
  ])("rejects exact raw-sensitive key %s at top level and nested depth", (key) => {
    expect(sanitizedFailure({ ...validEvidence(), [key]: "synthetic-sensitive-value" }))
      .toBe("SANITIZED_EVIDENCE_FORBIDDEN_FIELD");
    expect(sanitizedFailure({
      ...validEvidence(),
      policyHashes: { ...validEvidence().policyHashes, envelope: { [key]: "synthetic-value" } },
    })).toBe("SANITIZED_EVIDENCE_FORBIDDEN_FIELD");
  });

  it.each([
    "sameOperationKey", "sameBody", "sameTransactionKey", "singleCancellation",
    "noSecondPost", "recoveredByLookup", "cleanupComplete",
  ])("rejects non-boolean assertion value for %s", (key) => {
    expect(sanitizedFailure({
      ...validEvidence(), booleans: { ...validEvidence().booleans, [key]: "not-a-boolean" },
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
  });

  it.each([
    ["sameOperationKey", "raw-operation-key"],
    ["sameOperationKey", Object.freeze({ value: "synthetic" })],
    ["sameOperationKey", Object.freeze([])],
    ["sameOperationKey", 1],
    ["sameOperationKey", undefined],
    ["sameTransactionKey", "raw-transaction-key"],
    ["sameTransactionKey", Object.freeze({ value: "synthetic" })],
    ["sameTransactionKey", Object.freeze([])],
    ["sameTransactionKey", 1],
    ["sameTransactionKey", undefined],
  ])("exhaustively rejects invalid %s representation", (key, value) => {
    expect(sanitizedFailure({
      ...validEvidence(), booleans: { ...validEvidence().booleans, [key]: value },
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
  });

  it("accepts true, false, and null without conflating comparison assertions and HMACs", () => {
    for (const value of [true, false, null]) {
      expect(() => assertSanitizedEvidence({
        ...validEvidence(),
        booleans: {
          ...validEvidence().booleans,
          sameOperationKey: value,
          sameTransactionKey: value,
        },
      })).not.toThrow();
    }
  });

  it("rejects unknown keys, symbols, and accessors without invoking accessors", () => {
    expect(sanitizedFailure({ ...validEvidence(), unknownTopLevel: null }))
      .toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(), booleans: { ...validEvidence().booleans, unknownAssertion: null },
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(),
      localProjection: { ...validEvidence().localProjection, unknownProjection: null },
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(), rawArtifacts: [{ ...validEvidence().rawArtifacts[0], name: "forbidden" }],
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(), policyHashes: { ...validEvidence().policyHashes, unknown: "a".repeat(64) },
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    const symbolReport = { ...validEvidence(), [Symbol("extra")]: true };
    expect(sanitizedFailure(symbolReport)).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    let accessorCalls = 0;
    const accessorReport = { ...validEvidence() };
    Object.defineProperty(accessorReport, "unknownAccessor", {
      enumerable: true,
      get: () => {
        accessorCalls += 1;
        return "forbidden";
      },
    });
    expect(sanitizedFailure(accessorReport)).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(accessorCalls).toBe(0);
  });

  it.each([
    ["operationKeyHmac", "a".repeat(63)],
    ["operationKeyHmac", "a".repeat(65)],
    ["operationKeyHmac", "A".repeat(64)],
    ["operationKeyHmac", "g".repeat(64)],
    ["operationKeyHmac", ` ${"a".repeat(64)}`],
    ["operationKeyHmac", ""],
    ["operationKeyHmac", "raw-operation-key"],
    ["operationKeyHmac", Object.freeze({ value: "synthetic" })],
    ["operationKeyHmac", Object.freeze([])],
    ["transactionKeyHmac", "a".repeat(63)],
    ["transactionKeyHmac", "raw-transaction-key"],
    ["paymentKeyHmac", "A".repeat(64)],
    ["wireFingerprintHmac", 64],
  ])("rejects invalid %s representation", (field, value) => {
    expect(sanitizedFailure({ ...validEvidence(), [field]: value }))
      .toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
  });

  it("strictly validates policy hashes, local projection, result codes, and raw artifacts", () => {
    expect(sanitizedFailure({
      ...validEvidence(), policyHashes: { ...validEvidence().policyHashes, unknown: "f".repeat(64) },
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(), localProjection: { ...validEvidence().localProjection, dispatchCount: -1 },
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(), normalizedProviderOutcome: ["SUCCEEDED"], staticLocalResultCodes: [],
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(), rawArtifacts: [{ hash: "A".repeat(64), size: 1 }],
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(sanitizedFailure({
      ...validEvidence(), rawArtifacts: [{ hash: "a".repeat(64), size: -1 }],
    })).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
  });

  it("keeps public validation failures static and free of raw values", () => {
    const rawIdentifier = "synthetic-raw-identifier-must-not-leak";
    const forbidden = sanitizedFailure({ ...validEvidence(), operationKey: rawIdentifier });
    const invalid = sanitizedFailure({
      ...validEvidence(),
      booleans: { ...validEvidence().booleans, sameOperationKey: rawIdentifier },
    });
    expect(forbidden).toBe("SANITIZED_EVIDENCE_FORBIDDEN_FIELD");
    expect(invalid).toBe("SANITIZED_EVIDENCE_SCHEMA_INVALID");
    expect(forbidden.includes(rawIdentifier)).toBe(false);
    expect(invalid.includes(rawIdentifier)).toBe(false);
  });

  it("derives S3 replay assertions only from a complete validated replay result", async () => {
    const rawDirectory = await mkdtemp(join(tmpdir(), "mira-xp5-sanitized-"));
    try {
      const validated = await buildProviderReport(rawDirectory, "S3", ["REPLAY_OBSERVED"]);
      expect(validated.booleans).toEqual({
        sameOperationKey: true,
        sameBody: true,
        sameTransactionKey: true,
        singleCancellation: true,
        noSecondPost: null,
        recoveredByLookup: null,
        cleanupComplete: false,
      });
      expect(validated.transactionKeyHmac).toBeNull();

      const incomplete = await buildProviderReport(
        rawDirectory,
        "S3",
        ["S3_REPLAY_PROBE_FAILED"],
      );
      expect(incomplete.booleans).toEqual({
        sameOperationKey: true,
        sameBody: true,
        sameTransactionKey: null,
        singleCancellation: null,
        noSecondPost: null,
        recoveredByLookup: null,
        cleanupComplete: false,
      });

      const scenarioOnly = await buildProviderReport(
        rawDirectory, "S3", [], { posts: [], budgets: { GET: 0, POST: 0 } },
      );
      expect(scenarioOnly.booleans).toMatchObject({
        sameTransactionKey: null, singleCancellation: null,
      });

      const wrongCounts = await buildProviderReport(
        rawDirectory, "S3", ["REPLAY_OBSERVED"], { budgets: { GET: 3, POST: 2 } },
      );
      expect(wrongCounts.booleans).toMatchObject({
        sameTransactionKey: null, singleCancellation: null,
      });
    } finally {
      await rm(rawDirectory, { recursive: true, force: true });
    }
  });

  it.each(identityCardinalityCases())(
    "requires exactly two positional operation keys: %s",
    async (_case, values, expected) => {
      const rawDirectory = await mkdtemp(join(tmpdir(), "mira-xp5-operation-cardinality-"));
      try {
        const report = await buildProviderReport(rawDirectory, "S3", ["REPLAY_OBSERVED"], {
          posts: values.map((operationKey) => Object.freeze({
            operationKey, canonicalBody: "{\"cancelAmount\":1000}",
          })),
          budgets: { GET: 2, POST: values.length },
        });
        expect(report.booleans).toMatchObject({ sameOperationKey: expected });
      } finally {
        await rm(rawDirectory, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ["extra non-POST calls surrounding exactly two POSTs", ["GET", "POST", "POST", "GET"], true],
    ["reordered mixed GET/POST records", ["POST", "GET", "POST", "GET"], true],
    ["three POSTs plus extra GET records", ["GET", "POST", "GET", "POST", "POST", "GET"], null],
  ] as const)("preserves POST-only sanitized cardinality with %s", async (_case, kinds, expected) => {
    const rawDirectory = await mkdtemp(join(tmpdir(), "mira-xp5-mixed-cardinality-"));
    try {
      const report = await buildProviderReport(rawDirectory, "S3", ["REPLAY_OBSERVED"], {
        callRecords: mixedCardinalityRecords(kinds),
        budgets: { GET: kinds.filter((kind) => kind === "GET").length, POST: kinds.filter((kind) => kind === "POST").length },
      });
      expect(report.booleans).toMatchObject({
        sameOperationKey: expected,
        sameBody: expected,
      });
    } finally {
      await rm(rawDirectory, { recursive: true, force: true });
    }
  });

  it.each(identityCardinalityCases())(
    "requires exactly two positional canonical bodies: %s",
    async (_case, values, expected) => {
      const rawDirectory = await mkdtemp(join(tmpdir(), "mira-xp5-body-cardinality-"));
      try {
        const report = await buildProviderReport(rawDirectory, "S3", ["REPLAY_OBSERVED"], {
          posts: values.map((canonicalBody) => Object.freeze({
            operationKey: "synthetic-operation", canonicalBody,
          })),
          budgets: { GET: 2, POST: values.length },
        });
        expect(report.booleans).toMatchObject({ sameBody: expected });
      } finally {
        await rm(rawDirectory, { recursive: true, force: true });
      }
    },
  );

  it("preserves S1 and S2 sanitized assertion semantics", async () => {
    const rawDirectory = await mkdtemp(join(tmpdir(), "mira-xp5-sanitized-regression-"));
    try {
      const s1 = await buildProviderReport(rawDirectory, "S1", ["SUCCEEDED"]);
      expect(s1.booleans).toEqual({
        sameOperationKey: null,
        sameBody: null,
        sameTransactionKey: null,
        singleCancellation: null,
        noSecondPost: null,
        recoveredByLookup: null,
        cleanupComplete: false,
      });
      const s2 = await buildProviderReport(rawDirectory, "S2", ["RECOVERED"]);
      expect(s2.booleans).toEqual({
        sameOperationKey: null,
        sameBody: null,
        sameTransactionKey: null,
        singleCancellation: null,
        noSecondPost: true,
        recoveredByLookup: true,
        cleanupComplete: false,
      });
    } finally {
      await rm(rawDirectory, { recursive: true, force: true });
    }
  });

  it("preserves historical S5 reports", async () => {
    const rawDirectory = await mkdtemp(join(tmpdir(), "mira-p2-historical-reports-"));
    try {
      const s5 = await buildProviderReport(rawDirectory, "S5", ["ORDINAL_2_SUCCEEDED"]);
      expect(parseSanitizedEvidence(s5)).toMatchObject({
        scenarioId: "S5",
        staticLocalResultCodes: ["ORDINAL_2_SUCCEEDED"],
        scenarioLimitations: [
          "Ordinal-2 application path; provider duplicate POST is covered by S3.",
        ],
      });
    } finally {
      await rm(rawDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    ["prepared", "S6", ["S6_PREPARED"], true],
    ["skipped", "S6", ["SKIPPED_NOT_AVAILABLE"], false],
    ["absent", "S6", undefined, false],
    ["null", "S6", null, false],
    ["empty", "S6", [], false],
    ["unrelated failure", "S6", ["S6_FAILED"], false],
    ["prepared plus another code", "S6", ["S6_PREPARED", "OTHER"], false],
    ["prepared on a non-S6 report", "S1", ["S6_PREPARED"], false],
  ] as const)("classifies historical S6 result codes exactly: %s", async (
    _case,
    scenarioId,
    resultCode,
    expected,
  ) => {
    const rawDirectory = await mkdtemp(join(tmpdir(), "mira-p2-s6-report-matrix-"));
    try {
      const report = await buildProviderReport(
        rawDirectory,
        scenarioId,
        resultCode,
        scenarioId === "S6" ? { posts: [], budgets: { GET: 0, POST: 0 } } : undefined,
      );
      expect(parseSanitizedEvidence(report)).toMatchObject({ scenarioId, s6Executed: expected });
    } finally {
      await rm(rawDirectory, { recursive: true, force: true });
    }
  });

  it("runs the existing purge-raw command after provider-only DB cleanup", async () => {
    const isolatedHome = await mkdtemp(join(tmpdir(), "mira-xp5-purge-home-"));
    vi.resetModules();
    vi.doMock("node:os", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:os")>();
      return { ...actual, homedir: () => isolatedHome };
    });
    try {
      const [{ H1_ARTIFACT_PARENT, H1ArtifactStore }, { atomicWriteJson },
        { runCli }, { RunLedgerStore: IsolatedLedgerStore }] = await Promise.all([
        import("../../../scripts/refund-sandbox-acceptance/artifact-store"),
        import("../../../scripts/refund-sandbox-acceptance/atomic-files"),
        import("../../../scripts/refund-sandbox-acceptance/cli"),
        import("../../../scripts/refund-sandbox-acceptance/run-ledger"),
      ]);
      const store = new H1ArtifactStore(H1_ARTIFACT_PARENT, RUN_ID);
      await store.initialize();
      await Promise.all([
        atomicWriteJson(store.path("sealed", "S3.json"), { evidence: "sealed" }),
        atomicWriteJson(store.path("sanitized", "S3.json"), { evidence: "sanitized" }),
      ]);
      const ledger = new IsolatedLedgerStore(store.path("ledger"));
      await ledger.append({
        runId: RUN_ID,
        scenarioId: "S3",
        phase: "SEALED",
        repositoryCommit: "a".repeat(40),
        runnerSourceHash: "b".repeat(64),
        policyHashes: Object.freeze({ policy: "c".repeat(64) }),
        migrationFingerprint: "d".repeat(64),
        scenarioInputHash: "e".repeat(64),
        payload: Object.freeze({ scenarioId: "S3" }),
      });
      const sealedBefore = await readFile(store.path("sealed", "S3.json"));
      const sanitizedBefore = await readFile(store.path("sanitized", "S3.json"));
      await expect(cleanupCommand(RUN_ID, {
        MIRA_TOSS_SANDBOX_ACCEPTANCE_CLEANUP_CONFIRM: RUN_ID,
      }, {
        prisma: db,
        bootstrap: new AcceptanceBootstrap(db, "wig_platform_test"),
        ledger,
      })).resolves.toEqual({ code: "DATABASE_CLEANED", runId: RUN_ID });
      expect((await ledger.loadLatest())?.phase).toBe("DB_CLEANED");
      await expect(runCli(["purge-raw", "--run", RUN_ID], {
        MIRA_TOSS_SANDBOX_ACCEPTANCE_PURGE_CONFIRM: RUN_ID,
      })).resolves.toEqual({ code: "RAW_PURGED", runId: RUN_ID });
      await expect(access(store.path("raw"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(store.path("sealed", "S3.json"))).toEqual(sealedBefore);
      expect(await readFile(store.path("sanitized", "S3.json"))).toEqual(sanitizedBefore);
    } finally {
      vi.doUnmock("node:os");
      vi.resetModules();
      await rm(isolatedHome, { recursive: true, force: true });
    }
  });
});

describe("runtime repository commit provenance", () => {
  it("derives a runtime commit, seals it in the ledger, and pins the report projection", async () => {
    const base = await buildBaseLedgerIntegrity(process.cwd(), "b".repeat(64), {
      runGitIdentity: (spec) => {
        expect(spec.executable).toBe("git");
        expect(spec.arguments).toEqual(["rev-parse", "--verify", "HEAD"]);
        expect(spec.cwd).toBe(process.cwd());
        expect(spec.shell).toBe(false);
        expect(spec.stderr).toBe("ignore");
        expect(spec.timeoutMs).toBe(GIT_IDENTITY_TIMEOUT_MS);
        expect(spec.killSignal).toBe("SIGKILL");
        expect(spec.maxStdoutBytes).toBeGreaterThanOrEqual(41);
        return Promise.resolve(successfulGitResult(SYNTHETIC_COMMIT));
      },
    });
    expect(base.repositoryCommit).toBe(SYNTHETIC_COMMIT);
    expect(base.repositoryCommit).not.toBe(OLD_COMMIT);
    const root = await mkdtemp(join(tmpdir(), "mira-h1f1-integrity-"));
    try {
      const ledger = await propagatedLedger(root, base);
      expect(ledger.repositoryCommit).toBe(SYNTHETIC_COMMIT);
      expect(ledger.phase).toBe("SEALED");
      const reportSource = await readFile(join(
        process.cwd(), "scripts", "refund-sandbox-acceptance", "sanitized-report.ts",
      ), "utf8");
      expect(reportSource).toMatch(
        /repositoryCommit:\s*input\.ledger\.repositoryCommit/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["abbreviated", "a".repeat(12)],
    ["non-hex", "g".repeat(40)],
    ["multiple lines", `${"a".repeat(40)}\n${"b".repeat(40)}`],
    ["empty", ""],
  ])("rejects %s Git output with one static failure", async (_case, output) => {
    const message = await gitFailureMessage(() => Promise.resolve(successfulGitResult(output)));
    expect(message).toBe("GIT_IDENTITY_FAILED");
    if (output.length > 0) expect(message).not.toContain(output);
  });

  it("fails closed on Git timeout without output leakage or fallback", async () => {
    const raw = "raw-child-output-must-not-leak";
    const message = await gitFailureMessage(() => Promise.resolve(Object.freeze({
      exitCode: null,
      signal: "SIGKILL",
      stdout: raw,
      timedOut: true,
      outputExceeded: false,
    })));
    expect(message).toBe("GIT_IDENTITY_FAILED");
    expect(message).not.toContain(raw);
    expect(message).not.toContain(OLD_COMMIT);
  });

  it("removes the executable hard-coded repository commit assignment", async () => {
    const source = await readFile(join(
      process.cwd(), "scripts", "refund-sandbox-acceptance", "integrity.ts",
    ), "utf8");
    expect(source).not.toMatch(new RegExp(`repositoryCommit\\s*:\\s*["']${OLD_COMMIT}["']`));
  });
});

describe("bounded Prisma verification subprocess", () => {
  it("pins the configured URL over ambient state and runs both fixed commands", async () => {
    const captured: string[][] = [];
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = AMBIENT_WRONG_URL;
    try {
      await defaultDriftCheck(CONFIGURED_ACCEPTANCE_URL, (spec) => {
        captured.push([...spec.arguments]);
        expect(spec.executable).toBe("npx");
        expect(spec.timeoutMs).toBe(PRISMA_VERIFY_TIMEOUT_MS);
        expect(spec.killSignal).toBe("SIGKILL");
        expect(spec.shell).toBe(false);
        expect(spec.stdio).toBe("ignore");
        expect(spec.environment.DATABASE_URL).toBe(CONFIGURED_ACCEPTANCE_URL);
        expect(spec.arguments).not.toContain(CONFIGURED_ACCEPTANCE_URL);
        expect(spec.arguments).not.toContain(AMBIENT_WRONG_URL);
        expect(process.env.DATABASE_URL).toBe(AMBIENT_WRONG_URL);
        return Promise.resolve(Object.freeze({ exitCode: 0, signal: null, timedOut: false }));
      });
      expect(process.env.DATABASE_URL).toBe(AMBIENT_WRONG_URL);
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
    expect(captured).toEqual([
      ["prisma", "validate"],
      [
        "prisma", "migrate", "diff", "--exit-code", "--from-config-datasource",
        "--to-schema", "prisma/schema.prisma",
      ],
    ]);
    expect(captured.flat()).not.toContain("--from-migrations");
    expect(captured.flat()).not.toContain("--to-config-datasource");
    expect(captured.flat().some((argument) => /shadow/i.test(argument))).toBe(false);
  });

  it("always runs mandatory M2 through only the bounded runner seam", async () => {
    const migrationsDirectory = await mkdtemp(join(tmpdir(), "mira-mandatory-m2-"));
    try {
      const client = invariantClient();
      const captured: string[][] = [];
      let runnerCalls = 0;
      const runner: PrismaCommandRunner = (spec) => {
        runnerCalls += 1;
        captured.push([...spec.arguments]);
        return Promise.resolve(Object.freeze({ exitCode: 0, signal: null, timedOut: false }));
      };
      const verified = await verifyAcceptanceDatabase(client, {
        configuredUrl: CONFIGURED_ACCEPTANCE_URL,
        migrationsDirectory,
        prismaCommandRunner: runner,
      });
      expect(verified.databaseName).toBe(ACCEPTANCE_DATABASE_NAME);
      expect(runnerCalls).toBe(2);
      expect(captured).toEqual([
        ["prisma", "validate"],
        [
          "prisma", "migrate", "diff", "--exit-code", "--from-config-datasource",
          "--to-schema", "prisma/schema.prisma",
        ],
      ]);
    } finally {
      await rm(migrationsDirectory, { recursive: true, force: true });
    }
  });

  it("cannot replace M2 and cannot succeed when the mandatory runner fails", async () => {
    const forbiddenOptions: Parameters<typeof verifyAcceptanceDatabase>[1] = {
      configuredUrl: CONFIGURED_ACCEPTANCE_URL,
      migrationsDirectory: "prisma/migrations",
      // @ts-expect-error whole-M2 replacement is forbidden
      driftCheck: () => Promise.resolve(),
    };
    expect(Reflect.has(forbiddenOptions, "driftCheck")).toBe(true);

    const migrationsDirectory = await mkdtemp(join(tmpdir(), "mira-failed-m2-"));
    try {
      const runner = vi.fn().mockRejectedValue(new Error("synthetic raw failure"));
      await expect(verifyAcceptanceDatabase(invariantClient(), {
        configuredUrl: CONFIGURED_ACCEPTANCE_URL,
        migrationsDirectory,
        prismaCommandRunner: runner,
      })).rejects.toThrow("PRISMA_VERIFICATION_FAILED");
      expect(runner).toHaveBeenCalledTimes(1);
    } finally {
      await rm(migrationsDirectory, { recursive: true, force: true });
    }
  });

  it("fails closed on validate exit 1 without retry", async () => {
    let calls = 0;
    const message = await prismaFailureMessage(() => {
      calls += 1;
      return Promise.resolve(Object.freeze({ exitCode: 1, signal: null, timedOut: false }));
    });
    expect(calls).toBe(1);
    expect(message).toBe("PRISMA_VERIFICATION_FAILED");
  });

  it("fails closed on validate timeout without retry", async () => {
    let calls = 0;
    const message = await prismaFailureMessage((spec) => {
      calls += 1;
      expect(spec.arguments).toEqual(["prisma", "validate"]);
      return Promise.resolve(Object.freeze({
        exitCode: null, signal: "SIGKILL", timedOut: true,
      }));
    });
    expect(calls).toBe(1);
    expect(message).toBe("PRISMA_VERIFICATION_FAILED");
  });

  it("redacts a raw Prisma runner failure and performs no retry", async () => {
    let calls = 0;
    const raw = "raw-prisma-error-must-not-leak";
    const message = await prismaFailureMessage(() => {
      calls += 1;
      return Promise.reject(new Error(raw));
    });
    expect(calls).toBe(1);
    expect(message).toBe("PRISMA_VERIFICATION_FAILED");
    expect(message).not.toContain(raw);
  });

  it.each([1, 2])("fails closed on diff exit %s after exactly two calls", async (exitCode) => {
    let calls = 0;
    const message = await prismaFailureMessage(() => {
      calls += 1;
      return Promise.resolve(Object.freeze({
        exitCode: calls === 1 ? 0 : exitCode,
        signal: null,
        timedOut: false,
      }));
    });
    expect(calls).toBe(2);
    expect(message).toBe("PRISMA_VERIFICATION_FAILED");
  });

  it("fails closed on diff timeout after exactly two calls", async () => {
    let calls = 0;
    const message = await prismaFailureMessage(() => {
      calls += 1;
      return Promise.resolve(calls === 1
        ? Object.freeze({ exitCode: 0, signal: null, timedOut: false })
        : Object.freeze({ exitCode: null, signal: "SIGKILL" as const, timedOut: true }));
    });
    expect(calls).toBe(2);
    expect(message).toBe("PRISMA_VERIFICATION_FAILED");
  });
});

describe("migration-owned refund database invariants", () => {
  it("pins 66 unique CHECK identities, table counts, and the independent manifest hash", () => {
    expect(EXPECTED_CHECK_INVARIANTS).toHaveLength(EXPECTED_CHECK_INVARIANT_COUNT);
    const identities = EXPECTED_CHECK_INVARIANTS.map((entry) => (
      `${entry.schemaName}:${entry.tableName}:${entry.constraintName}`
    ));
    expect(new Set(identities).size).toBe(EXPECTED_CHECK_INVARIANT_COUNT);
    const counts: Record<string, number> = {};
    for (const entry of EXPECTED_CHECK_INVARIANTS) {
      counts[entry.tableName] = (counts[entry.tableName] ?? 0) + 1;
    }
    expect(counts).toEqual(EXPECTED_CHECK_COUNTS_BY_TABLE);
    expect(checkManifestHash(EXPECTED_CHECK_INVARIANTS)).toBe(EXPECTED_CHECK_MANIFEST_SHA256);
  });

  it("accepts the exact CHECK manifest", () => {
    expect(() => verifyCheckInvariants(EXPECTED_CHECK_INVARIANTS, actualChecks())).not.toThrow();
  });

  it("rejects a missing or extra CHECK with one static failure", () => {
    expect(checkFailure(actualChecks().slice(1))).toBe(DATABASE_CHECK_INVARIANTS_INVALID);
    const extra = Object.freeze({
      ...actualChecks()[0],
      constraintName: "synthetic_extra_check",
    });
    expect(checkFailure([...actualChecks(), extra])).toBe(DATABASE_CHECK_INVARIANTS_INVALID);
  });

  it("rejects a wrong table and a changed definition without catalog leakage", () => {
    const raw = "synthetic-definition-must-not-leak";
    expect(checkFailure(replaceCheck(0, { tableName: "WrongTable" })))
      .toBe(DATABASE_CHECK_INVARIANTS_INVALID);
    const message = checkFailure(replaceCheck(0, { definition: raw }));
    expect(message).toBe(DATABASE_CHECK_INVARIANTS_INVALID);
    expect(message).not.toContain(raw);
  });

  it("rejects same-name CHECK TRUE replacement", () => {
    expect(checkFailure(replaceCheck(0, { definition: "CHECK (true)" })))
      .toBe(DATABASE_CHECK_INVARIANTS_INVALID);
  });

  it.each([
    ["literal", "CHECK ((status = 'REJECTED'::\"CustomerRefundIntakeStatus\") = (\"approvedRefundAttemptId\" IS NOT NULL))"],
    ["operator", "CHECK ((status <> 'APPROVED'::\"CustomerRefundIntakeStatus\") = (\"approvedRefundAttemptId\" IS NOT NULL))"],
    ["cast", "CHECK ((status = 'APPROVED'::text) = (\"approvedRefundAttemptId\" IS NOT NULL))"],
    ["column", "CHECK ((status = 'APPROVED'::\"CustomerRefundIntakeStatus\") = (\"reviewedAt\" IS NOT NULL))"],
  ])("rejects a changed CHECK %s", (_case, definition) => {
    expect(checkFailure(replaceCheck(0, { definition })))
      .toBe(DATABASE_CHECK_INVARIANTS_INVALID);
  });

  it("rejects NOT VALID, wrong type, and duplicate actual identities", () => {
    expect(checkFailure(replaceCheck(0, { validated: false })))
      .toBe(DATABASE_CHECK_INVARIANTS_INVALID);
    expect(checkFailure(replaceCheck(0, { constraintType: "f" })))
      .toBe(DATABASE_CHECK_INVARIANTS_INVALID);
    expect(checkFailure([...actualChecks(), actualChecks()[0]]))
      .toBe(DATABASE_CHECK_INVARIANTS_INVALID);
  });

  it("rejects duplicate expected identities as a static manifest failure", () => {
    const duplicate = [...EXPECTED_CHECK_INVARIANTS, EXPECTED_CHECK_INVARIANTS[0]];
    expect(expectedManifestFailure(duplicate)).toBe(DATABASE_INVARIANT_MANIFEST_INVALID);
  });

  it("accepts PostgreSQL 18 and rejects adjacent majors statically", () => {
    expect(() => verifyPostgresVersion(180_000)).not.toThrow();
    expect(() => verifyPostgresVersion(189_999)).not.toThrow();
    expect(() => verifyPostgresVersion(170_000))
      .toThrow(DATABASE_INVARIANT_POSTGRES_VERSION_UNSUPPORTED);
    expect(() => verifyPostgresVersion(190_000))
      .toThrow(DATABASE_INVARIANT_POSTGRES_VERSION_UNSUPPORTED);
  });

  it("accepts the exact partial-index semantic state", () => {
    expect(() => verifyPartialIndexInvariant(EXPECTED_PARTIAL_INDEX, actualPartialIndex()))
      .not.toThrow();
  });

  it("rejects a missing or duplicate partial-index identity", () => {
    expect(partialIndexFailure([])).toBe(DATABASE_PARTIAL_INDEX_INVARIANT_INVALID);
    expect(partialIndexFailure([...actualPartialIndex(), ...actualPartialIndex()]))
      .toBe(DATABASE_PARTIAL_INDEX_INVARIANT_INVALID);
  });

  it.each([
    ["changed predicate", { predicate: "status = 'APPROVED'" }],
    ["removed predicate", { predicate: null }],
    ["non-unique", { unique: false }],
    ["invalid", { valid: false }],
    ["not ready", { ready: false }],
    ["changed columns", { orderedExpressions: ["status", `"orderId"`] }],
    ["wrong table", { tableName: "RefundAttempt" }],
    ["changed definition", { definition: "CREATE INDEX synthetic" }],
  ] satisfies readonly [string, Partial<CatalogPartialIndexRow>][]) (
    "rejects partial-index state: %s",
    (_case, override) => {
      expect(partialIndexFailure(actualPartialIndex(override)))
        .toBe(DATABASE_PARTIAL_INDEX_INVARIANT_INVALID);
    },
  );
});

function actualChecks(): readonly CatalogCheckRow[] {
  return EXPECTED_CHECK_INVARIANTS.map((entry) => Object.freeze({
    schemaName: entry.schemaName,
    tableName: entry.tableName,
    constraintName: entry.constraintName,
    constraintType: entry.constraintType,
    definition: entry.canonicalDefinition,
    validated: entry.validated,
  }));
}

function replaceCheck(
  index: number,
  override: Partial<CatalogCheckRow>,
): readonly CatalogCheckRow[] {
  return actualChecks().map((entry, position) => (
    position === index ? Object.freeze({ ...entry, ...override }) : entry
  ));
}

function checkFailure(actual: readonly CatalogCheckRow[]): string {
  try {
    verifyCheckInvariants(EXPECTED_CHECK_INVARIANTS, actual);
    return "UNEXPECTED_SUCCESS";
  } catch (error) {
    return error instanceof Error ? error.message : "NON_ERROR_FAILURE";
  }
}

function expectedManifestFailure(
  expected: Parameters<typeof verifyCheckInvariants>[0],
): string {
  try {
    verifyCheckInvariants(expected, actualChecks());
    return "UNEXPECTED_SUCCESS";
  } catch (error) {
    return error instanceof Error ? error.message : "NON_ERROR_FAILURE";
  }
}

function actualPartialIndex(
  override: Partial<CatalogPartialIndexRow> = {},
): readonly CatalogPartialIndexRow[] {
  return [Object.freeze({
    schemaName: EXPECTED_PARTIAL_INDEX.schemaName,
    tableName: EXPECTED_PARTIAL_INDEX.tableName,
    indexName: EXPECTED_PARTIAL_INDEX.indexName,
    unique: EXPECTED_PARTIAL_INDEX.unique,
    valid: EXPECTED_PARTIAL_INDEX.valid,
    ready: EXPECTED_PARTIAL_INDEX.ready,
    orderedExpressions: [...EXPECTED_PARTIAL_INDEX.orderedExpressions],
    predicate: EXPECTED_PARTIAL_INDEX.canonicalPredicate,
    definition: EXPECTED_PARTIAL_INDEX.canonicalDefinition,
    ...override,
  })];
}

function invariantClient() {
  const queryRaw = vi.fn();
  queryRaw
    .mockResolvedValueOnce([{ databaseName: ACCEPTANCE_DATABASE_NAME }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ serverVersionNum: 180_000 }])
    .mockResolvedValueOnce(actualChecks())
    .mockResolvedValueOnce(actualPartialIndex());
  return Object.freeze({ $queryRaw: queryRaw });
}

function partialIndexFailure(actual: readonly CatalogPartialIndexRow[]): string {
  try {
    verifyPartialIndexInvariant(EXPECTED_PARTIAL_INDEX, actual);
    return "UNEXPECTED_SUCCESS";
  } catch (error) {
    return error instanceof Error ? error.message : "NON_ERROR_FAILURE";
  }
}

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return Object.freeze(files);
}

function successfulGitResult(stdout: string) {
  return Object.freeze({
    exitCode: 0,
    signal: null,
    stdout,
    timedOut: false,
    outputExceeded: false,
  });
}

async function gitFailureMessage(
  runner: NonNullable<
    NonNullable<Parameters<typeof buildBaseLedgerIntegrity>[2]>["runGitIdentity"]
  >,
): Promise<string> {
  try {
    await buildBaseLedgerIntegrity(process.cwd(), "b".repeat(64), { runGitIdentity: runner });
    return "UNEXPECTED_SUCCESS";
  } catch (error) {
    return error instanceof Error ? error.message : "NON_ERROR_FAILURE";
  }
}

async function prismaFailureMessage(
  runner: Parameters<typeof defaultDriftCheck>[1],
): Promise<string> {
  try {
    await defaultDriftCheck(CONFIGURED_ACCEPTANCE_URL, runner);
    return "UNEXPECTED_SUCCESS";
  } catch (error) {
    return error instanceof Error ? error.message : "NON_ERROR_FAILURE";
  }
}

async function propagatedLedger(
  root: string,
  base: Awaited<ReturnType<typeof buildBaseLedgerIntegrity>>,
) {
  const store = new RunLedgerStore(join(root, RUN_ID, "ledger"));
  const planned = await appendRuntimeLedger(store, null, "PLANNED", { scenarioId: "S1" }, {
    ...base,
    scenarioInputHash: "c".repeat(64),
  });
  return appendRuntimeLedger(store, planned, "SEALED", { scenarioId: "S1" });
}

function sanitizedFailure(value: unknown): string {
  try {
    assertSanitizedEvidence(value);
    return "UNEXPECTED_SUCCESS";
  } catch (error) {
    return error instanceof Error ? error.message : "NON_ERROR_FAILURE";
  }
}

async function buildProviderReport(
  rawDirectory: string,
  scenarioId: "S1" | "S2" | "S3" | "S5" | "S6",
  resultCode: readonly string[] | null | undefined,
  options: Readonly<{
    posts?: readonly Readonly<{
      operationKey: string | null;
      canonicalBody: string | null;
    }>[];
    budgets?: Readonly<{ GET: number; POST: number }>;
    callRecords?: readonly BudgetRecord[];
  }> = {},
) {
  const defaultPostCount = scenarioId === "S3" ? 2 : 1;
  const posts = options.posts ?? Array.from({ length: defaultPostCount }, () => Object.freeze({
    canonicalBody: "{\"cancelAmount\":1000}",
    operationKey: "synthetic-operation",
  }));
  const fixture = Object.freeze({
    scenarioId,
    paymentKey: `synthetic-payment-${scenarioId}`,
    providerOrderId: `synthetic-order-${scenarioId}`,
    amount: 1_000,
    currency: "KRW" as const,
    reference: `synthetic-reference-${scenarioId}`,
  });
  const callRecords = options.callRecords ?? (scenarioId === "S3" && options.posts === undefined
    ? completeSanitizedS3History(Object.freeze({ ...fixture, scenarioId: "S3" }))
    : posts.map((post, index) => Object.freeze({
      scenarioId,
      kind: "POST" as const,
      phase: "INTENT" as const,
      sequence: index + 1,
      request: Object.freeze({
        path: "/v1/payments/synthetic/cancel",
        canonicalBody: post.canonicalBody,
        operationKey: post.operationKey,
        wireFingerprint: "e".repeat(64),
      }),
    })));
  const resultCodePayload = historicalResultCodePayload(resultCode);
  const ledger: H1Ledger = Object.freeze({
    formatVersion: "mira-toss-sbx-ledger/v1",
    revision: 1,
    previousLedgerHash: null,
    runId: RUN_ID,
    scenarioId,
    phase: "LOCAL_COMMIT_COMPLETE",
    repositoryCommit: "a".repeat(40),
    runnerSourceHash: "b".repeat(64),
    policyHashes: validEvidence().policyHashes,
    migrationFingerprint: "c".repeat(64),
    scenarioInputHash: "d".repeat(64),
    payload: Object.freeze({
      scenarioId,
      ...resultCodePayload,
      callRecords: Object.freeze(callRecords),
      budgets: Object.freeze(options.budgets ?? {
        GET: scenarioId === "S3" ? 2 : 0,
        POST: posts.length,
      }),
    }),
  });
  return buildSanitizedReport({
    client: db,
    ledger,
    scenarioId,
    fixture,
    hmacKey: Buffer.alloc(32, 7),
    rawDirectory,
    refund: null,
    now: new Date("2026-07-18T03:00:00.000Z"),
  });
}

function historicalResultCodePayload(
  resultCode: readonly string[] | null | undefined,
): Readonly<{ resultCode?: readonly string[] | null }> {
  if (resultCode === undefined) return Object.freeze({});
  if (resultCode === null) return Object.freeze({ resultCode: null });
  return Object.freeze({ resultCode: Object.freeze(resultCode.slice()) });
}

function identityCardinalityCases(): readonly Readonly<[
  string,
  readonly (string | null)[],
  boolean | null,
]>[] {
  return [
    ["zero values", [], null],
    ["one value", ["identity-A"], null],
    ["two matching values", ["identity-A", "identity-A"], true],
    ["two differing values", ["identity-A", "identity-B"], false],
    ["missing first value", [null, "identity-A"], null],
    ["missing second value", ["identity-A", null], null],
    ["both values missing", [null, null], null],
    ["three identical values", ["identity-A", "identity-A", "identity-A"], null],
    ["three mixed values", ["identity-A", "identity-B", "identity-A"], null],
  ];
}

function completeSanitizedS3History(
  fixture: Readonly<{
    scenarioId: "S3";
    paymentKey: string;
    providerOrderId: string;
    amount: number;
    currency: "KRW";
    reference: string;
  }>,
): readonly BudgetRecord[] {
  const expectation = createS3HistoryExpectation(RUN_ID, fixture);
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
  const classifications = [
    "INITIAL_GET_ELIGIBLE", "POST_ACCEPTED", "POST_ACCEPTED", "FINAL_GET_EXACT_SUCCESS",
  ] as const;
  return Object.freeze(kinds.flatMap((kind, index) => {
    const request = requests[index];
    const classification = classifications[index];
    if (!request || !classification) throw new Error("TEST_S3_HISTORY_INVALID");
    const sequence = index + 1;
    const identity = classification === "POST_ACCEPTED"
      || classification === "FINAL_GET_EXACT_SUCCESS" ? "9".repeat(64) : null;
    return [
      Object.freeze({ scenarioId: "S3" as const, kind, phase: "INTENT" as const, sequence, request }),
      Object.freeze({
        scenarioId: "S3" as const,
        kind,
        phase: "COMPLETED" as const,
        sequence,
        request,
        completionEvidence: Object.freeze({
          classification,
          transactionIdentityHmac: identity,
        }),
      }),
    ];
  }));
}

function mixedCardinalityRecords(kinds: readonly ("GET" | "POST")[]): readonly BudgetRecord[] {
  const get = protectedGetRequest("synthetic-payment-S3");
  const post = Object.freeze({
    path: "/v1/payments/synthetic-payment-S3/cancel",
    canonicalBody: "synthetic-canonical-body",
    operationKey: "synthetic-operation",
    wireFingerprint: "e".repeat(64),
  });
  return Object.freeze(kinds.map((kind, index) => Object.freeze({
    scenarioId: "S3" as const,
    kind,
    phase: "INTENT" as const,
    sequence: index + 1,
    request: kind === "GET" ? get : post,
  })));
}

function validEvidence() {
  return {
    formatVersion: "mira-toss-sbx-sanitized/v1",
    runId: RUN_ID,
    scenarioId: "S1",
    repositoryCommit: "a".repeat(40),
    policyHashes: {
      "docs/payment_policy/refund_execution_v1.md": "1".repeat(64),
      "docs/payment_policy/refund_execution_v2.md": "2".repeat(64),
      "docs/payment_policy/refund_execution_v3.md": "3".repeat(64),
      "docs/payment_policy/refund_execution_toss_v1.md": "4".repeat(64),
      "docs/payment_policy/refund_execution_toss_recovery_v1.md": "5".repeat(64),
    },
    runnerSourceHash: "b".repeat(64),
    migrationFingerprint: "c".repeat(64),
    scenarioInputHash: "d".repeat(64),
    startedAt: null,
    finishedAt: "2026-07-18T03:00:00.000Z",
    provider: "TOSS",
    mode: "SANDBOX",
    amount: 1_000,
    currency: "KRW",
    paymentKeyHmac: "6".repeat(64),
    operationKeyHmac: "7".repeat(64),
    wireFingerprintHmac: "8".repeat(64),
    transactionKeyHmac: "9".repeat(64),
    getCount: 0,
    postCount: 0,
    normalizedProviderOutcome: null,
    httpStatusClass: null,
    staticLocalResultCodes: [],
    localProjection: {
      commandStatus: null,
      attemptStatus: null,
      orderStatus: null,
      dispatchCount: 0,
      latestOrdinal: 0,
      contactProofCount: 0,
      evidenceCount: 0,
      transitionCount: 0,
      leaseCleared: true,
    },
    booleans: {
      sameOperationKey: true,
      sameBody: false,
      sameTransactionKey: null,
      singleCancellation: null,
      noSecondPost: false,
      recoveredByLookup: null,
      cleanupComplete: false,
    },
    rawArtifacts: [{ hash: "e".repeat(64), size: 128 }],
    scenarioLimitations: [],
    s6Executed: false,
    completionMarker: "SEALED",
  };
}
