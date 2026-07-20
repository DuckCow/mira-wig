import { lstat, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  deriveTossRefundCancellationWireRequest,
} from "../../src/lib/payment/refund/providers/toss/refund-wire-request";
import {
  fingerprintTossRefundWireRequest,
} from "../../src/lib/payment/refund/providers/toss/refund-wire-fingerprint";
import {
  deriveTossRefundOperationKey,
} from "../../src/lib/payment/refund/providers/toss/refund-operation-key";
import {
  NoClobberPublicationError,
  publishPrivateTextNoClobber,
  readPrivateText,
  safeChild,
  type NoClobberPublicationDependencies,
} from "./atomic-files";
import { canonicalJson } from "./canonical-json";
import {
  requireFixturePopulationAcknowledgement,
  parseRunId,
  type H1Scenario,
  type ParsedH1Command,
} from "./contracts";
import { acquireRunMutationLock, type RunMutationLock } from "./exclusive-run-lock";
import {
  assertApprovalRegistryRootSafe,
  COMMITTED_FIXTURE_POPULATION_APPROVALS,
  lookupFixturePopulationApproval,
  type FixturePopulationApproval,
  type FixturePopulationApprovalRegistry,
} from "./fixture-population-approval";
import {
  fixtureManifestTemplate,
  parseFixtureManifest,
  readFixtureManifest,
  requiredS3Fixture,
  retargetFixtureManifest,
  type FixtureManifest,
  type ProviderFixture,
} from "./fixture-manifest";
import { fingerprintValidatedS3Target } from "./fixture-target-fingerprint";
import { scenarioInputHash } from "./integrity";
import { parseSanitizedEvidence } from "./redaction";
import { RunLedgerStore, type H1Ledger } from "./run-ledger";

export const H1_FIXTURE_POPULATION_FORMAT_VERSION = "mira-toss-sbx-fixture-population/v1";
export const H1_FIXTURE_POPULATION_FILE = "fixture-population.json";

export type FixturePopulationEnvelope = Readonly<{
  formatVersion: typeof H1_FIXTURE_POPULATION_FORMAT_VERSION;
  runId: string;
  authorizedScenario: "S3";
  sourceRunId: string;
  witnessRunId: string;
  stableTargetFingerprint: string;
  manifest: FixtureManifest;
}>;

export type EffectiveFixtureAuthority = Readonly<{
  manifest: FixtureManifest;
  authorizedScenario: "S3" | null;
  population: FixturePopulationEnvelope | null;
}>;

export type FixturePopulationResult = Readonly<{
  code: "FIXTURES_POPULATED";
  runId: string;
  scenario: "S3";
  stableTargetFingerprint: string;
}>;

type PopulationCommand = Extract<ParsedH1Command, Readonly<{ command: "populate-fixtures" }>>;
type Env = Readonly<Record<string, string | undefined>>;
export type FixturePopulationDependencies = Readonly<{
  publication?: NoClobberPublicationDependencies;
  approvalRegistry?: FixturePopulationApprovalRegistry;
}>;
export type FixtureAuthorityDependencies = Readonly<{
  approvalRegistry?: FixturePopulationApprovalRegistry;
}>;
type FileIdentity = Readonly<{
  dev: number;
  ino: number;
  mode: number;
  uid: number;
  size: number;
  mtimeMs: number;
  nlink: number;
}>;
type TargetSnapshot = Readonly<{ template: FileIdentity; hmacKey: FileIdentity }>;
type RetiredAuthority = Readonly<{
  manifest: FixtureManifest;
  scenarioId: H1Scenario;
  history: readonly H1Ledger[];
}>;
type PreparedPopulation = Readonly<{
  parsed: PopulationCommand;
  approval: FixturePopulationApproval;
  approvalRegistry: FixturePopulationApprovalRegistry;
  owner: number;
  targetDirectory: string;
  sourceDirectory: string;
  witnessDirectory: string;
  source: RetiredAuthority;
  witness: RetiredAuthority;
  envelope: FixturePopulationEnvelope;
  targetSnapshot: TargetSnapshot;
}>;

