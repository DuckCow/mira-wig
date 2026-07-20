import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { H1_ARTIFACT_PARENT } from "./artifact-store";
import { parseRunId } from "./contracts";

export type FixturePopulationApproval = Readonly<{
  targetRunId: string;
  authorizedScenario: "S3";
  sourceRunId: string;
  witnessRunId: string;
  stableTargetFingerprint: string;
}>;

export type FixturePopulationApprovalRegistry = Readonly<{
  scope: "COMMITTED_PRODUCTION" | "TEST_ONLY";
  approvals: readonly FixturePopulationApproval[];
}>;

const APPROVAL_KEYS = Object.freeze([
  "targetRunId",
  "authorizedScenario",
  "sourceRunId",
  "witnessRunId",
  "stableTargetFingerprint",
]);
const SHA256 = /^[0-9a-f]{64}$/;

// This is an intentionally bounded approval for the first S3 population. It is not a
// generic auto-approval mechanism: every future target requires a separate committed entry.
const COMMITTED_APPROVAL_VALUES: readonly unknown[] = Object.freeze([
  Object.freeze({
    targetRunId: "sbx-20260719T132418Z-6b32e6c7f8419ea7",
    authorizedScenario: "S3",
    sourceRunId: "sbx-20260718T185122Z-3e2f983aa0d513bf",
    witnessRunId: "sbx-20260718T083011Z-e131a18f53058e1e",
    stableTargetFingerprint:
      "42e4f010d4b98d6fd42e990379024d85b7919a5fca7102e507e4d41688cae5ff",
  }),
]);

export const COMMITTED_FIXTURE_POPULATION_APPROVALS = parseFixturePopulationApprovalRegistry(
  COMMITTED_APPROVAL_VALUES,
  "COMMITTED_PRODUCTION",
);

export function createTestFixturePopulationApprovalRegistry(
  values: readonly unknown[],
): FixturePopulationApprovalRegistry {
  return parseFixturePopulationApprovalRegistry(values, "TEST_ONLY");
}

export function lookupFixturePopulationApproval(
  registry: FixturePopulationApprovalRegistry,
  requestedTargetRunId: string,
): FixturePopulationApproval | null {
  const targetRunId = parseRunId(requestedTargetRunId);
  return registry.approvals.find((approval) => approval.targetRunId === targetRunId) ?? null;
}

export async function assertApprovalRegistryRootSafe(
  registry: FixturePopulationApprovalRegistry,
  root: string,
): Promise<void> {
  if (registry.scope !== "TEST_ONLY") return;
  const candidateRoot = await canonicalDirectory(root);
  const realRoot = await canonicalDirectory(H1_ARTIFACT_PARENT);
  const candidateFromRealRoot = relative(realRoot, candidateRoot);
  if (candidateFromRealRoot === "" || isContainedRelativePath(candidateFromRealRoot)) {
    throw new Error("TEST_ACCEPTANCE_ROOT_FORBIDDEN");
  }
}

async function canonicalDirectory(path: string): Promise<string> {
  try {
    const canonical = await realpath(resolve(path));
    if (!(await stat(canonical)).isDirectory()) throw new Error("NOT_A_DIRECTORY");
    return canonical;
  } catch {
    throw new Error("TEST_ACCEPTANCE_ROOT_INVALID");
  }
}

function isContainedRelativePath(path: string): boolean {
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function parseFixturePopulationApprovalRegistry(
  values: readonly unknown[],
  scope: FixturePopulationApprovalRegistry["scope"],
): FixturePopulationApprovalRegistry {
  const approvals = values.map(parseFixturePopulationApproval);
  const targetIds = approvals.map((approval) => approval.targetRunId);
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error("FIXTURE_POPULATION_APPROVAL_DUPLICATE_TARGET");
  }
  return Object.freeze({ scope, approvals: Object.freeze(approvals) });
}

function parseFixturePopulationApproval(value: unknown): FixturePopulationApproval {
  if (!exactRecord(value, APPROVAL_KEYS)) {
    throw new Error("FIXTURE_POPULATION_APPROVAL_INVALID");
  }
  const targetRunId = parseRunId(value.targetRunId);
  const sourceRunId = parseRunId(value.sourceRunId);
  const witnessRunId = parseRunId(value.witnessRunId);
  if (value.authorizedScenario !== "S3"
    || typeof value.stableTargetFingerprint !== "string"
    || !SHA256.test(value.stableTargetFingerprint)
    || targetRunId === sourceRunId
    || targetRunId === witnessRunId
    || sourceRunId === witnessRunId) {
    throw new Error("FIXTURE_POPULATION_APPROVAL_INVALID");
  }
  return Object.freeze({
    targetRunId,
    authorizedScenario: "S3",
    sourceRunId,
    witnessRunId,
    stableTargetFingerprint: value.stableTargetFingerprint,
  });
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every((key) => typeof key === "string" && keys.includes(key));
}
