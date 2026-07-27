import { fileURLToPath } from "node:url";
import { chmod, lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  TB2A_COMMAND_KINDS,
  TB2A_CONTRACT_VERSION,
  TB2A_EVIDENCE_VERSION,
  assembleTb2aReviewerAbsentEvidence,
  buildTb2aReadOnlyCommand,
  type Tb2aCommandReceipt,
} from "./refund-p3e-b2-bootstrap-readiness.mjs";
import {
  executeTb2aSelfCheckFixtureCommand,
  tb2aCredentialBearingEnvironmentPresent,
} from "./refund-p3e-b2-bootstrap-readiness-adapter.mjs";

const SELF_CHECK_PROJECT_ID = "mira-refund-sbx";
const SELF_CHECK_PROJECT_NUMBER = "987654321098";
const SELF_CHECK_CONFIGURATION = "fixture-self-check";
const SELF_CHECK_REPOSITORY_COMMIT =
  "775d01f66963399798ea001623940ebc979da929";
const SELF_CHECK_NONCE = "fixture_self_check_nonce_0001";
const SELF_CHECK_MODE = "FIXTURE_SELF_CHECK";

export type Tb2aSelfCheckResult = Readonly<{
  contractVersion: typeof TB2A_CONTRACT_VERSION;
  evidenceVersion: typeof TB2A_EVIDENCE_VERSION;
  disposition: "INDEPENDENT_REVIEW_REQUIRED";
  evidenceSha256: string;
  commandCount: 6;
  durationMs: number;
  mode: typeof SELF_CHECK_MODE;
}>;

type SelfCheckBoundary = Readonly<{
  fixturePath: string;
  repositoryRoot: string;
}>;

export async function runTb2aCollectorSelfCheck(
  ...request: never[]
): Promise<Tb2aSelfCheckResult> {
  if (request.length !== 0
    || tb2aCredentialBearingEnvironmentPresent(process.env)) {
    throw new Error("TB2A_FIXTURE_SELF_CHECK_REJECTED");
  }
  const boundary = await admittedSelfCheckBoundary();
  if (!boundary) throw new Error("TB2A_FIXTURE_SELF_CHECK_REJECTED");
  const started = performance.now();
  const receipts: Tb2aCommandReceipt[] = [];
  for (const kind of TB2A_COMMAND_KINDS) {
    receipts.push(await runFixtureCommand(kind));
  }
  const completedAt = Date.now();
  const evaluated = assembleTb2aReviewerAbsentEvidence({
    projectId: SELF_CHECK_PROJECT_ID,
    configurationName: SELF_CHECK_CONFIGURATION,
    repositoryCommit: SELF_CHECK_REPOSITORY_COMMIT,
    nonce: SELF_CHECK_NONCE,
    receipts,
    authoritativeNowMs: completedAt,
  });
  if (!evaluated.ok
    || evaluated.disposition !== "INDEPENDENT_REVIEW_REQUIRED") {
    throw new Error("TB2A_FIXTURE_SELF_CHECK_FAILED");
  }
  return Object.freeze({
    contractVersion: TB2A_CONTRACT_VERSION,
    evidenceVersion: TB2A_EVIDENCE_VERSION,
    disposition: evaluated.disposition,
    evidenceSha256: evaluated.evidenceSha256,
    commandCount: 6,
    durationMs: Math.max(0, Math.floor(performance.now() - started)),
    mode: SELF_CHECK_MODE,
  });
}

async function admittedSelfCheckBoundary(): Promise<SelfCheckBoundary | null> {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const fixturePath = expectedFixturePath(repositoryRoot);
  try {
    const before = await lstat(fixturePath);
    if (before.isSymbolicLink() || !before.isFile()) return null;
    const [canonicalRoot, canonicalFixture] = await Promise.all([
      realpath(repositoryRoot),
      realpath(fixturePath),
    ]);
    if (canonicalRoot !== repositoryRoot
      || canonicalFixture !== fixturePath
      || !pathInside(canonicalFixture, canonicalRoot)) return null;
    return Object.freeze({ fixturePath, repositoryRoot });
  } catch {
    return null;
  }
}

function pathInside(candidate: string, root: string): boolean {
  if (!isAbsolute(candidate) || !isAbsolute(root)) return false;
  const relationship = relative(root, candidate);
  return relationship.length > 0
    && relationship !== ".."
    && !relationship.startsWith(`..${sep}`)
    && !isAbsolute(relationship);
}

async function runFixtureCommand(
  kind: (typeof TB2A_COMMAND_KINDS)[number],
): Promise<Tb2aCommandReceipt> {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "mira-tb2a-self-check-"),
  );
  await chmod(temporaryRoot, 0o700);
  try {
    const startedAtMs = Date.now();
    const startedMonotonic = performance.now();
    const result = await executeTb2aSelfCheckFixtureCommand(
      kind,
      temporaryRoot,
      SELF_CHECK_PROJECT_ID,
      kind === "BOOTSTRAP_SERVICES_LIST"
        ? SELF_CHECK_PROJECT_NUMBER
        : undefined,
    );
    if (!result.ok) throw new Error("TB2A_FIXTURE_COMMAND_FAILED");
    const completedAtMs = Date.now();
    return Object.freeze({
      kind,
      args: buildTb2aReadOnlyCommand(kind, {
        projectId: SELF_CHECK_PROJECT_ID,
        configurationName: SELF_CHECK_CONFIGURATION,
      }),
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: Math.max(
        0,
        Math.floor(performance.now() - startedMonotonic),
      ),
      result,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function expectedFixturePath(repositoryRoot: string): string {
  return join(
    repositoryRoot,
    "src/lib/payment/refund/__tests__/fixtures/refund-p3e-b2-child-fixture.mjs",
  );
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("TB2A_FIXTURE_SELF_CHECK_ARGUMENT_REJECTED");
  }
  const result = await runTb2aCollectorSelfCheck();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    process.stderr.write("TB2A_FIXTURE_SELF_CHECK_FAILED\n");
    process.exitCode = 1;
  });
}