const TARGET_CHILDREN = Object.freeze([
  "fixtures.json", "ledger", "locks", "raw", "sanitized", "sealed",
]);
const POPULATED_TARGET_CHILDREN = Object.freeze([...TARGET_CHILDREN, H1_FIXTURE_POPULATION_FILE]);
const RETIRED_CHILDREN = Object.freeze([
  "fixtures.json", "ledger", "locks", "sanitized", "sealed",
]);
const POPULATION_KEYS = Object.freeze([
  "formatVersion", "runId", "authorizedScenario", "sourceRunId", "witnessRunId",
  "stableTargetFingerprint", "manifest",
]);
const DATABASE_CAPABILITIES = Object.freeze(["DATABASE_URL"]);
const EXPLICIT_PROVIDER_CAPABILITIES = Object.freeze([
  "TOSS_SANDBOX_SECRET_KEY", "TOSS_LIVE_SECRET_KEY", "PAYMENT_LIVE_MARKETS",
  "TOSS_SANDBOX_EXTERNAL_ENABLED", "MIRA_TOSS_SANDBOX_ACCEPTANCE_CONFIRM",
  "MIRA_TOSS_SANDBOX_ACCEPTANCE_CLEANUP_CONFIRM",
  "MIRA_TOSS_SANDBOX_ACCEPTANCE_PURGE_CONFIRM",
]);

export class FixturePopulationError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = "FixturePopulationError";
  }
}

export async function populateFixtures(
  root: string,
  parsed: PopulationCommand,
  env: Env,
  dependencies: FixturePopulationDependencies = Object.freeze({}),
): Promise<FixturePopulationResult> {
  const prepared = await preparePopulation(root, parsed, env, dependencies.approvalRegistry);
  const lock = await acquirePopulationLock(prepared.targetDirectory, parsed.runId);
  let completed = false;
  let operationFailure: Error | null = null;
  try {
    await populateUnderLock(prepared, lock, dependencies.publication);
    completed = true;
  } catch (error) {
    operationFailure = normalizedPopulationFailure(error);
  }
  try {
    await lock.release();
  } catch (error) {
    throw completed
      ? failure("FIXTURE_POPULATION_PUBLICATION_AMBIGUOUS", error)
      : failure("FIXTURE_POPULATION_LOCK_INTEGRITY_FAILED", error);
  }
  if (operationFailure) throw operationFailure;
  return Object.freeze({
    code: "FIXTURES_POPULATED",
    runId: parsed.runId,
    scenario: "S3",
    stableTargetFingerprint: prepared.envelope.stableTargetFingerprint,
  });
}

export async function readEffectiveFixtureAuthority(
  runDirectory: string,
  runId: string,
  dependencies: FixtureAuthorityDependencies = Object.freeze({}),
): Promise<EffectiveFixtureAuthority> {
  const approvalRegistry = dependencies.approvalRegistry
    ?? COMMITTED_FIXTURE_POPULATION_APPROVALS;
  const root = dirname(runDirectory);
  await assertApprovalRegistryRootSafe(approvalRegistry, root);
  if (resolve(runDirectory) !== safeChild(root, runId)) {
    throw new Error("FIXTURE_POPULATION_TARGET_INVALID");
  }
  const templatePath = safeChild(runDirectory, "fixtures.json");
  const populationPath = safeChild(runDirectory, H1_FIXTURE_POPULATION_FILE);
  if (!await pathExists(populationPath)) {
    return Object.freeze({
      manifest: await readFixtureManifest(templatePath, runId),
      authorizedScenario: null,
      population: null,
    });
  }
  const approval = lookupFixturePopulationApproval(approvalRegistry, runId);
  if (!approval) throw failure("FIXTURE_POPULATION_APPROVAL_REQUIRED");
  const owner = expectedOwner();
  await validateAuthorityTarget(runDirectory, runId, owner);
  const source = await validateRetiredRun(
    safeChild(root, approval.sourceRunId), approval.sourceRunId, owner, "source",
  );
  const witness = await validateRetiredRun(
    safeChild(root, approval.witnessRunId), approval.witnessRunId, owner, "witness",
  );
  const expected = buildPopulationEnvelope(approval, source, witness);
  const population = await readFixturePopulation(populationPath, runId);
  if (canonicalJson(population) !== canonicalJson(expected)) {
    throw failure("FIXTURE_POPULATION_AUTHORITY_MISMATCH");
  }
  return Object.freeze({
    manifest: expected.manifest,
    authorizedScenario: "S3",
    population: expected,
  });
}

