import { spawn } from "node:child_process";
import type { PathLike } from "node:fs";
import {
  link, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const fileReadAudit = vi.hoisted(() => ({
  blockHmac: false,
  hmacFileHandleReadFiles: 0,
  hmacFileHandleReads: 0,
  hmacOpens: 0,
  hmacReadFiles: 0,
}));
const rootBoundaryAudit = vi.hoisted(() => ({
  active: false,
  artifactContentReads: 0,
  ledgerOrLockAccesses: 0,
  mutationCalls: 0,
}));
const rootIsolation = vi.hoisted(() => {
  const temporaryParent = process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? "/tmp";
  return Object.freeze({ home: `${temporaryParent}/mira-p3b-c3-home-${process.pid}` });
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => rootIsolation.home };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const isHmacPath = (path: PathLike): boolean =>
    resolve(String(path)).endsWith(`${sep}raw${sep}hmac.key`);
  const forbidHmacAccess = (
    path: PathLike,
    counter: "hmacFileHandleReadFiles" | "hmacFileHandleReads" | "hmacOpens" | "hmacReadFiles",
  ): void => {
    if (!fileReadAudit.blockHmac || !isHmacPath(path)) return;
    fileReadAudit[counter] += 1;
    throw new Error("TEST_HMAC_CONTENT_ACCESS_FORBIDDEN");
  };
  const wrapFileHandle = (
    path: PathLike,
    handle: Awaited<ReturnType<typeof actual.open>>,
  ): Awaited<ReturnType<typeof actual.open>> => new Proxy(handle, {
    get: (target, property) => {
      if (property === "read") {
        return (...args: Parameters<typeof target.read>) => {
          forbidHmacAccess(path, "hmacFileHandleReads");
          return target.read(...args);
        };
      }
      if (property === "readFile") {
        return (...args: Parameters<typeof target.readFile>) => {
          forbidHmacAccess(path, "hmacFileHandleReadFiles");
          return target.readFile(...args);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(value, target, args);
        return result;
      };
    },
  });
  const recordPathAccess = (path: PathLike): void => {
    if (!rootBoundaryAudit.active) return;
    const segments = String(path).split(/[\\/]/u);
    if (segments.includes("ledger") || segments.includes("locks")) {
      rootBoundaryAudit.ledgerOrLockAccesses += 1;
    }
  };
  const recordMutation = (): void => {
    if (rootBoundaryAudit.active) rootBoundaryAudit.mutationCalls += 1;
  };
  return {
    ...actual,
    chmod: (...args: Parameters<typeof actual.chmod>) => {
      recordMutation();
      return actual.chmod(...args);
    },
    link: (...args: Parameters<typeof actual.link>) => {
      recordMutation();
      return actual.link(...args);
    },
    lstat: (...args: Parameters<typeof actual.lstat>) => {
      recordPathAccess(args[0]);
      return actual.lstat(...args);
    },
    mkdir: (...args: Parameters<typeof actual.mkdir>) => {
      recordMutation();
      return actual.mkdir(...args);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      forbidHmacAccess(args[0], "hmacOpens");
      recordPathAccess(args[0]);
      recordMutation();
      return wrapFileHandle(args[0], await actual.open(...args));
    },
    readFile: (path: PathLike, options?: Parameters<typeof actual.readFile>[1]) => {
      forbidHmacAccess(path, "hmacReadFiles");
      recordPathAccess(path);
      if (rootBoundaryAudit.active) rootBoundaryAudit.artifactContentReads += 1;
      return actual.readFile(path, options);
    },
    readdir: (...args: Parameters<typeof actual.readdir>) => {
      recordPathAccess(args[0]);
      return actual.readdir(...args);
    },
    rename: (...args: Parameters<typeof actual.rename>) => {
      recordMutation();
      return actual.rename(...args);
    },
    rm: (...args: Parameters<typeof actual.rm>) => {
      recordMutation();
      return actual.rm(...args);
    },
    symlink: (...args: Parameters<typeof actual.symlink>) => {
      recordMutation();
      return actual.symlink(...args);
    },
    unlink: (...args: Parameters<typeof actual.unlink>) => {
      recordMutation();
      return actual.unlink(...args);
    },
    writeFile: (...args: Parameters<typeof actual.writeFile>) => {
      recordMutation();
      return actual.writeFile(...args);
    },
  };
});

const poisonedImport = (name: string): never => {
  throw new Error(`TEST_FORBIDDEN_IMPORT_${name}`);
};

vi.mock("dotenv/config", () => poisonedImport("DOTENV"));
vi.mock("@prisma/client", () => poisonedImport("PRISMA"));
vi.mock("@prisma/adapter-pg", () => poisonedImport("PRISMA_ADAPTER"));
vi.mock("pg", () => poisonedImport("PG"));
vi.mock("../../lib/db", () => poisonedImport("DATABASE_SINGLETON"));
vi.mock(
  "../../../scripts/refund-sandbox-acceptance/database-context",
  () => poisonedImport("DATABASE_CONTEXT"),
);
vi.mock(
  "../../../scripts/refund-sandbox-acceptance/credential-guard",
  () => poisonedImport("CREDENTIAL_GUARD"),
);
vi.mock(
  "../../lib/payment/refund/providers/toss/refund-cancellation-http",
  () => poisonedImport("CANCELLATION_ADAPTER"),
);
vi.mock(
  "../../lib/payment/refund/providers/toss/refund-lookup-http",
  () => poisonedImport("LOOKUP_ADAPTER"),
);
vi.mock(
  "../../../scripts/refund-sandbox-acceptance/scenario-orchestrator",
  () => poisonedImport("SCENARIO_ORCHESTRATION"),
);
vi.mock(
  "../../../scripts/refund-sandbox-acceptance/bootstrap",
  () => poisonedImport("BOOTSTRAP"),
);
vi.mock(
  "../../../scripts/refund-sandbox-acceptance/bootstrap-projection",
  () => poisonedImport("BOOTSTRAP_PROJECTION"),
);
vi.mock(
  "../../lib/payment/refund/run-refund-execution-worker-cycle",
  () => poisonedImport("REFUND_WORKER_CYCLE"),
);
vi.mock(
  "../../lib/payment/refund/worker-router",
  () => poisonedImport("REFUND_WORKER_ROUTER"),
);
import {
  H1_ARTIFACT_PARENT,
  H1ArtifactStore,
} from "../../../scripts/refund-sandbox-acceptance/artifact-store";
import {
  atomicWriteJson,
  publishPrivateTextNoClobber,
} from "../../../scripts/refund-sandbox-acceptance/atomic-files";
import { ProviderCallBudget } from "../../../scripts/refund-sandbox-acceptance/call-budget";
import {
  runCliAtRoot,
  runCliProcess,
} from "../../../scripts/refund-sandbox-acceptance/cli";
import { parseH1Command } from "../../../scripts/refund-sandbox-acceptance/contracts";
import {
  H1_FIXTURE_POPULATION_FILE,
  H1_FIXTURE_POPULATION_FORMAT_VERSION,
  FixturePopulationError,
  assertScenarioAuthorized,
  parseFixturePopulation,
  populateFixtures,
  readEffectiveFixtureAuthority,
  validateRetiredFixtureAuthority,
} from "../../../scripts/refund-sandbox-acceptance/fixture-population";
import {
  assertApprovalRegistryRootSafe,
  createTestFixturePopulationApprovalRegistry,
  type FixturePopulationApprovalRegistry,
} from "../../../scripts/refund-sandbox-acceptance/fixture-population-approval";
import {
  acquireExclusiveRunLock,
  acquireRunMutationLock,
  type AdvisoryLockClient,
  type RunMutationLock,
} from "../../../scripts/refund-sandbox-acceptance/exclusive-run-lock";
import {
  H1_FIXTURE_FORMAT_VERSION,
  H1_PROVIDER_TRUTH_NOTE,
  requiredS3Fixture,
  type FixtureManifest,
  type ProviderFixture,
} from "../../../scripts/refund-sandbox-acceptance/fixture-manifest";
import {
  fingerprintValidatedS3Target,
} from "../../../scripts/refund-sandbox-acceptance/fixture-target-fingerprint";
import { scenarioInputHash } from "../../../scripts/refund-sandbox-acceptance/integrity";
import { parseSanitizedEvidence } from "../../../scripts/refund-sandbox-acceptance/redaction";
import {
  ledgerHash, parseLedger, RunLedgerStore, type H1Ledger,
} from "../../../scripts/refund-sandbox-acceptance/run-ledger";

const TARGET = "sbx-20260720T010203Z-1111111111111111";
const SOURCE = "sbx-20260720T010101Z-2222222222222222";
const WITNESS = "sbx-20260720T010102Z-3333333333333333";
const ALTERNATE = "sbx-20260720T010103Z-4444444444444444";
const GOLDEN_DIGEST = "3b5189f36bf459598fc13b591e2c1a93c9701b649a6a11ec3de6909903dafe56";
const PRIVATE_CANARY = "c2-private-canary-7a9e4d";
const HMAC_CANARY = "synthetic-hmac-canary-c5";
const TEST_APPROVALS = testApprovalRegistry();
const roots: string[] = [];

beforeAll(async () => {
  await rm(rootIsolation.home, { recursive: true, force: true });
  await mkdir(H1_ARTIFACT_PARENT, { recursive: true, mode: 0o700 });
});

afterAll(async () => {
  await rm(rootIsolation.home, { recursive: true, force: true });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fileReadAudit.blockHmac = false;
  resetHmacContentAudit();
  rootBoundaryAudit.active = false;
  resetRootBoundaryAudit();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  for (const entry of await readdir(H1_ARTIFACT_PARENT)) {
    await rm(join(H1_ARTIFACT_PARENT, entry), { recursive: true, force: true });
  }
});

describe("mira-s3-preflight-target/v1", () => {
  const golden = Object.freeze({
    scenarioId: "S3" as const,
    paymentKey: "synthetic-payment-key",
    providerOrderId: "synthetic-order-id",
    amount: 1000,
    currency: "KRW" as const,
    reference: "synthetic-reference",
  });

  it("matches the independent literal golden vector", () => {
    expect(fingerprintValidatedS3Target(golden)).toBe(GOLDEN_DIGEST);
  });

  it.each([
    ["paymentKey", "synthetic-payment-key-changed"],
    ["providerOrderId", "synthetic-order-id-changed"],
    ["amount", 1001],
    ["currency", "JPY"],
    ["reference", "synthetic-reference-changed"],
  ] as const)("changes when %s changes", (key, value) => {
    expect(fingerprintValidatedS3Target({ ...golden, [key]: value }))
      .not.toBe(GOLDEN_DIGEST);
  });

  it("excludes target run identity", () => {
    const first = fullManifest(TARGET);
    const second = fullManifest("sbx-20260720T010203Z-0123456789abcdef");
    expect(fingerprintValidatedS3Target(requiredS3Fixture(first)))
      .toBe(fingerprintValidatedS3Target(requiredS3Fixture(second)));
  });
});

describe("append-only fixture population authority", () => {
  it("parses a recomputed envelope and rejects an injected digest", () => {
    const envelope = syntheticEnvelope(TARGET);
    expect(parseFixturePopulation(envelope, TARGET).stableTargetFingerprint).toBe(GOLDEN_DIGEST);
    expect(() => parseFixturePopulation({
      ...envelope, stableTargetFingerprint: "f".repeat(64),
    }, TARGET)).toThrow("FIXTURE_POPULATION_FINGERPRINT_INVALID");
  });

  it("populates successfully, keeps the template immutable, and exposes only durable S3 authority", async () => {
    const root = await temporaryRoot();
    const store = new H1ArtifactStore(root, TARGET);
    await store.initialize();
    await createRetiredRun(root, SOURCE, "S1");
    await createRetiredRun(root, WITNESS, "S2");
    const templateBefore = await readFile(store.path("fixtures.json"));
    const result = await runCliAtRoot([
      "populate-fixtures", "--run", TARGET, "--source-run", SOURCE,
      "--witness-run", WITNESS, "--scenario", "S3",
    ], confirmation(), root, process.cwd(), cliDependencies());

    const authority = await readEffectiveFixtureAuthority(
      store.runDirectory, TARGET, authorityDependencies(),
    );

    expect(result).toEqual({
      code: "FIXTURES_POPULATED",
      runId: TARGET,
      scenario: "S3",
      stableTargetFingerprint: GOLDEN_DIGEST,
    });
    expect(await readFile(store.path("fixtures.json"))).toEqual(templateBefore);
    expect(parseFixturePopulation(
      await readJson(store.path(H1_FIXTURE_POPULATION_FILE)), TARGET,
    )).toEqual(authority.population);
    expect(await readdir(store.path("ledger"))).toEqual([]);
    expect(await readdir(store.path("locks"))).toEqual([]);
    expect(authority.authorizedScenario).toBe("S3");
    expect(authority.manifest.fixtures.S1).not.toBeNull();
    expect(() => assertScenarioAuthorized(authority, "S3")).not.toThrow();
    for (const scenario of ["S1", "S2", "S4", "S5"] as const) {
      expect(() => assertScenarioAuthorized(authority, scenario))
        .toThrow("FIXTURE_SCENARIO_NOT_AUTHORIZED");
    }
  });

  const authorityTamperCases: readonly [
    string,
    (envelope: Record<string, unknown>) => void,
  ][] = [
    ["formatVersion", (envelope) => { envelope.formatVersion = "unsupported"; }],
    ["runId", (envelope) => { envelope.runId = ALTERNATE; }],
    ["authorizedScenario", (envelope) => { envelope.authorizedScenario = "S2"; }],
    ["sourceRunId", (envelope) => { envelope.sourceRunId = ALTERNATE; }],
    ["witnessRunId", (envelope) => { envelope.witnessRunId = ALTERNATE; }],
    ["stableTargetFingerprint", (envelope) => {
      envelope.stableTargetFingerprint = "f".repeat(64);
    }],
    ["nested manifest runId", (envelope) => { manifestRecord(envelope).runId = ALTERNATE; }],
    ["merchant binding", (envelope) => {
      manifestRecord(envelope).expectedMerchantAccountBinding = "merchant-changed";
    }],
    ["credential-generation binding", (envelope) => {
      manifestRecord(envelope).expectedCredentialGenerationBinding = "generation-changed";
    }],
    ["S1 fixture", (envelope) => { fixtureRecord(envelope, "S1").paymentKey = "changed-S1"; }],
    ["S2 fixture", (envelope) => { fixtureRecord(envelope, "S2").paymentKey = "changed-S2"; }],
    ["S3 paymentKey", (envelope) => {
      fixtureRecord(envelope, "S3").paymentKey = "changed-S3-payment";
    }],
    ["S3 providerOrderId", (envelope) => {
      fixtureRecord(envelope, "S3").providerOrderId = "changed-S3-order";
    }],
    ["S3 amount", (envelope) => { fixtureRecord(envelope, "S3").amount = 1001; }],
    ["S3 currency", (envelope) => { fixtureRecord(envelope, "S3").currency = "JPY"; }],
    ["S3 reference", (envelope) => {
      fixtureRecord(envelope, "S3").reference = "changed-S3-reference";
    }],
    ["S4 fixture", (envelope) => { fixtureRecord(envelope, "S4").reference = "changed-S4"; }],
    ["S5 fixture", (envelope) => { fixtureRecord(envelope, "S5").reference = "changed-S5"; }],
    ["providerTruthNote", (envelope) => { manifestRecord(envelope).providerTruthNote = "changed"; }],
    ["unknown top-level field", (envelope) => { envelope.unknownAuthority = true; }],
    ["unknown nested field", (envelope) => { fixtureRecord(envelope, "S3").unknown = true; }],
    ["missing required field", (envelope) => { delete envelope.sourceRunId; }],
    ["changed property type", (envelope) => { envelope.sourceRunId = 7; }],
    ["S3 fixture plus recomputed matching fingerprint", (envelope) => {
      fixtureRecord(envelope, "S3").paymentKey = "coordinated-payment-change";
      envelope.stableTargetFingerprint = fingerprintEnvelopeS3(envelope);
    }],
    ["merchant and generation bindings changed consistently", (envelope) => {
      const manifest = manifestRecord(envelope);
      manifest.expectedMerchantAccountBinding = "coordinated-merchant";
      manifest.expectedCredentialGenerationBinding = "coordinated-generation";
    }],
    ["source and witness IDs changed to valid alternatives", (envelope) => {
      envelope.sourceRunId = ALTERNATE;
      envelope.witnessRunId = "sbx-20260720T010104Z-5555555555555555";
    }],
    ["nested manifest and envelope provenance changed together", (envelope) => {
      envelope.runId = ALTERNATE;
      envelope.sourceRunId = "sbx-20260720T010104Z-5555555555555555";
      envelope.witnessRunId = "sbx-20260720T010105Z-6666666666666666";
      manifestRecord(envelope).runId = ALTERNATE;
    }],
  ];

  it.each(authorityTamperCases)(
    "rejects envelope authority tamper: %s before sensitive command boundaries",
    async (_name, mutate) => {
      const root = await temporaryRoot();
      const store = await createValidPopulation(root);
      const envelope = record(await readJson(store.path(H1_FIXTURE_POPULATION_FILE)));
      mutate(envelope);
      await atomicWriteJson(store.path(H1_FIXTURE_POPULATION_FILE), envelope);
      let sensitiveReads = 0;
      const env = new Proxy(Object.freeze({}), {
        get: (_target, property) => {
          if (property === "DATABASE_URL" || property === "TOSS_SANDBOX_SECRET_KEY") {
            sensitiveReads += 1;
          }
          return undefined;
        },
      });

      await expect(runCliAtRoot([
        "validate-fixtures", "--run", TARGET,
      ], env, root, process.cwd(), cliDependencies())).rejects.toThrow();

      expect(sensitiveReads).toBe(0);
      expect(await readdir(store.path("ledger"))).toEqual([]);
      expect(await readdir(store.path("locks"))).toEqual([]);
    },
  );

  it.each(["execute", "resume", "resume-post", "seal"] as const)(
    "rejects populated non-S3 %s before environment, ledger, lock, or runtime access",
    async (command) => {
      const root = await temporaryRoot();
      const store = await createValidPopulation(root);
      let sensitiveReads = 0;
      const env = new Proxy(Object.freeze({}), {
        get: (_target, property) => {
          if (property === "DATABASE_URL" || property === "TOSS_SANDBOX_SECRET_KEY") sensitiveReads += 1;
          return undefined;
        },
      });
      await expect(runCliAtRoot([
        command, "--run", TARGET, "--scenario", "S1",
      ], env, root, process.cwd(), cliDependencies()))
        .rejects.toThrow("FIXTURE_SCENARIO_NOT_AUTHORIZED");
      expect(sensitiveReads).toBe(0);
      expect(await readdir(store.path("ledger"))).toEqual([]);
      expect(await readdir(store.path("locks"))).toEqual([]);
    },
  );

  it("validates complete retired authority and rejects a forged terminal-only run", async () => {
    const root = await temporaryRoot();
    const valid = await createRetiredRun(root, SOURCE, "S1");
    await expect(validateRetiredFixtureAuthority(valid.runDirectory, SOURCE, "source"))
      .resolves.toMatchObject({ scenarioId: "S1" });

    const forged = new H1ArtifactStore(root, WITNESS);
    await forged.initialize();
    await atomicWriteJson(forged.path("fixtures.json"), fullManifest(WITNESS));
    await rm(forged.path("raw"), { recursive: true });
    const terminal = ledgerRecord(WITNESS, "S2", 1, "DB_CLEANED", null, {
      scenarioId: "S2", completionMarker: "SEALED", cleanupComplete: true,
    });
    await atomicWriteJson(forged.path("ledger", "revision-000001.json"), terminal);
    await atomicWriteJson(forged.path("ledger", "current.json"), terminal);
    await atomicWriteJson(forged.path("sealed", "S2.json"), { forged: true });
    await atomicWriteJson(forged.path("sanitized", "S2.json"), { forged: true });

    await expect(validateRetiredFixtureAuthority(forged.runDirectory, WITNESS, "witness"))
      .rejects.toThrow("FIXTURE_POPULATION_WITNESS_INVALID");
  });

  it.each([
    ["current/history disagreement", async (store: H1ArtifactStore) => {
      const first = await readLedger(store.path("ledger", "revision-000001.json"));
      await atomicWriteJson(store.path("ledger", "current.json"), first);
    }],
    ["broken revision chain", async (store: H1ArtifactStore) => {
      const path = store.path("ledger", "revision-000002.json");
      const value = await readLedger(path);
      await atomicWriteJson(path, { ...value, previousLedgerHash: "f".repeat(64) });
    }],
    ["report/ledger mismatch", async (store: H1ArtifactStore) => {
      const path = store.path("sealed", "S1.json");
      const value = parseSanitizedEvidence(await readJson(path));
      await atomicWriteJson(path, { ...value, repositoryCommit: "9".repeat(40) });
    }],
    ["report/manifest mismatch", async (store: H1ArtifactStore) => {
      const manifest = fullManifest(SOURCE);
      const fixture = manifest.fixtures.S1;
      if (!fixture) throw new Error("TEST_FIXTURE_REQUIRED");
      await atomicWriteJson(store.path("fixtures.json"), {
        ...manifest,
        fixtures: { ...manifest.fixtures, S1: { ...fixture, amount: fixture.amount + 1 } },
      });
    }],
    ["missing SEALED predecessor and illegal terminal jump", async (store: H1ArtifactStore) => {
      const first = await readLedger(store.path("ledger", "revision-000001.json"));
      const second = await readLedger(store.path("ledger", "revision-000002.json"));
      const terminal: H1Ledger = Object.freeze({
        ...second,
        revision: 3,
        previousLedgerHash: ledgerHash(second),
        phase: "DB_CLEANED",
        payload: Object.freeze({ ...second.payload, completionMarker: "SEALED", cleanupComplete: true }),
      });
      await rm(store.path("ledger", "revision-000003.json"));
      await rm(store.path("ledger", "revision-000004.json"));
      await atomicWriteJson(store.path("ledger", "revision-000001.json"), first);
      await atomicWriteJson(store.path("ledger", "revision-000003.json"), terminal);
      await atomicWriteJson(store.path("ledger", "current.json"), terminal);
    }],
  ] as const)("rejects retired authority with %s", async (_name, mutate) => {
    const root = await temporaryRoot();
    const store = await createRetiredRun(root, SOURCE, "S1");
    await mutate(store);
    await expect(validateRetiredFixtureAuthority(store.runDirectory, SOURCE, "source"))
      .rejects.toThrow("FIXTURE_POPULATION_SOURCE_INVALID");
  });

  it("rejects a target absent from the injected committed approval without publishing", async () => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    await createRetiredRun(root, SOURCE, "S1");
    await createRetiredRun(root, WITNESS, "S2");
    const template = await readFile(target.path("fixtures.json"));

    const absentApprovals = createTestFixturePopulationApprovalRegistry([]);
    await expect(populateFixtures(root, populationCommand(), confirmation(), {
      approvalRegistry: absentApprovals,
    })).rejects.toThrow("FIXTURE_POPULATION_APPROVAL_REQUIRED");
    expect(await readFile(target.path("fixtures.json"))).toEqual(template);
    expect(await pathExists(target.path(H1_FIXTURE_POPULATION_FILE))).toBe(false);
    expect(await readdir(target.path("locks"))).toEqual([]);
  });

  const retiredPostPublicationMutations: readonly [
    string,
    (root: string) => Promise<RunMutationLock | null>,
  ][] = [
    ["source ledger history changes", async (root) => {
      const store = new H1ArtifactStore(root, SOURCE);
      await atomicWriteJson(
        store.path("ledger", "revision-999999.json"),
        await readJson(store.path("ledger", "current.json")),
      );
      return null;
    }],
    ["witness ledger history changes", async (root) => {
      const store = new H1ArtifactStore(root, WITNESS);
      await atomicWriteJson(
        store.path("ledger", "revision-999999.json"),
        await readJson(store.path("ledger", "current.json")),
      );
      return null;
    }],
    ["source current pointer changes", async (root) => {
      const store = new H1ArtifactStore(root, SOURCE);
      await atomicWriteJson(
        store.path("ledger", "current.json"),
        await readJson(store.path("ledger", "revision-000001.json")),
      );
      return null;
    }],
    ["witness report changes", async (root) => {
      const store = new H1ArtifactStore(root, WITNESS);
      const report = record(await readJson(store.path("sealed", "S2.json")));
      report.repositoryCommit = "9".repeat(40);
      await atomicWriteJson(store.path("sealed", "S2.json"), report);
      return null;
    }],
    ["source manifest changes", async (root) => {
      const store = new H1ArtifactStore(root, SOURCE);
      const manifest = record(await readJson(store.path("fixtures.json")));
      manifest.expectedMerchantAccountBinding = "changed-after-publication";
      await atomicWriteJson(store.path("fixtures.json"), manifest);
      return null;
    }],
    ["witness manifest changes", async (root) => {
      const store = new H1ArtifactStore(root, WITNESS);
      const manifest = record(await readJson(store.path("fixtures.json")));
      manifest.expectedCredentialGenerationBinding = "changed-after-publication";
      await atomicWriteJson(store.path("fixtures.json"), manifest);
      return null;
    }],
    ["source gains a raw directory", async (root) => {
      await mkdir(join(root, SOURCE, "raw"), { mode: 0o700 });
      return null;
    }],
    ["witness gains a raw directory", async (root) => {
      await mkdir(join(root, WITNESS, "raw"), { mode: 0o700 });
      return null;
    }],
    ["source gains an active lock", async (root) => acquireRunMutationLock(
      join(root, SOURCE, "locks", "run.lock"), SOURCE, "database",
    )],
    ["witness gains an active lock", async (root) => acquireRunMutationLock(
      join(root, WITNESS, "locks", "run.lock"), WITNESS, "database",
    )],
  ];

  it.each(retiredPostPublicationMutations)(
    "revalidates retired authority when %s",
    async (_name, mutate) => {
      const root = await temporaryRoot();
      const target = await createValidPopulation(root);
      const lock = await mutate(root);
      try {
        await expect(readEffectiveFixtureAuthority(
          target.runDirectory, TARGET, authorityDependencies(),
        )).rejects.toThrow();
      } finally {
        await lock?.release();
      }
    },
  );

  it.each([
    [SOURCE, "fixtures.json"],
    [SOURCE, "ledger/revision-000001.json"],
    [SOURCE, "ledger/current.json"],
    [SOURCE, "sealed/S1.json"],
    [SOURCE, "sanitized/S1.json"],
    [WITNESS, "fixtures.json"],
    [WITNESS, "ledger/revision-000001.json"],
    [WITNESS, "ledger/current.json"],
    [WITNESS, "sealed/S2.json"],
    [WITNESS, "sanitized/S2.json"],
  ] as const)("revalidates and rejects a protected hard link for %s/%s", async (runId, relative) => {
    const root = await temporaryRoot();
    const target = await createValidPopulation(root);
    await link(join(root, runId, relative), join(root, `post-publication-alias-${runId}-${relative.replaceAll("/", "-")}`));
    await expect(readEffectiveFixtureAuthority(
      target.runDirectory, TARGET, authorityDependencies(),
    )).rejects.toThrow();
  });
});

