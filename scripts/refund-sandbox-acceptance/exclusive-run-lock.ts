import { randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, unlink, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "./canonical-json";

export const H1_ADVISORY_LOCK_ID = "7258356198714201";
export const ADVISORY_LOCK_RELEASE_FAILED = "ADVISORY_LOCK_RELEASE_FAILED";

export type ExclusiveRunLock = Readonly<{
  staleLockRecovered: false;
  runProviderContact<T>(contact: () => Promise<T>): Promise<T>;
  release(): Promise<void>;
}>;

export type RunMutationLock = Readonly<{
  assertHeld(): Promise<void>;
  release(): Promise<void>;
}>;
export type AdvisoryLockClient = Readonly<{
  query(
    text: string,
    values: unknown[],
  ): Promise<unknown>;
}>;
type RunMutationKind = "database" | "fixture-population" | "purge-raw";
type LockIdentity = Readonly<{ dev: number; ino: number; uid: number; mode: number }>;

export async function acquireExclusiveRunLock(
  client: AdvisoryLockClient,
  lockPath: string,
  runId: string,
): Promise<ExclusiveRunLock> {
  const result = await client.query(
    "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
    [H1_ADVISORY_LOCK_ID],
  );
  const acquisition = singleAdvisoryResultRow(result);
  if (!acquisition || Reflect.get(acquisition, "acquired") !== true) {
    throw new Error("ADVISORY_LOCK_UNAVAILABLE");
  }
  let fileLock: RunMutationLock | null = null;
  let released = false;
  let advisoryReleaseFailed = false;
  let providerContactActive = false;
  try {
    fileLock = await acquireRunMutationLock(lockPath, runId, "database");
  } catch (error) {
    await releaseAdvisoryLock(client);
    throw error;
  }
  return Object.freeze({
    staleLockRecovered: false as const,
    runProviderContact: async <T>(contact: () => Promise<T>): Promise<T> => {
      if (released || providerContactActive || !fileLock) {
        throw new Error("RUN_MUTATION_LOCK_INTEGRITY_FAILED");
      }
      providerContactActive = true;
      const held = fileLock;
      await held.assertHeld();
      await held.release();
      fileLock = null;
      const outcome = await contact().then(
        (value) => Object.freeze({ ok: true as const, value }),
        (error: unknown) => Object.freeze({ ok: false as const, error }),
      );
      try {
        fileLock = await acquireRunMutationLock(lockPath, runId, "database");
      } catch (error) {
        providerContactActive = false;
        throw new Error("RUN_MUTATION_LOCK_REACQUIRE_FAILED", { cause: error });
      }
      providerContactActive = false;
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    },
    release: async (): Promise<void> => {
      if (advisoryReleaseFailed) throw advisoryReleaseFailure();
      if (released) return;
      released = true;
      const fileRelease = await (fileLock?.release() ?? Promise.resolve()).then(
        () => Object.freeze({ ok: true as const }),
        (error: unknown) => Object.freeze({ ok: false as const, error }),
      );
      try {
        await releaseAdvisoryLock(client);
      } catch {
        advisoryReleaseFailed = true;
        throw advisoryReleaseFailure();
      }
      if (!fileRelease.ok) throw fileRelease.error;
    },
  });
}

async function releaseAdvisoryLock(client: AdvisoryLockClient): Promise<void> {
  let result: unknown;
  try {
    result = await client.query(
      "SELECT pg_advisory_unlock($1::bigint) AS released",
      [H1_ADVISORY_LOCK_ID],
    );
  } catch {
    throw advisoryReleaseFailure();
  }
  if (!validAdvisoryUnlockResult(result)) throw advisoryReleaseFailure();
}

function validAdvisoryUnlockResult(value: unknown): boolean {
  const row = singleAdvisoryResultRow(value);
  if (!row) return false;
  const keys = Reflect.ownKeys(row);
  return keys.length === 1 && keys[0] === "released" && Reflect.get(row, "released") === true;
}

function singleAdvisoryResultRow(value: unknown): object | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rows: unknown = Reflect.get(value, "rows");
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row: unknown = rows[0];
  return typeof row === "object" && row !== null && !Array.isArray(row) ? row : null;
}

function advisoryReleaseFailure(): Error {
  return new Error(ADVISORY_LOCK_RELEASE_FAILED);
}