export async function readPopulationFixtureAuthority(
  runDirectory: string,
  runId: string,
  dependencies: FixtureAuthorityDependencies = Object.freeze({}),
): Promise<EffectiveFixtureAuthority | null> {
  await assertApprovalRegistryRootSafe(
    dependencies.approvalRegistry ?? COMMITTED_FIXTURE_POPULATION_APPROVALS,
    dirname(runDirectory),
  );
  const populationPath = safeChild(runDirectory, H1_FIXTURE_POPULATION_FILE);
  return await pathExists(populationPath)
    ? readEffectiveFixtureAuthority(runDirectory, runId, dependencies)
    : null;
}

export function assertScenarioAuthorized(
  authority: EffectiveFixtureAuthority,
  scenarioId: H1Scenario,
): void {
  if (authority.authorizedScenario && authority.authorizedScenario !== scenarioId) {
    throw new Error("FIXTURE_SCENARIO_NOT_AUTHORIZED");
  }
}

export function assertLedgerMatchesFixtureAuthority(
  authority: EffectiveFixtureAuthority,
  scenarioId: H1Scenario,
): void {
  if (authority.authorizedScenario && authority.authorizedScenario !== scenarioId) {
    throw new Error("FIXTURE_SCENARIO_NOT_AUTHORIZED");
  }
}

export async function readFixturePopulation(
  path: string,
  expectedRunId: string,
): Promise<FixturePopulationEnvelope> {
  const raw: unknown = JSON.parse(await readPrivateText(path));
  return parseFixturePopulation(raw, expectedRunId);
}

export function parseFixturePopulation(
  value: unknown,
  expectedRunId: string,
): FixturePopulationEnvelope {
  if (!exactRecord(value, POPULATION_KEYS)) throw new Error("FIXTURE_POPULATION_INVALID");
  assertPopulationHeader(value, expectedRunId);
  const manifest = parseFixtureManifest(value.manifest, expectedRunId);
  parseRunId(value.sourceRunId);
  parseRunId(value.witnessRunId);
  const computed = fingerprintValidatedS3Target(requiredS3Fixture(manifest));
  if (value.stableTargetFingerprint !== computed) {
    throw new Error("FIXTURE_POPULATION_FINGERPRINT_INVALID");
  }
  return Object.freeze({
    formatVersion: H1_FIXTURE_POPULATION_FORMAT_VERSION,
    runId: expectedRunId,
    authorizedScenario: "S3",
    sourceRunId: value.sourceRunId,
    witnessRunId: value.witnessRunId,
    stableTargetFingerprint: computed,
    manifest,
  });
}

function assertPopulationHeader(
  value: Record<string, unknown>,
  expectedRunId: string,
): asserts value is Record<string, unknown> & Readonly<{
  sourceRunId: string;
  witnessRunId: string;
  stableTargetFingerprint: string;
}> {
  if (value.formatVersion !== H1_FIXTURE_POPULATION_FORMAT_VERSION) invalidPopulation();
  if (value.runId !== parseRunId(expectedRunId)) invalidPopulation();
  if (value.authorizedScenario !== "S3") invalidPopulation();
  if (typeof value.sourceRunId !== "string") invalidPopulation();
  if (typeof value.witnessRunId !== "string") invalidPopulation();
  if (typeof value.stableTargetFingerprint !== "string") invalidPopulation();
  if (value.sourceRunId === value.witnessRunId) invalidPopulation();
  if ([value.sourceRunId, value.witnessRunId].includes(expectedRunId)) invalidPopulation();
}

function invalidPopulation(): never {
  throw new Error("FIXTURE_POPULATION_INVALID");
}

export async function validateRetiredFixtureAuthority(
  directory: string,
  runId: string,
  role: "source" | "witness",
): Promise<Readonly<{ manifest: FixtureManifest; scenarioId: H1Scenario }>> {
  const authority = await validateRetiredRun(directory, runId, expectedOwner(), role);
  return Object.freeze({ manifest: authority.manifest, scenarioId: authority.scenarioId });
}

