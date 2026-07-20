import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { basename } from "node:path";
import { atomicCreateJson, atomicWriteJson, readPrivateText } from "./atomic-files";
import { canonicalJson } from "./canonical-json";
import type { H1Scenario } from "./contracts";

export const H1_LEDGER_FORMAT_VERSION = "mira-toss-sbx-ledger/v1";
const LEDGER_KEYS = [
  "formatVersion", "revision", "previousLedgerHash", "runId", "scenarioId", "phase",
  "repositoryCommit", "runnerSourceHash", "policyHashes", "migrationFingerprint",
  "scenarioInputHash", "payload",
] as const;

export type H1LedgerPhase =
  | "PLANNED"
  | "BOOTSTRAPPED"
  | "POST_INTENT_RECORDED"
  | "POST_RESPONSE_RECORDED"
  | "HUMAN_POST_DECISION_REQUIRED"
  | "LOCAL_COMMIT_COMPLETE"
  | "REVIEW_REQUIRED"
  | "SEALED"
  | "DB_CLEANED";

export type H1Ledger = Readonly<{
  formatVersion: typeof H1_LEDGER_FORMAT_VERSION;
  revision: number;
  previousLedgerHash: string | null;
  runId: string;
  scenarioId: H1Scenario;
  phase: H1LedgerPhase;
  repositoryCommit: string;
  runnerSourceHash: string;
  policyHashes: Readonly<Record<string, string>>;
  migrationFingerprint: string;
  scenarioInputHash: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export class RunLedgerStore {
  constructor(readonly directory: string) {}

  async append(input: Omit<H1Ledger, "formatVersion" | "revision" | "previousLedgerHash">): Promise<H1Ledger> {
    const previous = await this.loadLatest();
    if (previous && (previous.runId !== input.runId || previous.scenarioId !== input.scenarioId)) {
      throw new Error("LEDGER_IDENTITY_MISMATCH");
    }
    const ledger: H1Ledger = Object.freeze({
      formatVersion: H1_LEDGER_FORMAT_VERSION,
      revision: (previous?.revision ?? 0) + 1,
      previousLedgerHash: previous ? ledgerHash(previous) : null,
      ...input,
      payload: Object.freeze({ ...input.payload }),
    });
    await atomicCreateJson(this.revisionPath(ledger.revision), ledger);
    await atomicWriteJson(`${this.directory}/current.json`, ledger);
    return ledger;
  }

  async loadLatest(): Promise<H1Ledger | null> {
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const revisions = entries
      .filter((name) => /^revision-\d{6}\.json$/.test(name))
      .sort();
    let latest: H1Ledger | null = null;
    for (const name of revisions) {
      try {
        const candidate = parseLedger(JSON.parse(await readPrivateText(`${this.directory}/${name}`)));
        if (candidate.revision !== (latest?.revision ?? 0) + 1
          || candidate.previousLedgerHash !== (latest ? ledgerHash(latest) : null)) break;
        latest = candidate;
      } catch {
        break;
      }
    }
    return latest;
  }

  async loadValidatedHistory(): Promise<readonly H1Ledger[]> {
    const entries = await readdir(this.directory);
    const revisions = entries.filter((name) => /^revision-\d{6}\.json$/.test(name)).sort();
    if (revisions.length === 0) throw new Error("LEDGER_HISTORY_INVALID");
    const history: H1Ledger[] = [];
    for (const [index, name] of revisions.entries()) {
      const expectedRevision = index + 1;
      if (name !== `revision-${String(expectedRevision).padStart(6, "0")}.json`) {
        throw new Error("LEDGER_HISTORY_INVALID");
      }
      const candidate = parseLedger(JSON.parse(await readPrivateText(`${this.directory}/${name}`)));
      const previous = history.at(-1) ?? null;
      if (candidate.revision !== expectedRevision
        || candidate.previousLedgerHash !== (previous ? ledgerHash(previous) : null)) {
        throw new Error("LEDGER_HISTORY_INVALID");
      }
      assertLegalLedgerTransition(previous, candidate);
      history.push(candidate);
    }
    return Object.freeze(history);
  }

  private revisionPath(revision: number): string {
    return `${this.directory}/revision-${String(revision).padStart(6, "0")}.json`;
  }
}

export function ledgerHash(ledger: H1Ledger): string {
  return createHash("sha256").update(canonicalJson(ledger)).digest("hex");
}

export function parseLedger(value: unknown): H1Ledger {
  if (!isExactRecord(value, LEDGER_KEYS)) throw new Error("LEDGER_INVALID");
  if (Reflect.get(value, "formatVersion") !== H1_LEDGER_FORMAT_VERSION) throw new Error("LEDGER_INVALID");
  const revision = positiveRevision(Reflect.get(value, "revision"));
  const previousLedgerHash = nullableString(Reflect.get(value, "previousLedgerHash"));
  const runId = requiredString(value, "runId");
  const scenarioId = requiredScenario(Reflect.get(value, "scenarioId"));
  const phase = requiredPhase(Reflect.get(value, "phase"));
  const policyHashes: unknown = Reflect.get(value, "policyHashes");
  const payload: unknown = Reflect.get(value, "payload");
  if (!isStringRecord(policyHashes) || !isRecord(payload)) throw new Error("LEDGER_INVALID");
  const repositoryCommit = requiredString(value, "repositoryCommit");
  const runnerSourceHash = requiredString(value, "runnerSourceHash");
  const migrationFingerprint = requiredString(value, "migrationFingerprint");
  const scenarioInputHash = requiredString(value, "scenarioInputHash");
  return Object.freeze({
    formatVersion: H1_LEDGER_FORMAT_VERSION, revision, previousLedgerHash, runId,
    scenarioId, phase, repositoryCommit, runnerSourceHash, policyHashes,
    migrationFingerprint, scenarioInputHash, payload,
  });
}

export function assertLegalLedgerTransition(previous: H1Ledger | null, next: H1Ledger): void {
  if (!previous) {
    if (next.revision !== 1 || next.phase !== "PLANNED") throw new Error("LEDGER_TRANSITION_INVALID");
    return;
  }
  if (previous.runId !== next.runId || previous.scenarioId !== next.scenarioId) {
    throw new Error("LEDGER_IDENTITY_MISMATCH");
  }
  if (previous.phase === next.phase) return;
  const allowed = LEGAL_PHASE_TRANSITIONS[previous.phase];
  if (!allowed.includes(next.phase)) throw new Error("LEDGER_TRANSITION_INVALID");
}

const LEGAL_PHASE_TRANSITIONS: Readonly<Record<H1LedgerPhase, readonly H1LedgerPhase[]>> = Object.freeze({
  PLANNED: transitions("BOOTSTRAPPED", "POST_INTENT_RECORDED", "LOCAL_COMMIT_COMPLETE", "REVIEW_REQUIRED"),
  BOOTSTRAPPED: transitions("POST_INTENT_RECORDED", "LOCAL_COMMIT_COMPLETE", "REVIEW_REQUIRED"),
  POST_INTENT_RECORDED: transitions("POST_RESPONSE_RECORDED", "HUMAN_POST_DECISION_REQUIRED", "REVIEW_REQUIRED"),
  POST_RESPONSE_RECORDED: transitions("POST_INTENT_RECORDED", "HUMAN_POST_DECISION_REQUIRED", "LOCAL_COMMIT_COMPLETE", "REVIEW_REQUIRED"),
  HUMAN_POST_DECISION_REQUIRED: transitions("POST_INTENT_RECORDED", "POST_RESPONSE_RECORDED", "REVIEW_REQUIRED"),
  LOCAL_COMMIT_COMPLETE: transitions("SEALED"),
  REVIEW_REQUIRED: transitions("SEALED"),
  SEALED: transitions("DB_CLEANED"),
  DB_CLEANED: transitions(),
});

function transitions(...phases: H1LedgerPhase[]): readonly H1LedgerPhase[] {
  return Object.freeze(phases);
}

function positiveRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error("LEDGER_INVALID");
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || typeof value === "string") return value;
  throw new Error("LEDGER_INVALID");
}