describe("bounded committed fixture-population approval", () => {
  it("parses exact typed approvals and rejects duplicate target authority", () => {
    expect(TEST_APPROVALS.approvals).toEqual([{
      targetRunId: TARGET,
      authorizedScenario: "S3",
      sourceRunId: SOURCE,
      witnessRunId: WITNESS,
      stableTargetFingerprint: GOLDEN_DIGEST,
    }]);
    expect(() => createTestFixturePopulationApprovalRegistry([
      TEST_APPROVALS.approvals[0], TEST_APPROVALS.approvals[0],
    ])).toThrow("FIXTURE_POPULATION_APPROVAL_DUPLICATE_TARGET");
    expect(() => createTestFixturePopulationApprovalRegistry([{
      ...TEST_APPROVALS.approvals[0], unknown: true,
    }])).toThrow("FIXTURE_POPULATION_APPROVAL_INVALID");
    expect(() => createTestFixturePopulationApprovalRegistry([{
      ...TEST_APPROVALS.approvals[0], stableTargetFingerprint: 7,
    }])).toThrow("FIXTURE_POPULATION_APPROVAL_INVALID");
  });

  it("rejects canonical protected-root equality and descendants before every sensitive boundary", async () => {
    const protectedFixture = await createProtectedRootFixture();
    const aliasParent = await temporaryRoot();
    const exactAlias = join(aliasParent, "exact-alias");
    const directAlias = join(aliasParent, "direct-alias");
    const deepAlias = join(aliasParent, "deep-alias");
    const parentComponentAlias = join(aliasParent, "parent-component-alias");
    await symlink(H1_ARTIFACT_PARENT, exactAlias);
    await symlink(protectedFixture.direct, directAlias);
    await symlink(protectedFixture.deep, deepAlias);
    await symlink(protectedFixture.direct, parentComponentAlias);
    vi.stubEnv("MIRA_TEST_ONLY_ARTIFACT_ROOT", protectedFixture.deep);
    const environmentSuppliedCandidate = process.env.MIRA_TEST_ONLY_ARTIFACT_ROOT;
    if (!environmentSuppliedCandidate) throw new Error("TEST_ROOT_ENVIRONMENT_MISSING");
    const cases = [
      ["exact real root", H1_ARTIFACT_PARENT, "TEST_ACCEPTANCE_ROOT_FORBIDDEN"],
      ["exact real root with trailing separator", `${H1_ARTIFACT_PARENT}${sep}`, "TEST_ACCEPTANCE_ROOT_FORBIDDEN"],
      ["direct child", protectedFixture.direct, "TEST_ACCEPTANCE_ROOT_FORBIDDEN"],
      ["deep descendant", protectedFixture.deep, "TEST_ACCEPTANCE_ROOT_FORBIDDEN"],
      [
        "normalized child using dot-dot",
        `${protectedFixture.deep}${sep}..${sep}deep`,
        "TEST_ACCEPTANCE_ROOT_FORBIDDEN",
      ],
      [
        "relative descendant",
        relative(process.cwd(), protectedFixture.deep),
        "TEST_ACCEPTANCE_ROOT_FORBIDDEN",
      ],
      ["symlink to exact root", exactAlias, "TEST_ACCEPTANCE_ROOT_FORBIDDEN"],
      ["symlink to direct child", directAlias, "TEST_ACCEPTANCE_ROOT_FORBIDDEN"],
      ["symlink to deep descendant", deepAlias, "TEST_ACCEPTANCE_ROOT_FORBIDDEN"],
      [
        "path through a symlinked parent component",
        join(parentComponentAlias, "deep"),
        "TEST_ACCEPTANCE_ROOT_FORBIDDEN",
      ],
      [
        "environment-supplied descendant",
        environmentSuppliedCandidate,
        "TEST_ACCEPTANCE_ROOT_FORBIDDEN",
      ],
      [
        "nonexistent child with a canonical protected ancestor",
        join(protectedFixture.deep, "not-created"),
        "TEST_ACCEPTANCE_ROOT_INVALID",
      ],
    ] as const;

    fileReadAudit.blockHmac = true;
    for (const [name, root, expectedCode] of cases) {
      let environmentReads = 0;
      const env = new Proxy(Object.freeze({}), {
        get: () => {
          environmentReads += 1;
          return undefined;
        },
      });
      const before = await protectedTreeMetadata();
      resetRootBoundaryAudit();
      rootBoundaryAudit.active = true;
      try {
        await expect(populateFixtures(
          root, populationCommand(), env, populationDependencies(),
        ), name).rejects.toThrow(expectedCode);
        await expect(readEffectiveFixtureAuthority(
          join(root, TARGET), TARGET, authorityDependencies(),
        ), name).rejects.toThrow(expectedCode);
        await expect(runCliAtRoot([
          "status", "--run", TARGET,
        ], env, root, process.cwd(), cliDependencies()), name)
          .rejects.toThrow(expectedCode);
      } finally {
        rootBoundaryAudit.active = false;
      }
      expect(environmentReads, name).toBe(0);
      expect(hmacContentAudit(), name).toEqual(zeroHmacContentAudit());
      expect(rootBoundaryAudit.artifactContentReads, name).toBe(0);
      expect(rootBoundaryAudit.ledgerOrLockAccesses, name).toBe(0);
      expect(rootBoundaryAudit.mutationCalls, name).toBe(0);
      expect(await protectedTreeMetadata(), name).toEqual(before);
    }
  });

  it("allows canonical roots outside the protected tree without prefix confusion", async () => {
    await createProtectedRootFixture();
    const independent = await temporaryRoot();
    const independentChild = join(independent, "child");
    await mkdir(independentChild, { mode: 0o700 });
    const protectedParent = dirname(H1_ARTIFACT_PARENT);
    const sibling = join(protectedParent, "refund-sandbox-acceptance-sibling");
    const prefixSibling = `${H1_ARTIFACT_PARENT}-copy`;
    await mkdir(sibling, { mode: 0o700 });
    await mkdir(prefixSibling, { mode: 0o700 });
    roots.push(sibling, prefixSibling);
    const aliasParent = await temporaryRoot();
    const independentAlias = join(aliasParent, "independent-alias");
    await symlink(independentChild, independentAlias);
    const cases = [
      ["independent temporary directory", independent],
      ["child of an independent temporary directory", independentChild],
      ["sibling of the protected root", sibling],
      ["textual-prefix sibling", prefixSibling],
      ["symlink to an independent temporary directory", independentAlias],
      ["relative path outside the protected root", relative(process.cwd(), independentChild)],
      ["redundant dot components outside the protected root", `${independent}${sep}.${sep}child`],
    ] as const;
    const before = await protectedTreeMetadata();
    for (const [name, root] of cases) {
      await expect(assertApprovalRegistryRootSafe(TEST_APPROVALS, root), name).resolves.toBeUndefined();
    }
    expect(await protectedTreeMetadata()).toEqual(before);
  });

  it("fails closed with a fixed safe code when an injected root cannot be resolved", async () => {
    const independent = await temporaryRoot();
    await expect(assertApprovalRegistryRootSafe(
      TEST_APPROVALS, join(independent, "not-created"),
    )).rejects.toThrow(/^TEST_ACCEPTANCE_ROOT_INVALID$/u);
  });

  it("never opens or reads HMAC content across population and authority boundaries", async () => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    await writeFile(target.path("raw", "hmac.key"), HMAC_CANARY, { mode: 0o600 });
    await createRetiredRun(root, SOURCE, "S1");
    await createRetiredRun(root, WITNESS, "S2");
    const populationOutput = capturedOutput();
    fileReadAudit.blockHmac = true;
    expect(await runCliProcess([
      "populate-fixtures", "--run", TARGET, "--source-run", SOURCE,
      "--witness-run", WITNESS, "--scenario", "S3",
    ], confirmation(), {
      execute: (argv, env) => runCliAtRoot(
        argv, env, root, process.cwd(), cliDependencies(),
      ),
      writeStdout: populationOutput.writeStdout,
      writeStderr: populationOutput.writeStderr,
    })).toBe(0);
    expect((await lstat(target.path("raw", "hmac.key"))).isFile()).toBe(true);
    await expect(readEffectiveFixtureAuthority(
      target.runDirectory, TARGET, authorityDependencies(),
    )).resolves.toMatchObject({ authorizedScenario: "S3" });
    await expect(runCliAtRoot([
      "populate-fixtures", "--run", ALTERNATE, "--source-run", SOURCE,
      "--witness-run", WITNESS, "--scenario", "S3",
    ], Object.freeze({ MIRA_TOSS_SANDBOX_ACCEPTANCE_POPULATE_CONFIRM: ALTERNATE }),
    root, process.cwd(), cliDependencies()))
      .rejects.toThrow("FIXTURE_POPULATION_APPROVAL_REQUIRED");
    await expect(runCliAtRoot([
      "execute", "--run", TARGET, "--scenario", "S1",
    ], Object.freeze({}), root, process.cwd(), cliDependencies()))
      .rejects.toThrow("FIXTURE_SCENARIO_NOT_AUTHORIZED");

    const envelope = record(await readJson(target.path(H1_FIXTURE_POPULATION_FILE)));
    envelope.stableTargetFingerprint = "f".repeat(64);
    await atomicWriteJson(target.path(H1_FIXTURE_POPULATION_FILE), envelope);
    await expect(readEffectiveFixtureAuthority(
      target.runDirectory, TARGET, authorityDependencies(),
    )).rejects.toThrow("FIXTURE_POPULATION_FINGERPRINT_INVALID");
    const failureOutput = capturedOutput();
    expect(await runCliProcess([
      "validate-fixtures", "--run", TARGET,
    ], Object.freeze({}), {
      execute: (argv, env) => runCliAtRoot(
        argv, env, root, process.cwd(), cliDependencies(),
      ),
      writeStdout: failureOutput.writeStdout,
      writeStderr: failureOutput.writeStderr,
    })).toBe(1);
    expect(failureOutput.stdout()).toBe("");
    expect(failureOutput.stderr()).toBe("H1_COMMAND_FAILED\n");
    expect(`${populationOutput.combined()}${failureOutput.combined()}`).not.toContain(HMAC_CANARY);
    expect(`${populationOutput.combined()}${failureOutput.combined()}`).not.toContain(PRIVATE_CANARY);
    expect(hmacContentAudit()).toEqual(zeroHmacContentAudit());
  });

  it("fails the HMAC trap immediately when a synthetic callback opens the key", async () => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    fileReadAudit.blockHmac = true;

    await expect(open(target.path("raw", "hmac.key"), "r"))
      .rejects.toThrow("TEST_HMAC_CONTENT_ACCESS_FORBIDDEN");
    expect((await lstat(target.path("raw", "hmac.key"))).isFile()).toBe(true);
    expect(hmacContentAudit()).toEqual({
      hmacFileHandleReadFiles: 0,
      hmacFileHandleReads: 0,
      hmacOpens: 1,
      hmacReadFiles: 0,
    });
  });

  it.each([
    ["source", ALTERNATE, WITNESS],
    ["witness", SOURCE, ALTERNATE],
  ] as const)("rejects a CLI %s that differs from committed approval before mutation", async (
    _name, sourceRunId, witnessRunId,
  ) => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    const before = await readFile(target.path("fixtures.json"));
    await expect(runCliAtRoot([
      "populate-fixtures", "--run", TARGET, "--source-run", sourceRunId,
      "--witness-run", witnessRunId, "--scenario", "S3",
    ], confirmation(), root, process.cwd(), cliDependencies()))
      .rejects.toThrow("FIXTURE_POPULATION_APPROVAL_MISMATCH");
    expect(await readFile(target.path("fixtures.json"))).toEqual(before);
    expect(await readdir(target.path("locks"))).toEqual([]);
    expect(await pathExists(target.path(H1_FIXTURE_POPULATION_FILE))).toBe(false);
  });

  it("rejects an approval fingerprint not produced by independently validated sources", async () => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    await createRetiredRun(root, SOURCE, "S1");
    await createRetiredRun(root, WITNESS, "S2");
    const mismatched = testApprovalRegistry({ stableTargetFingerprint: "f".repeat(64) });
    await expect(populateFixtures(
      root, populationCommand(), confirmation(), populationDependencies(mismatched),
    )).rejects.toThrow("FIXTURE_POPULATION_PROTECTED_SOURCE_MISMATCH");
    expect(await pathExists(target.path(H1_FIXTURE_POPULATION_FILE))).toBe(false);
    expect(await readdir(target.path("locks"))).toEqual([]);
  });

  it.each([
    ["source", SOURCE],
    ["witness", WITNESS],
  ] as const)("rejects when the approved %s no longer validates", async (role, runId) => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    await createRetiredRun(root, SOURCE, "S1");
    await createRetiredRun(root, WITNESS, "S2");
    await mkdir(join(root, runId, "raw"), { mode: 0o700 });
    const expected = role === "source"
      ? "FIXTURE_POPULATION_SOURCE_INVALID"
      : "FIXTURE_POPULATION_WITNESS_INVALID";
    await expect(populateFixtures(
      root, populationCommand(), confirmation(), populationDependencies(),
    )).rejects.toThrow(expected);
    expect(await pathExists(target.path(H1_FIXTURE_POPULATION_FILE))).toBe(false);
    expect(await readdir(target.path("locks"))).toEqual([]);
  });

  it.each([
    ["missing confirmation", Object.freeze({})],
    ["wrong confirmation", Object.freeze({ MIRA_TOSS_SANDBOX_ACCEPTANCE_POPULATE_CONFIRM: ALTERNATE })],
    ["whitespace confirmation", Object.freeze({ MIRA_TOSS_SANDBOX_ACCEPTANCE_POPULATE_CONFIRM: `${TARGET} ` })],
  ] as const)("rejects %s before acquiring a mutation lock", async (_name, env) => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    await expect(populateFixtures(
      root, populationCommand(), env, populationDependencies(),
    )).rejects.toThrow("FIXTURE_POPULATION_CONFIRMATION_REQUIRED");
    expect(await readdir(target.path("locks"))).toEqual([]);
    expect(await pathExists(target.path(H1_FIXTURE_POPULATION_FILE))).toBe(false);
  });

  it.each([
    "DATABASE_URL",
    "TOSS_SANDBOX_SECRET_KEY",
    "TOSS_LIVE_SECRET_KEY",
    "PAYMENT_LIVE_MARKETS",
    "TOSS_SANDBOX_EXTERNAL_ENABLED",
    "MIRA_TOSS_SANDBOX_ACCEPTANCE_CONFIRM",
    "MIRA_TOSS_SANDBOX_ACCEPTANCE_CLEANUP_CONFIRM",
    "MIRA_TOSS_SANDBOX_ACCEPTANCE_PURGE_CONFIRM",
    "REFUND_EXECUTION_KR_ENABLED",
  ])("rejects inherited capability %s before protected artifact reads or mutation", async (name) => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    const env = Object.freeze({
      ...confirmation(),
      [name]: "privacy-canary-capability-value",
    });
    const expected = name === "DATABASE_URL"
      ? "FIXTURE_POPULATION_DATABASE_CAPABILITY_PRESENT"
      : "FIXTURE_POPULATION_LIVE_CAPABILITY_PRESENT";
    await expect(populateFixtures(
      root, populationCommand(), env, populationDependencies(),
    )).rejects.toThrow(expected);
    expect(await readdir(target.path("locks"))).toEqual([]);
    expect(await pathExists(target.path(H1_FIXTURE_POPULATION_FILE))).toBe(false);
  });
});