async function preparePopulation(
  root: string,
  parsed: PopulationCommand,
  env: Env,
  injectedApprovalRegistry: FixturePopulationApprovalRegistry | undefined,
): Promise<PreparedPopulation> {
  const approvalRegistry = injectedApprovalRegistry ?? COMMITTED_FIXTURE_POPULATION_APPROVALS;
  await assertApprovalRegistryRootSafe(approvalRegistry, root);
  const approval = lookupFixturePopulationApproval(approvalRegistry, parsed.runId);
  if (!approval) throw failure("FIXTURE_POPULATION_APPROVAL_REQUIRED");
  assertCommandMatchesApproval(parsed, approval);
  requireFixturePopulationAcknowledgement(env, parsed.runId);
  assertNoInheritedCapabilities(env);
  assertDistinctRuns(parsed);
  const owner = expectedOwner();
  const targetDirectory = safeChild(root, parsed.runId);
  const sourceDirectory = safeChild(root, approval.sourceRunId);
  const witnessDirectory = safeChild(root, approval.witnessRunId);
  const targetSnapshot = await validateTemplateTarget(targetDirectory, parsed.runId, owner, false);
  const source = await validateRetiredRun(sourceDirectory, approval.sourceRunId, owner, "source");
  const witness = await validateRetiredRun(witnessDirectory, approval.witnessRunId, owner, "witness");
  const envelope = buildPopulationEnvelope(approval, source, witness);
  return Object.freeze({
    parsed, approval, approvalRegistry, owner, targetDirectory, sourceDirectory, witnessDirectory,
    source, witness, envelope, targetSnapshot,
  });
}

async function acquirePopulationLock(
  targetDirectory: string,
  runId: string,
): Promise<RunMutationLock> {
  try {
    return await acquireRunMutationLock(
      safeChild(targetDirectory, "locks", "run.lock"), runId, "fixture-population",
    );
  } catch (error) {
    throw failure("FIXTURE_POPULATION_CONCURRENT_MUTATION", error);
  }
}

async function populateUnderLock(
  prepared: PreparedPopulation,
  lock: RunMutationLock,
  publication: NoClobberPublicationDependencies | undefined,
): Promise<void> {
  const lockedSnapshot = await validateTemplateTarget(
    prepared.targetDirectory, prepared.parsed.runId, prepared.owner, true,
  );
  if (!sameFileIdentity(prepared.targetSnapshot.template, lockedSnapshot.template)
    || !sameFileIdentity(prepared.targetSnapshot.hmacKey, lockedSnapshot.hmacKey)) {
    throw failure("FIXTURE_POPULATION_CONCURRENT_MUTATION");
  }
  const lockedSource = await validateRetiredRun(
    prepared.sourceDirectory, prepared.approval.sourceRunId, prepared.owner, "source",
  );
  const lockedWitness = await validateRetiredRun(
    prepared.witnessDirectory, prepared.approval.witnessRunId, prepared.owner, "witness",
  );
  const lockedEnvelope = buildPopulationEnvelope(prepared.approval, lockedSource, lockedWitness);
  if (canonicalJson(prepared.source) !== canonicalJson(lockedSource)
    || canonicalJson(prepared.witness) !== canonicalJson(lockedWitness)
    || canonicalJson(prepared.envelope) !== canonicalJson(lockedEnvelope)) {
    throw failure("FIXTURE_POPULATION_PROTECTED_SOURCE_MISMATCH");
  }
  await assertPopulationLockHeld(lock);
  await publishPopulation(prepared, publication);
  try {
    await validatePopulatedTarget(prepared, lock);
  } catch (error) {
    throw failure("FIXTURE_POPULATION_PUBLICATION_AMBIGUOUS", error);
  }
}

async function publishPopulation(
  prepared: PreparedPopulation,
  publication: NoClobberPublicationDependencies | undefined,
): Promise<void> {
  const finalPath = safeChild(prepared.targetDirectory, H1_FIXTURE_POPULATION_FILE);
  try {
    await publishPrivateTextNoClobber(
      finalPath,
      `${canonicalJson(prepared.envelope)}\n`,
      prepared.owner,
      async (temporaryPath) => {
        const parsed = await readFixturePopulation(temporaryPath, prepared.parsed.runId);
        if (canonicalJson(parsed) !== canonicalJson(prepared.envelope)) {
          throw new Error("FIXTURE_POPULATION_CANDIDATE_INVALID");
        }
      },
      publication,
    );
  } catch (error) {
    if (error instanceof NoClobberPublicationError) {
      if (error.state === "ALREADY_EXISTS") {
        throw failure("FIXTURE_POPULATION_ALREADY_COMPLETED", error);
      }
      if (error.state === "COMMITTED_AMBIGUOUS") {
        throw failure("FIXTURE_POPULATION_PUBLICATION_AMBIGUOUS", error);
      }
    }
    throw failure("FIXTURE_POPULATION_ATOMIC_WRITE_FAILED", error);
  }
}