export async function acquireRunMutationLock(
  lockPath: string,
  runId: string,
  kind: RunMutationKind,
): Promise<RunMutationLock> {
  const directory = dirname(lockPath);
  const token = randomBytes(32).toString("hex");
  let file: FileHandle;
  try {
    file = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600);
  } catch (error) {
    if (isExists(error)) throw new Error("RUN_MUTATION_LOCK_UNAVAILABLE", { cause: error });
    throw error;
  }
  let identity: LockIdentity;
  try {
    const body = `${canonicalJson(Object.freeze({
      formatVersion: 1, runId, kind, pid: process.pid, token,
    }))}\n`;
    await file.writeFile(body, "utf8");
    await file.chmod(0o600);
    await file.sync();
    const metadata = await file.stat();
    identity = Object.freeze({
      dev: metadata.dev, ino: metadata.ino, uid: metadata.uid, mode: metadata.mode,
    });
    await assertOwnedLock(file, lockPath, identity, token, runId, kind);
    await syncDirectory(directory);
  } catch (error) {
    await cleanupFailedAcquisition(file, lockPath, directory, token, runId, kind);
    throw error;
  }
  let released = false;
  return Object.freeze({
    assertHeld: async (): Promise<void> => {
      if (released) throw integrityFailure();
      await assertOwnedLock(file, lockPath, identity, token, runId, kind);
    },
    release: async (): Promise<void> => {
      if (released) return;
      try {
        await assertOwnedLock(file, lockPath, identity, token, runId, kind);
      } catch (error) {
        released = true;
        await file.close();
        throw integrityFailure(error);
      }
      await unlink(lockPath);
      await syncDirectory(directory);
      released = true;
      await file.close();
    },
  });
}

async function assertOwnedLock(
  file: FileHandle,
  lockPath: string,
  identity: LockIdentity,
  token: string,
  runId: string,
  kind: RunMutationKind,
): Promise<void> {
  try {
    const [descriptor, canonical] = await Promise.all([file.stat(), lstat(lockPath)]);
    if (!validLockMetadata(descriptor, canonical, identity)) throw integrityFailure();
    if (descriptor.size < 1 || descriptor.size > 1024) throw integrityFailure();
    const body = Buffer.alloc(descriptor.size);
    const read = await file.read(body, 0, body.length, 0);
    if (read.bytesRead !== body.length) throw integrityFailure();
    const parsed: unknown = JSON.parse(body.toString("utf8"));
    if (!validLockBody(parsed, token, runId, kind)) throw integrityFailure();
  } catch (error) {
    if (error instanceof Error && error.message === "RUN_MUTATION_LOCK_INTEGRITY_FAILED") throw error;
    throw integrityFailure(error);
  }
}

function validLockMetadata(
  descriptor: Stats,
  canonical: Stats,
  identity: LockIdentity,
): boolean {
  return [
    descriptor.isFile(), canonical.isFile(), !canonical.isSymbolicLink(),
    descriptor.dev === identity.dev, descriptor.ino === identity.ino,
    canonical.dev === identity.dev, canonical.ino === identity.ino,
    descriptor.uid === identity.uid, canonical.uid === identity.uid,
    descriptor.uid === expectedOwner(),
    (descriptor.mode & 0o777) === 0o600, (canonical.mode & 0o777) === 0o600,
    descriptor.nlink === 1, canonical.nlink === 1,
  ].every(Boolean);
}

function expectedOwner(): number {
  const owner = process.geteuid?.();
  if (owner === undefined) throw integrityFailure();
  return owner;
}

function validLockBody(
  value: unknown,
  token: string,
  runId: string,
  kind: RunMutationKind,
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 5 || !keys.every((key) => (
    key === "formatVersion" || key === "runId" || key === "kind" || key === "pid" || key === "token"
  ))) return false;
  return Reflect.get(value, "formatVersion") === 1
    && Reflect.get(value, "runId") === runId
    && Reflect.get(value, "kind") === kind
    && Reflect.get(value, "pid") === process.pid
    && Reflect.get(value, "token") === token;
}

async function cleanupFailedAcquisition(
  file: FileHandle,
  lockPath: string,
  directory: string,
  token: string,
  runId: string,
  kind: RunMutationKind,
): Promise<void> {
  try {
    const metadata = await file.stat();
    const identity = Object.freeze({
      dev: metadata.dev, ino: metadata.ino, uid: metadata.uid, mode: metadata.mode,
    });
    await assertOwnedLock(file, lockPath, identity, token, runId, kind);
    await unlink(lockPath);
    await syncDirectory(directory);
  } catch {
    // A path or link-integrity failure is intentionally left for human inspection.
  } finally {
    await file.close();
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function integrityFailure(cause?: unknown): Error {
  return new Error("RUN_MUTATION_LOCK_INTEGRITY_FAILED", { cause });
}

function isExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