describe("fixture-population CLI privacy", () => {
  it("emits only the bounded success result from the production population path", async () => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    await createRetiredRun(root, SOURCE, "S1");
    await createRetiredRun(root, WITNESS, "S2");
    const output = capturedOutput();
    const argv = [
      "populate-fixtures", "--run", TARGET, "--source-run", SOURCE,
      "--witness-run", WITNESS, "--scenario", "S3",
    ] as const;
    const exitCode = await runCliProcess(argv, confirmation(), {
      execute: (args, env) => runCliAtRoot(
        args, env, root, process.cwd(), cliDependencies(),
      ),
      writeStdout: output.writeStdout,
      writeStderr: output.writeStderr,
    });
    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(JSON.parse(output.stdout())).toEqual({
      code: "FIXTURES_POPULATED",
      runId: TARGET,
      scenario: "S3",
      stableTargetFingerprint: GOLDEN_DIGEST,
    });
    expect(output.combined()).not.toContain(PRIVATE_CANARY);
    expect(output.combined()).not.toContain(SOURCE);
    expect(output.combined()).not.toContain(WITNESS);
    expect(output.combined()).not.toContain("synthetic-payment-key");
    expect(output.combined()).not.toContain("synthetic-order-id");
    expect(output.combined()).not.toContain("synthetic-reference");
  });

  it.each([
    "FIXTURE_POPULATION_APPROVAL_REQUIRED",
    "FIXTURE_POPULATION_APPROVAL_MISMATCH",
    "FIXTURE_POPULATION_CONFIRMATION_REQUIRED",
    "FIXTURE_POPULATION_DATABASE_CAPABILITY_PRESENT",
    "FIXTURE_POPULATION_LIVE_CAPABILITY_PRESENT",
    "FIXTURE_POPULATION_TARGET_INVALID",
    "FIXTURE_POPULATION_TARGET_NOT_EMPTY",
    "FIXTURE_POPULATION_TARGET_NOT_TEMPLATE",
    "FIXTURE_POPULATION_SOURCE_INVALID",
    "FIXTURE_POPULATION_WITNESS_INVALID",
    "FIXTURE_POPULATION_SOURCE_NOT_RETIRED",
    "FIXTURE_POPULATION_PROTECTED_SOURCE_MISMATCH",
    "FIXTURE_POPULATION_CONCURRENT_MUTATION",
    "FIXTURE_POPULATION_ALREADY_COMPLETED",
    "FIXTURE_POPULATION_ATOMIC_WRITE_FAILED",
    "FIXTURE_POPULATION_PUBLICATION_AMBIGUOUS",
    "FIXTURE_POPULATION_LOCK_INTEGRITY_FAILED",
    "FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED",
    "FIXTURE_POPULATION_AUTHORITY_MISMATCH",
  ])("renders static safe error class %s without stdout or cause leakage", async (code) => {
    const output = capturedOutput();
    const exitCode = await runCliProcess([], {}, {
      execute: () => Promise.reject(new FixturePopulationError(code, {
        cause: new Error(PRIVATE_CANARY),
      })),
      writeStdout: output.writeStdout,
      writeStderr: output.writeStderr,
    });
    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toBe(`${code}\n`);
    expect(output.combined()).not.toContain(PRIVATE_CANARY);
  });

  it("renders parser and unexpected filesystem failures as static safe output", async () => {
    const parser = capturedOutput();
    expect(await runCliProcess([
      "populate-fixtures", "--run", TARGET, "--source-run", SOURCE,
      "--witness-run", WITNESS, "--scenario", "S2",
    ], {}, {
      execute: (argv, env) => runCliAtRoot(argv, env, "/unused"),
      writeStdout: parser.writeStdout,
      writeStderr: parser.writeStderr,
    })).toBe(1);
    expect(parser.stdout()).toBe("");
    expect(parser.stderr()).toBe("FIXTURE_POPULATION_SCENARIO_UNSUPPORTED\n");

    const filesystem = capturedOutput();
    expect(await runCliProcess([], {}, {
      execute: () => Promise.reject(new Error(PRIVATE_CANARY)),
      writeStdout: filesystem.writeStdout,
      writeStderr: filesystem.writeStderr,
    })).toBe(1);
    expect(filesystem.stdout()).toBe("");
    expect(filesystem.stderr()).toBe("H1_COMMAND_FAILED\n");
    expect(filesystem.combined()).not.toContain(PRIVATE_CANARY);
  });
});