async function validatePopulatedTarget(
  prepared: PreparedPopulation,
  lock: RunMutationLock,
): Promise<void> {
  await assertPopulationLockHeld(lock);
  await assertOwnedDirectory(prepared.targetDirectory, prepared.owner);
  await assertExactChildren(
    prepared.targetDirectory, POPULATED_TARGET_CHILDREN,
    "FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED",
  );
  await assertLockState(safeChild(prepared.targetDirectory, "locks"), true);
  await assertEmptyDirectory(
    safeChild(prepared.targetDirectory, "ledger"), "FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED",
  );
  await assertEmptyDirectory(
    safeChild(prepared.targetDirectory, "sealed"), "FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED",
  );
  await assertEmptyDirectory(
    safeChild(prepared.targetDirectory, "sanitized"), "FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED",
  );
  await assertExactChildren(
    safeChild(prepared.targetDirectory, "raw"), ["hmac.key"],
    "FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED",
  );
  const template = await assertOwnedFile(
    safeChild(prepared.targetDirectory, "fixtures.json"), prepared.owner,
  );
  const hmacKey = await assertOwnedFile(
    safeChild(prepared.targetDirectory, "raw", "hmac.key"), prepared.owner,
  );
  if (!sameFileIdentity(prepared.targetSnapshot.template, template)
    || !sameFileIdentity(prepared.targetSnapshot.hmacKey, hmacKey)) {
    throw new Error("FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED");
  }
  const authority = await readEffectiveFixtureAuthority(
    prepared.targetDirectory,
    prepared.parsed.runId,
    Object.freeze({ approvalRegistry: prepared.approvalRegistry }),
  );
  if (!authority.population
    || canonicalJson(authority.population) !== canonicalJson(prepared.envelope)) {
    throw new Error("FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED");
  }
}

async function validateTemplateTarget(
  directory: string,
  runId: string,
  owner: number,
  locked: boolean,
): Promise<TargetSnapshot> {
  try {
    await assertOwnedDirectory(directory, owner);
    if (await pathExists(safeChild(directory, H1_FIXTURE_POPULATION_FILE))) {
      throw failure("FIXTURE_POPULATION_ALREADY_COMPLETED");
    }
    await assertExactChildren(directory, TARGET_CHILDREN, "FIXTURE_POPULATION_TARGET_NOT_EMPTY");
    const template = await assertOwnedFile(safeChild(directory, "fixtures.json"), owner);
    for (const name of ["ledger", "locks", "raw", "sanitized", "sealed"]) {
      await assertOwnedDirectory(safeChild(directory, name), owner);
    }
    await assertEmptyDirectory(safeChild(directory, "ledger"), "FIXTURE_POPULATION_TARGET_NOT_EMPTY");
    await assertEmptyDirectory(safeChild(directory, "sealed"), "FIXTURE_POPULATION_TARGET_NOT_EMPTY");
    await assertEmptyDirectory(safeChild(directory, "sanitized"), "FIXTURE_POPULATION_TARGET_NOT_EMPTY");
    await assertLockState(safeChild(directory, "locks"), locked);
    await assertExactChildren(
      safeChild(directory, "raw"), ["hmac.key"], "FIXTURE_POPULATION_TARGET_NOT_EMPTY",
    );
    const hmacKey = await assertOwnedFile(safeChild(directory, "raw", "hmac.key"), owner);
    const expected = `${canonicalJson(fixtureManifestTemplate(runId))}\n`;
    if (await readPrivateText(safeChild(directory, "fixtures.json")) !== expected) {
      throw failure("FIXTURE_POPULATION_TARGET_NOT_TEMPLATE");
    }
    return Object.freeze({ template, hmacKey });
  } catch (error) {
    if (error instanceof FixturePopulationError) throw error;
    throw failure("FIXTURE_POPULATION_TARGET_INVALID", error);
  }
}

async function validateAuthorityTarget(
  directory: string,
  runId: string,
  owner: number,
): Promise<void> {
  try {
    await assertOwnedDirectory(directory, owner);
    await assertOwnedDirectory(safeChild(directory, "raw"), owner);
    await assertOwnedFile(safeChild(directory, "fixtures.json"), owner);
    await assertOwnedFile(safeChild(directory, "raw", "hmac.key"), owner);
    await assertOwnedFile(safeChild(directory, H1_FIXTURE_POPULATION_FILE), owner);
    const expectedTemplate = `${canonicalJson(fixtureManifestTemplate(runId))}\n`;
    if (await readPrivateText(safeChild(directory, "fixtures.json")) !== expectedTemplate) {
      throw new Error("FIXTURE_TEMPLATE_IMMUTABILITY_VIOLATION");
    }
  } catch (error) {
    if (error instanceof FixturePopulationError) throw error;
    throw failure("FIXTURE_POPULATION_TARGET_INVALID", error);
  }
}

