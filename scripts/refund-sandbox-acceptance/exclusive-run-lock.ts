import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import type { Client } from "pg";
import { atomicWriteJson } from "./atomic-files";

export const H1_ADVISORY_LOCK_ID = "7258356198714201";

export type ExclusiveRunLock = Readonly<{
  staleLockRecovered: boolean;
  release(): Promise<void>;
}>;

export async function acquireExclusiveRunLock(
  client: Client,
  lockPath: string,
  runId: string,
): Promise<ExclusiveRunLock> {
  const result = await client.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
    [H1_ADVISORY_LOCK_ID],
  );
  if (result.rows[0]?.acquired !== true) throw new Error("ADVISORY_LOCK_UNAVAILABLE");
  let staleLockRecovered = false;
  let archivedPath: string | null = null;
  try {
    try {
      const file = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      await file.close();
    } catch (error) {
      if (!isExists(error)) throw error;
      archivedPath = `${lockPath}.stale-${Date.now()}`;
      await rename(lockPath, archivedPath);
      staleLockRecovered = true;
    }
    await atomicWriteJson(lockPath, Object.freeze({ formatVersion: 1, runId, pid: process.pid }));
  } catch (error) {
    await client.query("SELECT pg_advisory_unlock($1::bigint)", [H1_ADVISORY_LOCK_ID]);
    throw error;
  }
  return Object.freeze({
    staleLockRecovered,
    release: async () => {
      await rm(lockPath, { force: true });
      if (archivedPath) await rm(archivedPath, { force: true });
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [H1_ADVISORY_LOCK_ID]);
    },
  });
}

function isExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