describe("ordinary production CLI approval registry boundary", () => {
  it("permits test-only injection but rejects the same target through the ordinary CLI", async () => {
    const injectedRoot = await temporaryRoot();
    const injectedTarget = await createValidPopulation(injectedRoot);
    expect(await pathExists(injectedTarget.path(H1_FIXTURE_POPULATION_FILE))).toBe(true);

    const fakeHome = await temporaryRoot();
    const ordinaryRoot = join(fakeHome, ".mira", "refund-sandbox-acceptance");
    await mkdir(ordinaryRoot, { recursive: true, mode: 0o700 });
    const externalRegistryPath = join(fakeHome, "operator-approval-registry.json");
    const serializedRegistry = JSON.stringify(TEST_APPROVALS);
    const operatorCanary = "operator-registry-canary-c5";
    const argv = [
      "populate-fixtures", "--run", TARGET, "--source-run", SOURCE,
      "--witness-run", WITNESS, "--scenario", "S3",
    ] as const;
    const env = Object.freeze({
      HOME: fakeHome,
      TMPDIR: fakeHome,
      NODE_ENV: "test",
      MIRA_TOSS_SANDBOX_ACCEPTANCE_POPULATE_CONFIRM: TARGET,
      MIRA_FIXTURE_POPULATION_APPROVAL_REGISTRY: serializedRegistry,
      MIRA_FIXTURE_POPULATION_APPROVAL_PATH: externalRegistryPath,
      MIRA_TEST_ONLY_FIXTURE_POPULATION_APPROVALS: serializedRegistry,
      MIRA_TEST_ONLY_APPROVAL_REGISTRY_PATH: externalRegistryPath,
      MIRA_TEST_ONLY_ARTIFACT_ROOT: injectedRoot,
      MIRA_OPERATOR_APPROVAL_CANARY: operatorCanary,
      NODE_NO_WARNINGS: "1",
    });

    const ordinary = await ordinaryCliOutput(argv, env);
    expect(ordinary).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "FIXTURE_POPULATION_APPROVAL_REQUIRED\n",
    });
    const extraFlag = await ordinaryCliOutput([
      ...argv, "--approval-registry", externalRegistryPath,
    ], env);
    expect(extraFlag).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "H1_COMMAND_FAILED\n",
    });
    const combined = `${ordinary.stdout}${ordinary.stderr}${extraFlag.stdout}${extraFlag.stderr}`;
    for (const protectedValue of [
      operatorCanary,
      serializedRegistry,
      externalRegistryPath,
      fakeHome,
      injectedRoot,
      PRIVATE_CANARY,
      HMAC_CANARY,
    ]) {
      expect(combined).not.toContain(protectedValue);
    }
    expect(await pathExists(externalRegistryPath)).toBe(false);
    expect(await readdir(ordinaryRoot)).toEqual([]);
    expect(await pathExists(join(ordinaryRoot, TARGET))).toBe(false);
  });
});