async function validateRetiredRun(
  directory: string,
  runId: string,
  owner: number,
  role: "source" | "witness",
): Promise<RetiredAuthority> {
  const invalidCode = role === "source"
    ? "FIXTURE_POPULATION_SOURCE_INVALID"
    : "FIXTURE_POPULATION_WITNESS_INVALID";
  try {
    await assertOwnedDirectory(directory, owner);
    await assertExactChildren(directory, RETIRED_CHILDREN, invalidCode);
    await assertOwnedFile(safeChild(directory, "fixtures.json"), owner);
    for (const name of ["ledger", "locks", "sanitized", "sealed"]) {
      await assertOwnedDirectory(safeChild(directory, name), owner);
    }
    await assertEmptyDirectory(safeChild(directory, "locks"), invalidCode);
    const manifest = await readFixtureManifest(safeChild(directory, "fixtures.json"), runId);
    const history = await validateRetiredLedger(directory, runId, owner, invalidCode);
    const latest = requireRetiredTerminal(history, invalidCode);
    await validateRetiredReports(directory, manifest, latest, owner, invalidCode);
    return Object.freeze({ manifest, scenarioId: latest.scenarioId, history });
  } catch (error) {
    if (error instanceof FixturePopulationError) throw error;
    throw failure(invalidCode, error);
  }
}

function requireRetiredTerminal(
  history: readonly H1Ledger[],
  invalidCode: string,
): H1Ledger {
  const latest = history.at(-1);
  if (!latest || latest.phase !== "DB_CLEANED" || history.at(-2)?.phase !== "SEALED") {
    throw failure("FIXTURE_POPULATION_SOURCE_NOT_RETIRED");
  }
  if (latest.scenarioId !== "S1" && latest.scenarioId !== "S2") throw failure(invalidCode);
  if (latest.payload.scenarioId !== latest.scenarioId) throw failure(invalidCode);
  if (latest.payload.completionMarker !== "SEALED") throw failure(invalidCode);
  if (latest.payload.cleanupComplete !== true) throw failure(invalidCode);
  return latest;
}

async function validateRetiredLedger(
  directory: string,
  runId: string,
  owner: number,
  invalidCode: string,
): Promise<readonly H1Ledger[]> {
  const ledgerDirectory = safeChild(directory, "ledger");
  const history = await new RunLedgerStore(ledgerDirectory).loadValidatedHistory();
  const latest = history.at(-1);
  if (!latest || latest.runId !== runId
    || history.some((entry) => entry.runId !== runId || entry.scenarioId !== latest.scenarioId
      || !sameLedgerIntegrity(entry, latest))) throw failure(invalidCode);
  const expectedEntries = ["current.json", ...history.map((entry) => (
    `revision-${String(entry.revision).padStart(6, "0")}.json`
  ))];
  await assertExactChildren(ledgerDirectory, expectedEntries, invalidCode);
  for (const name of expectedEntries) await assertOwnedFile(safeChild(ledgerDirectory, name), owner);
  if (await readPrivateText(safeChild(ledgerDirectory, "current.json"))
    !== `${canonicalJson(latest)}\n`) throw failure(invalidCode);
  return history;
}