function requiredScenario(value: unknown): H1Ledger["scenarioId"] {
  if (isScenario(value)) return value;
  throw new Error("LEDGER_INVALID");
}

function requiredPhase(value: unknown): H1LedgerPhase {
  if (isPhase(value)) return value;
  throw new Error("LEDGER_INVALID");
}

function requiredString(value: object, key: string): string {
  const entry: unknown = Reflect.get(value, key);
  if (typeof entry !== "string") throw new Error("LEDGER_INVALID");
  return entry;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every((key) => typeof key === "string" && keys.includes(key));
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isScenario(value: unknown): value is H1Ledger["scenarioId"] {
  return value === "S1" || value === "S2" || value === "S3"
    || value === "S4" || value === "S5" || value === "S6";
}

function isPhase(value: unknown): value is H1LedgerPhase {
  return value === "PLANNED" || value === "BOOTSTRAPPED" || value === "POST_INTENT_RECORDED"
    || value === "POST_RESPONSE_RECORDED" || value === "HUMAN_POST_DECISION_REQUIRED"
    || value === "LOCAL_COMMIT_COMPLETE" || value === "REVIEW_REQUIRED"
    || value === "SEALED" || value === "DB_CLEANED";
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function ledgerRevisionName(path: string): boolean {
  return /^revision-\d{6}\.json$/.test(basename(path));
}