describe("no-clobber publication", () => {
  it.each([
    "afterPublish",
    "afterFirstDirectorySync",
    "afterTemporaryRemoval",
  ] as const)("maps committed failure at %s to a population ambiguity", async (hook) => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    await createRetiredRun(root, SOURCE, "S1");
    await createRetiredRun(root, WITNESS, "S2");
    await expect(populateFixtures(root, populationCommand(), confirmation(), {
      ...populationDependencies(),
      publication: ambiguousPublicationDependencies(hook),
    })).rejects.toThrow("FIXTURE_POPULATION_PUBLICATION_AMBIGUOUS");
    expect(await pathExists(target.path(H1_FIXTURE_POPULATION_FILE))).toBe(true);
    expect(await readdir(target.path("locks"))).toEqual([]);
  });

  it("publishes once, fsyncs through alias removal, and leaves nlink one", async () => {
    const root = await temporaryRoot();
    const final = join(root, "fixture-population.json");
    await publishPrivateTextNoClobber(final, "candidate\n", owner(), async (temporary) => {
      expect(await readFile(temporary, "utf8")).toBe("candidate\n");
    });
    expect(await readFile(final, "utf8")).toBe("candidate\n");
    expect((await lstat(final)).nlink).toBe(1);
    expect((await readdir(root)).filter((name) => name.includes("population-tmp"))).toEqual([]);
  });

  it("does not overwrite a final created immediately before publication", async () => {
    const root = await temporaryRoot();
    const final = join(root, "fixture-population.json");
    await expect(publishPrivateTextNoClobber(
      final, "candidate\n", owner(), () => Promise.resolve(),
      { beforePublish: () => writeFile(final, "concurrent\n", { mode: 0o600 }) },
    )).rejects.toMatchObject({ state: "ALREADY_EXISTS" });
    expect(await readFile(final, "utf8")).toBe("concurrent\n");
  });

  it("distinguishes pre-publication failure from committed ambiguity", async () => {
    const root = await temporaryRoot();
    const absent = join(root, "absent.json");
    await expect(publishPrivateTextNoClobber(
      absent, "candidate\n", owner(), () => Promise.reject(new Error("invalid candidate")),
    )).rejects.toMatchObject({ state: "NOT_COMMITTED" });
    expect(await pathExists(absent)).toBe(false);

    const ambiguous = join(root, "ambiguous.json");
    await expect(publishPrivateTextNoClobber(
      ambiguous, "candidate\n", owner(), () => Promise.resolve(),
      { afterPublish: () => Promise.reject(new Error("uncertain durability")) },
    )).rejects.toMatchObject({ state: "COMMITTED_AMBIGUOUS" });
    expect(await pathExists(ambiguous)).toBe(true);
    expect((await lstat(ambiguous)).nlink).toBe(2);
  });

  it("allows exactly one subprocess publisher without overwriting the winner", async () => {
    const root = await temporaryRoot();
    const final = join(root, "fixture-population.json");
    const script = [
      'import {publishPrivateTextNoClobber} from "./scripts/refund-sandbox-acceptance/atomic-files.ts";',
      'const [path,body]=process.argv.slice(1);',
      'publishPrivateTextNoClobber(path,`${body}\\n`,process.geteuid(),async()=>undefined)',
      '.then(()=>process.stdout.write("won")).catch(()=>process.stdout.write("lost"));',
    ].join("");
    const [first, second] = await Promise.all([
      childOutput(["--import", "tsx", "-e", script, final, "first"]),
      childOutput(["--import", "tsx", "-e", script, final, "second"]),
    ]);
    expect([first, second].sort()).toEqual(["lost", "won"]);
    expect(["first\n", "second\n"]).toContain(await readFile(final, "utf8"));
    expect((await lstat(final)).nlink).toBe(1);
  });
});