async function validateRetiredReports(
  directory: string,
  manifest: FixtureManifest,
  latest: H1Ledger,
  owner: number,
  invalidCode: string,
): Promise<void> {
  const name = `${latest.scenarioId}.json`;
  const sealedPath = safeChild(directory, "sealed", name);
  const sanitizedPath = safeChild(directory, "sanitized", name);
  await assertExactChildren(safeChild(directory, "sealed"), [name], invalidCode);
  await assertExactChildren(safeChild(directory, "sanitized"), [name], invalidCode);
  await assertOwnedFile(sealedPath, owner);
  await assertOwnedFile(sanitizedPath, owner);
  const sealed = parseSanitizedEvidence(JSON.parse(await readPrivateText(sealedPath)));
  const sanitized = parseSanitizedEvidence(JSON.parse(await readPrivateText(sanitizedPath)));
  const fixture = manifest.fixtures[latest.scenarioId];
  if (!fixture) throw failure(invalidCode);
  const bindings = [
    canonicalJson(sealed) === canonicalJson(sanitized),
    sealed.runId === latest.runId,
    sealed.scenarioId === latest.scenarioId,
    sealed.repositoryCommit === latest.repositoryCommit,
    canonicalJson(sealed.policyHashes) === canonicalJson(latest.policyHashes),
    sealed.runnerSourceHash === latest.runnerSourceHash,
    sealed.migrationFingerprint === latest.migrationFingerprint,
    sealed.scenarioInputHash === latest.scenarioInputHash,
    sealed.scenarioInputHash === scenarioInputHash(fixture),
    sealed.amount === fixture.amount,
    sealed.currency === fixture.currency,
    sealed.completionMarker === "SEALED",
  ];
  if (!bindings.every(Boolean)) throw failure(invalidCode);
}

function buildPopulationEnvelope(
  approval: FixturePopulationApproval,
  source: RetiredAuthority,
  witness: RetiredAuthority,
): FixturePopulationEnvelope {
  if (source.scenarioId === witness.scenarioId) {
    throw failure("FIXTURE_POPULATION_PROTECTED_SOURCE_MISMATCH");
  }
  const sourceS3 = requiredS3Fixture(source.manifest);
  const witnessS3 = requiredS3Fixture(witness.manifest);
  const sourceFingerprint = fingerprintValidatedS3Target(sourceS3);
  const witnessFingerprint = fingerprintValidatedS3Target(witnessS3);
  if (source.manifest.expectedMerchantAccountBinding
      !== witness.manifest.expectedMerchantAccountBinding
    || source.manifest.expectedCredentialGenerationBinding
      !== witness.manifest.expectedCredentialGenerationBinding
    || sourceFingerprint !== witnessFingerprint
    || sourceFingerprint !== approval.stableTargetFingerprint
    || canonicalJson(canonicalS3Contact(approval.targetRunId, sourceS3))
      !== canonicalJson(canonicalS3Contact(approval.targetRunId, witnessS3))) {
    throw failure("FIXTURE_POPULATION_PROTECTED_SOURCE_MISMATCH");
  }
  const manifest = retargetFixtureManifest(source.manifest, approval.targetRunId);
  const stableTargetFingerprint = fingerprintValidatedS3Target(requiredS3Fixture(manifest));
  if (stableTargetFingerprint !== witnessFingerprint
    || stableTargetFingerprint !== approval.stableTargetFingerprint) {
    throw failure("FIXTURE_POPULATION_PROTECTED_SOURCE_MISMATCH");
  }
  return parseFixturePopulation(Object.freeze({
    formatVersion: H1_FIXTURE_POPULATION_FORMAT_VERSION,
    runId: approval.targetRunId,
    authorizedScenario: approval.authorizedScenario,
    sourceRunId: approval.sourceRunId,
    witnessRunId: approval.witnessRunId,
    stableTargetFingerprint,
    manifest,
  }), approval.targetRunId);
}

function canonicalS3Contact(runId: string, fixture: ProviderFixture) {
  const providerOperationKey = deriveTossRefundOperationKey(`h1:${runId}:S3`);
  const wire = deriveTossRefundCancellationWireRequest({
    paymentKey: fixture.paymentKey,
    providerOperationKey,
    cancelAmount: fixture.amount,
  });
  return Object.freeze({
    scenarioId: fixture.scenarioId,
    paymentKey: fixture.paymentKey,
    providerOrderId: fixture.providerOrderId,
    amount: fixture.amount,
    currency: fixture.currency,
    reference: fixture.reference,
    method: wire.method,
    path: wire.path,
    contentType: wire.contentType,
    idempotencyKey: wire.idempotencyKey,
    canonicalBody: JSON.stringify(wire.body),
    wireFingerprint: fingerprintTossRefundWireRequest({
      paymentKey: fixture.paymentKey,
      providerOperationKey,
      cancelAmount: fixture.amount,
    }),
  });
}