describe("protected files and direct run-lock ownership", () => {
  it.each([
    ["target template", async (root: string, target: H1ArtifactStore) => {
      await link(target.path("fixtures.json"), join(root, "template-alias"));
      await createRetiredRun(root, SOURCE, "S1");
      await createRetiredRun(root, WITNESS, "S2");
      await atomicWriteJson(target.path(H1_FIXTURE_POPULATION_FILE), syntheticEnvelope(TARGET));
      return readEffectiveFixtureAuthority(target.runDirectory, TARGET, authorityDependencies());
    }],
    ["population artifact", async (root: string, target: H1ArtifactStore) => {
      await createRetiredRun(root, SOURCE, "S1");
      await createRetiredRun(root, WITNESS, "S2");
      await atomicWriteJson(target.path(H1_FIXTURE_POPULATION_FILE), syntheticEnvelope(TARGET));
      await link(target.path(H1_FIXTURE_POPULATION_FILE), join(root, "population-alias"));
      return readEffectiveFixtureAuthority(target.runDirectory, TARGET, authorityDependencies());
    }],
    ["HMAC metadata", async (root: string, target: H1ArtifactStore) => {
      await createRetiredRun(root, SOURCE, "S1");
      await createRetiredRun(root, WITNESS, "S2");
      await link(target.path("raw", "hmac.key"), join(root, "hmac-alias"));
      return populateFixtures(root, populationCommand(), confirmation(), populationDependencies());
    }],
  ] as const)("rejects a hard-linked %s without rewriting it", async (_name, operation) => {
    const root = await temporaryRoot();
    const target = new H1ArtifactStore(root, TARGET);
    await target.initialize();
    const before = await readFile(target.path("fixtures.json"));
    await expect(operation(root, target)).rejects.toThrow();
    expect(await readFile(target.path("fixtures.json"))).toEqual(before);
  });

  it.each([
    ["source manifest", "fixtures.json"],
    ["ledger revision", "ledger/revision-000001.json"],
    ["current pointer", "ledger/current.json"],
    ["sealed report", "sealed/S1.json"],
    ["sanitized report", "sanitized/S1.json"],
  ] as const)("rejects a hard-linked retired %s", async (_name, relative) => {
    const root = await temporaryRoot();
    const store = await createRetiredRun(root, SOURCE, "S1");
    await link(join(store.runDirectory, relative), join(root, `alias-${relative.replaceAll("/", "-")}`));
    await expect(validateRetiredFixtureAuthority(store.runDirectory, SOURCE, "source"))
      .rejects.toThrow("FIXTURE_POPULATION_SOURCE_INVALID");
  });

  it("fails closed when a hard-link alias is added to a held lock", async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, "run.lock");
    const alias = join(root, "lock-alias");
    const lock = await acquireRunMutationLock(lockPath, TARGET, "fixture-population");
    await link(lockPath, alias);
    await expect(lock.assertHeld()).rejects.toThrow("RUN_MUTATION_LOCK_INTEGRITY_FAILED");
    await expect(lock.release()).rejects.toThrow("RUN_MUTATION_LOCK_INTEGRITY_FAILED");
    expect(await pathExists(lockPath)).toBe(true);
    expect(await pathExists(alias)).toBe(true);
  });

  it("never removes a replacement at the canonical lock path", async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, "run.lock");
    const held = join(root, "held-original");
    const lock = await acquireRunMutationLock(lockPath, TARGET, "database");
    await rename(lockPath, held);
    await writeFile(lockPath, "replacement\n", { mode: 0o600 });
    await expect(lock.release()).rejects.toThrow("RUN_MUTATION_LOCK_INTEGRITY_FAILED");
    expect(await readFile(lockPath, "utf8")).toBe("replacement\n");
    expect(await pathExists(held)).toBe(true);
  });

  it("leaves a terminated owner's lock observable and never auto-recovers it", async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, "run.lock");
    const script = [
      'import {acquireRunMutationLock} from "./scripts/refund-sandbox-acceptance/exclusive-run-lock.ts";',
      'await acquireRunMutationLock(process.argv[1],process.argv[2],"database");',
    ].join("");
    await childOutput(["--import", "tsx", "-e", script, lockPath, TARGET]);
    expect(await pathExists(lockPath)).toBe(true);
    await expect(acquireRunMutationLock(lockPath, TARGET, "database"))
      .rejects.toThrow("RUN_MUTATION_LOCK_UNAVAILABLE");
  });

  it("allows exactly one subprocess lock owner and a loser never removes the winner", async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, "run.lock");
    const script = [
      'import {acquireRunMutationLock} from "./scripts/refund-sandbox-acceptance/exclusive-run-lock.ts";',
      'try{const lock=await acquireRunMutationLock(process.argv[1],process.argv[2],"database");',
      'process.stdout.write("won");await new Promise(resolve=>setTimeout(resolve,150));await lock.release();}',
      'catch{process.stdout.write("lost");}',
    ].join("");
    const [first, second] = await Promise.all([
      childOutput(["--import", "tsx", "-e", script, lockPath, TARGET]),
      childOutput(["--import", "tsx", "-e", script, lockPath, TARGET]),
    ]);
    expect([first, second].sort()).toEqual(["lost", "won"]);
    expect(await pathExists(lockPath)).toBe(false);
  });

  it("releases the file lock only across provider contact and reacquires before completion", async () => {
    const events: string[] = [];
    const budget = new ProviderCallBudget(
      (record) => {
        events.push(`record:${record.phase}`);
        return Promise.resolve();
      },
      [],
      undefined,
      undefined,
      async (contact) => {
        events.push("lock:released");
        const result = await contact();
        events.push("lock:reacquired");
        return result;
      },
    );
    await budget.invoke("S1", "GET", () => {
      events.push("provider:contact");
      return Promise.resolve("ok");
    });
    expect(events).toEqual([
      "record:INTENT", "lock:released", "provider:contact", "lock:reacquired", "record:COMPLETED",
    ]);
  });

  it("holds advisory authority through the complete production intent/contact/completion lock path", async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, "run.lock");
    const advisory = new FakeAdvisoryLockClient();
    const lock = await acquireExclusiveRunLock(advisory, lockPath, TARGET);
    const events: string[] = [];
    let providerCalls = 0;
    const budget = new ProviderCallBudget(
      async (entry) => {
        expect(advisory.held).toBe(true);
        expect(await pathExists(lockPath)).toBe(true);
        events.push(`evidence:${entry.phase}`);
      },
      [],
      undefined,
      undefined,
      lock.runProviderContact,
    );
    await budget.invoke("S1", "POST", async () => {
      providerCalls += 1;
      expect(advisory.held).toBe(true);
      expect(await pathExists(lockPath)).toBe(false);
      events.push("provider:contact");
      return "provider-result";
    });
    expect(providerCalls).toBe(1);
    expect(events).toEqual([
      "evidence:INTENT", "provider:contact", "evidence:COMPLETED",
    ]);
    expect(await pathExists(lockPath)).toBe(true);
    await lock.release();
    expect(advisory.held).toBe(false);
    expect(await pathExists(lockPath)).toBe(false);
  });

  it("leaves incomplete evidence and prevents a duplicate provider call when completion lock reacquisition fails", async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, "run.lock");
    const advisory = new FakeAdvisoryLockClient();
    const lock = await acquireExclusiveRunLock(advisory, lockPath, TARGET);
    const evidence: string[] = [];
    let providerCalls = 0;
    const budget = new ProviderCallBudget(
      (entry) => {
        evidence.push(entry.phase);
        return Promise.resolve();
      },
      [],
      undefined,
      undefined,
      lock.runProviderContact,
    );
    await expect(budget.invoke("S1", "POST", async () => {
      providerCalls += 1;
      expect(advisory.held).toBe(true);
      expect(await pathExists(lockPath)).toBe(false);
      await writeFile(lockPath, "replacement lock\n", { mode: 0o600 });
      return "provider-result";
    })).rejects.toThrow("RUN_MUTATION_LOCK_REACQUIRE_FAILED");
    expect(evidence).toEqual(["INTENT"]);
    expect(providerCalls).toBe(1);
    await expect(budget.invoke("S1", "POST", () => {
      providerCalls += 1;
      return Promise.resolve("forbidden-duplicate");
    })).rejects.toThrow("PROVIDER_BUDGET_EXCEEDED");
    expect(providerCalls).toBe(1);
    await lock.release();
    expect(advisory.held).toBe(false);
    expect(await readFile(lockPath, "utf8")).toBe("replacement lock\n");
    await rm(lockPath);
  });
});

function syntheticEnvelope(runId: string) {
  const manifest = fullManifest(runId);
  return Object.freeze({
    formatVersion: H1_FIXTURE_POPULATION_FORMAT_VERSION,
    runId,
    authorizedScenario: "S3",
    sourceRunId: SOURCE,
    witnessRunId: WITNESS,
    stableTargetFingerprint: fingerprintValidatedS3Target(requiredS3Fixture(manifest)),
    manifest,
  });
}

function testApprovalRegistry(
  overrides: Partial<Readonly<{
    targetRunId: string;
    authorizedScenario: "S3";
    sourceRunId: string;
    witnessRunId: string;
    stableTargetFingerprint: string;
  }>> = Object.freeze({}),
): FixturePopulationApprovalRegistry {
  return createTestFixturePopulationApprovalRegistry([Object.freeze({
    targetRunId: TARGET,
    authorizedScenario: "S3",
    sourceRunId: SOURCE,
    witnessRunId: WITNESS,
    stableTargetFingerprint: GOLDEN_DIGEST,
    ...overrides,
  })]);
}

function populationDependencies(
  approvalRegistry = TEST_APPROVALS,
) {
  return Object.freeze({ approvalRegistry });
}

function authorityDependencies(
  approvalRegistry = TEST_APPROVALS,
) {
  return Object.freeze({ approvalRegistry });
}

function cliDependencies(approvalRegistry = TEST_APPROVALS) {
  return Object.freeze({
    fixturePopulation: populationDependencies(approvalRegistry),
    fixtureAuthority: authorityDependencies(approvalRegistry),
  });
}

function ambiguousPublicationDependencies(
  hook: "afterPublish" | "afterFirstDirectorySync" | "afterTemporaryRemoval",
) {
  const fail = (): Promise<void> => Promise.reject(new Error("injected durability failure"));
  if (hook === "afterPublish") return Object.freeze({ afterPublish: fail });
  if (hook === "afterFirstDirectorySync") {
    return Object.freeze({ afterFirstDirectorySync: fail });
  }
  return Object.freeze({ afterTemporaryRemoval: fail });
}

function capturedOutput() {
  let stdout = "";
  let stderr = "";
  return Object.freeze({
    writeStdout: (value: string): void => { stdout += value; },
    writeStderr: (value: string): void => { stderr += value; },
    stdout: (): string => stdout,
    stderr: (): string => stderr,
    combined: (): string => `${stdout}${stderr}`,
  });
}

class FakeAdvisoryLockClient implements AdvisoryLockClient {
  held = false;

  query(
    text: string,
    _values: unknown[],
  ): Promise<Readonly<{
    rows: readonly Readonly<{ acquired?: unknown; released?: unknown }>[];
  }>> {
    if (text.includes("pg_try_advisory_lock")) {
      const acquired = !this.held;
      this.held = this.held || acquired;
      return Promise.resolve(Object.freeze({
        rows: Object.freeze([Object.freeze({ acquired })]),
      }));
    }
    if (text.includes("pg_advisory_unlock")) {
      this.held = false;
      return Promise.resolve(Object.freeze({
        rows: Object.freeze([Object.freeze({ released: true })]),
      }));
    }
    return Promise.reject(new Error("TEST_UNEXPECTED_ADVISORY_QUERY"));
  }
}

function fullManifest(runId: string): FixtureManifest {
  return Object.freeze({
    formatVersion: H1_FIXTURE_FORMAT_VERSION,
    runId,
    expectedMerchantAccountBinding: `${PRIVATE_CANARY}-merchant`,
    expectedCredentialGenerationBinding: `${PRIVATE_CANARY}-generation`,
    providerTruthNote: H1_PROVIDER_TRUTH_NOTE,
    fixtures: Object.freeze({
      S1: fixture("S1", 1_001),
      S2: fixture("S2", 1_002),
      S3: Object.freeze({
        scenarioId: "S3", paymentKey: "synthetic-payment-key",
        providerOrderId: "synthetic-order-id", amount: 1000,
        currency: "KRW", reference: "synthetic-reference",
      }),
      S4: fixture("S4", 1_004),
      S5: fixture("S5", 1_005),
      S6: null,
    }),
  });
}