function assertNoInheritedCapabilities(env: Env): void {
  if (DATABASE_CAPABILITIES.some((name) => env[name] !== undefined)) {
    throw failure("FIXTURE_POPULATION_DATABASE_CAPABILITY_PRESENT");
  }
  const refundCapability = Object.keys(env).some((name) => (
    name.startsWith("REFUND_EXECUTION_") && name.endsWith("_ENABLED")
      && env[name] !== undefined
  ));
  if (refundCapability || EXPLICIT_PROVIDER_CAPABILITIES.some((name) => env[name] !== undefined)) {
    throw failure("FIXTURE_POPULATION_LIVE_CAPABILITY_PRESENT");
  }
}

function assertDistinctRuns(parsed: PopulationCommand): void {
  if (parsed.runId === parsed.sourceRunId || parsed.runId === parsed.witnessRunId) {
    throw failure("FIXTURE_POPULATION_TARGET_INVALID");
  }
  if (parsed.sourceRunId === parsed.witnessRunId) {
    throw failure("FIXTURE_POPULATION_PROTECTED_SOURCE_MISMATCH");
  }
}

function assertCommandMatchesApproval(
  parsed: PopulationCommand,
  approval: FixturePopulationApproval,
): void {
  if (parsed.runId !== approval.targetRunId
    || parsed.scenarioId !== approval.authorizedScenario
    || parsed.sourceRunId !== approval.sourceRunId
    || parsed.witnessRunId !== approval.witnessRunId) {
    throw failure("FIXTURE_POPULATION_APPROVAL_MISMATCH");
  }
}

async function assertPopulationLockHeld(lock: RunMutationLock): Promise<void> {
  try {
    await lock.assertHeld();
  } catch (error) {
    throw failure("FIXTURE_POPULATION_LOCK_INTEGRITY_FAILED", error);
  }
}

async function assertLockState(directory: string, locked: boolean): Promise<void> {
  const entries = await readdir(directory);
  if (locked) {
    if (entries.length !== 1 || entries[0] !== "run.lock") {
      throw failure("FIXTURE_POPULATION_CONCURRENT_MUTATION");
    }
    return;
  }
  if (entries.length !== 0) throw failure("FIXTURE_POPULATION_CONCURRENT_MUTATION");
}

async function assertExactChildren(
  directory: string,
  expected: readonly string[],
  errorCode: string,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isSymbolicLink())) throw failure(errorCode);
  const actual = entries.map((entry) => entry.name).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw failure(errorCode);
}

async function assertEmptyDirectory(directory: string, errorCode: string): Promise<void> {
  await assertExactChildren(directory, [], errorCode);
}

async function assertOwnedDirectory(path: string, owner: number): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()
    || (metadata.mode & 0o777) !== 0o700 || metadata.uid !== owner) {
    throw new Error("PRIVATE_DIRECTORY_INVALID");
  }
}

async function assertOwnedFile(path: string, owner: number): Promise<FileIdentity> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()
    || (metadata.mode & 0o777) !== 0o600 || metadata.uid !== owner
    || metadata.nlink !== 1) throw new Error("PRIVATE_FILE_INVALID");
  return Object.freeze({
    dev: metadata.dev,
    ino: metadata.ino,
    mode: metadata.mode,
    uid: metadata.uid,
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    nlink: metadata.nlink,
  });
}

function sameFileIdentity(first: FileIdentity, second: FileIdentity): boolean {
  return first.dev === second.dev && first.ino === second.ino
    && first.mode === second.mode && first.uid === second.uid
    && first.size === second.size && first.mtimeMs === second.mtimeMs
    && first.nlink === second.nlink;
}

function sameLedgerIntegrity(first: H1Ledger, second: H1Ledger): boolean {
  return first.repositoryCommit === second.repositoryCommit
    && first.runnerSourceHash === second.runnerSourceHash
    && canonicalJson(first.policyHashes) === canonicalJson(second.policyHashes)
    && first.migrationFingerprint === second.migrationFingerprint
    && first.scenarioInputHash === second.scenarioInputHash;
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every((key) => typeof key === "string" && keys.includes(key));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function expectedOwner(): number {
  const owner = process.geteuid?.();
  if (owner === undefined) throw failure("FIXTURE_POPULATION_TARGET_INVALID");
  return owner;
}

function normalizedPopulationFailure(error: unknown): Error {
  return error instanceof FixturePopulationError
    ? error
    : failure("FIXTURE_POPULATION_POST_WRITE_VALIDATION_FAILED", error);
}

function failure(code: string, cause?: unknown): FixturePopulationError {
  return new FixturePopulationError(code, { cause });
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function isFixturePopulationError(error: unknown): error is FixturePopulationError {
  return error instanceof FixturePopulationError;
}