function fixture(
  scenarioId: "S1" | "S2" | "S4" | "S5",
  amount: number,
): ProviderFixture {
  return Object.freeze({
    scenarioId,
    paymentKey: `${PRIVATE_CANARY}-payment-${scenarioId}`,
    providerOrderId: `${PRIVATE_CANARY}-order-${scenarioId}`,
    amount,
    currency: "KRW",
    reference: `${PRIVATE_CANARY}-reference-${scenarioId}`,
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("TEST_OBJECT_REQUIRED");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestRecord(envelope: Record<string, unknown>): Record<string, unknown> {
  return record(envelope.manifest);
}

function fixtureRecord(
  envelope: Record<string, unknown>,
  scenarioId: "S1" | "S2" | "S3" | "S4" | "S5",
): Record<string, unknown> {
  return record(record(manifestRecord(envelope).fixtures)[scenarioId]);
}

function fingerprintEnvelopeS3(envelope: Record<string, unknown>): string {
  const fixtureValue = fixtureRecord(envelope, "S3");
  const scenarioId = fixtureValue.scenarioId;
  const paymentKey = fixtureValue.paymentKey;
  const providerOrderId = fixtureValue.providerOrderId;
  const amount = fixtureValue.amount;
  const currency = fixtureValue.currency;
  const reference = fixtureValue.reference;
  if (scenarioId !== "S3" || typeof paymentKey !== "string"
    || typeof providerOrderId !== "string" || typeof amount !== "number"
    || typeof currency !== "string" || typeof reference !== "string") {
    throw new Error("TEST_S3_REQUIRED");
  }
  return fingerprintValidatedS3Target({
    scenarioId, paymentKey, providerOrderId, amount, currency, reference,
  });
}

async function createRetiredRun(
  root: string,
  runId: string,
  scenarioId: "S1" | "S2",
): Promise<H1ArtifactStore> {
  const store = new H1ArtifactStore(root, runId);
  await store.initialize();
  const manifest = fullManifest(runId);
  await atomicWriteJson(store.path("fixtures.json"), manifest);
  await rm(store.path("raw"), { recursive: true });
  const fixtureForScenario = manifest.fixtures[scenarioId];
  if (!fixtureForScenario) throw new Error("TEST_FIXTURE_REQUIRED");
  const ledger = new RunLedgerStore(store.path("ledger"));
  const identity = ledgerIdentity(fixtureForScenario);
  const planned = await ledger.append({
    ...identity, runId, scenarioId, phase: "PLANNED",
    payload: Object.freeze({ scenarioId, startedAt: "2026-07-18T00:00:00.000Z" }),
  });
  const complete = await ledger.append({
    ...identity, runId, scenarioId, phase: "LOCAL_COMMIT_COMPLETE",
    payload: Object.freeze({ ...planned.payload, resultCode: Object.freeze([]) }),
  });
  const sealed = await ledger.append({
    ...identity, runId, scenarioId, phase: "SEALED",
    payload: Object.freeze({ ...complete.payload, completionMarker: "SEALED" }),
  });
  await ledger.append({
    ...identity, runId, scenarioId, phase: "DB_CLEANED",
    payload: Object.freeze({ ...sealed.payload, cleanupComplete: true }),
  });
  const report = validReport(runId, scenarioId, fixtureForScenario, identity);
  await atomicWriteJson(store.path("sealed", `${scenarioId}.json`), report);
  await atomicWriteJson(store.path("sanitized", `${scenarioId}.json`), report);
  return store;
}

async function createValidPopulation(root: string): Promise<H1ArtifactStore> {
  const target = new H1ArtifactStore(root, TARGET);
  await target.initialize();
  await createRetiredRun(root, SOURCE, "S1");
  await createRetiredRun(root, WITNESS, "S2");
  await populateFixtures(
    root, populationCommand(), confirmation(), populationDependencies(),
  );
  return target;
}

function ledgerIdentity(fixtureForScenario: ProviderFixture) {
  return Object.freeze({
    repositoryCommit: "a".repeat(40),
    runnerSourceHash: "b".repeat(64),
    policyHashes: policyHashes(),
    migrationFingerprint: "d".repeat(64),
    scenarioInputHash: scenarioInputHash(fixtureForScenario),
  });
}

function validReport(
  runId: string,
  scenarioId: "S1" | "S2",
  fixtureForScenario: ProviderFixture,
  identity: ReturnType<typeof ledgerIdentity>,
) {
  return Object.freeze({
    formatVersion: "mira-toss-sbx-sanitized/v1",
    runId,
    scenarioId,
    repositoryCommit: identity.repositoryCommit,
    policyHashes: identity.policyHashes,
    runnerSourceHash: identity.runnerSourceHash,
    migrationFingerprint: identity.migrationFingerprint,
    scenarioInputHash: identity.scenarioInputHash,
    startedAt: "2026-07-18T00:00:00.000Z",
    finishedAt: "2026-07-18T00:01:00.000Z",
    provider: "TOSS",
    mode: "SANDBOX",
    amount: fixtureForScenario.amount,
    currency: "KRW",
    paymentKeyHmac: "1".repeat(64),
    operationKeyHmac: null,
    wireFingerprintHmac: null,
    transactionKeyHmac: null,
    getCount: 0,
    postCount: 0,
    normalizedProviderOutcome: null,
    httpStatusClass: null,
    staticLocalResultCodes: Object.freeze([]),
    localProjection: Object.freeze({
      commandStatus: null, attemptStatus: null, orderStatus: null, dispatchCount: 0,
      latestOrdinal: 0, contactProofCount: 0, evidenceCount: 0,
      transitionCount: 0, leaseCleared: true,
    }),
    booleans: Object.freeze({
      sameOperationKey: null, sameBody: null, sameTransactionKey: null,
      singleCancellation: null, noSecondPost: null, recoveredByLookup: null,
      cleanupComplete: false,
    }),
    rawArtifacts: Object.freeze([]),
    scenarioLimitations: scenarioId === "S2"
      ? Object.freeze(["Process-level response discard; not TCP-level loss."])
      : Object.freeze([]),
    s6Executed: false,
    completionMarker: "SEALED",
  });
}

function policyHashes(): Readonly<Record<string, string>> {
  return Object.freeze({
    "docs/payment_policy/refund_execution_v1.md": "1".repeat(64),
    "docs/payment_policy/refund_execution_v2.md": "2".repeat(64),
    "docs/payment_policy/refund_execution_v3.md": "3".repeat(64),
    "docs/payment_policy/refund_execution_toss_v1.md": "4".repeat(64),
    "docs/payment_policy/refund_execution_toss_recovery_v1.md": "5".repeat(64),
  });
}

function ledgerRecord(
  runId: string,
  scenarioId: "S1" | "S2",
  revision: number,
  phase: H1Ledger["phase"],
  previousLedgerHash: string | null,
  payload: Readonly<Record<string, unknown>>,
): H1Ledger {
  const identity = ledgerIdentity(requiredS3Fixture(fullManifest(runId)));
  return Object.freeze({
    formatVersion: "mira-toss-sbx-ledger/v1",
    revision,
    previousLedgerHash,
    runId,
    scenarioId,
    phase,
    ...identity,
    payload,
  });
}

function populationCommand() {
  const parsed = parseH1Command([
    "populate-fixtures", "--run", TARGET, "--source-run", SOURCE,
    "--witness-run", WITNESS, "--scenario", "S3",
  ]);
  if (parsed.command !== "populate-fixtures") throw new Error("TEST_COMMAND_INVALID");
  return parsed;
}

function confirmation(): Readonly<Record<string, string>> {
  return Object.freeze({ MIRA_TOSS_SANDBOX_ACCEPTANCE_POPULATE_CONFIRM: TARGET });
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mira-p3b-c1-"));
  roots.push(root);
  return root;
}

async function createProtectedRootFixture(): Promise<Readonly<{ direct: string; deep: string }>> {
  const direct = join(H1_ARTIFACT_PARENT, "direct");
  const deep = join(direct, "deep");
  await mkdir(join(deep, "ledger"), { recursive: true, mode: 0o700 });
  await mkdir(join(deep, "locks"), { mode: 0o700 });
  await mkdir(join(deep, "raw"), { mode: 0o700 });
  await writeFile(join(deep, "raw", "hmac.key"), "fake-test-key", { mode: 0o600 });
  return Object.freeze({ direct, deep });
}

async function protectedTreeMetadata(): Promise<readonly string[]> {
  const records: string[] = [];
  const visit = async (path: string): Promise<void> => {
    const metadata = await lstat(path);
    records.push([
      relative(H1_ARTIFACT_PARENT, path), metadata.mode, metadata.uid, metadata.gid,
      metadata.size, metadata.mtimeMs, metadata.ctimeMs, metadata.ino, metadata.nlink,
    ].join("|"));
    if (!metadata.isDirectory()) return;
    for (const child of await readdir(path)) await visit(join(path, child));
  };
  await visit(H1_ARTIFACT_PARENT);
  return Object.freeze(records.sort());
}

function resetRootBoundaryAudit(): void {
  rootBoundaryAudit.artifactContentReads = 0;
  rootBoundaryAudit.ledgerOrLockAccesses = 0;
  rootBoundaryAudit.mutationCalls = 0;
}

function resetHmacContentAudit(): void {
  fileReadAudit.hmacFileHandleReadFiles = 0;
  fileReadAudit.hmacFileHandleReads = 0;
  fileReadAudit.hmacOpens = 0;
  fileReadAudit.hmacReadFiles = 0;
}

function hmacContentAudit() {
  return Object.freeze({
    hmacFileHandleReadFiles: fileReadAudit.hmacFileHandleReadFiles,
    hmacFileHandleReads: fileReadAudit.hmacFileHandleReads,
    hmacOpens: fileReadAudit.hmacOpens,
    hmacReadFiles: fileReadAudit.hmacReadFiles,
  });
}

function zeroHmacContentAudit() {
  return Object.freeze({
    hmacFileHandleReadFiles: 0,
    hmacFileHandleReads: 0,
    hmacOpens: 0,
    hmacReadFiles: 0,
  });
}

function owner(): number {
  const value = process.geteuid?.();
  if (value === undefined) throw new Error("TEST_OWNER_UNAVAILABLE");
  return value;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error instanceof Error ? error : new Error("TEST_PATH_INSPECTION_FAILED");
  }
}

async function readJson(path: string): Promise<unknown> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  return value;
}

async function readLedger(path: string): Promise<H1Ledger> {
  return parseLedger(await readJson(path));
}

function ordinaryCliOutput(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>> {
  return new Promise((resolvePromise, reject) => {
    const importPoison = join(
      process.cwd(),
      "src/__tests__/refund-sandbox-acceptance/ordinary-cli-import-poison.ts",
    );
    const child = spawn(process.execPath, [
      "--import", "tsx",
      "--import", importPoison,
      "scripts/refund-sandbox-acceptance/cli.ts",
      ...args,
    ], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("exit", (exitCode) => {
      if (exitCode === null) {
        reject(new Error("ORDINARY_CLI_TERMINATED_WITHOUT_EXIT_CODE"));
        return;
      }
      resolvePromise(Object.freeze({ exitCode, stdout, stderr }));
    });
  });
}

function childOutput(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`CHILD_FAILED_${String(code)}_${stderr}`));
    });
  });
}
