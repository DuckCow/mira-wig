import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadRefundWorkerRepositoryMigrations,
  REFUND_WORKER_MIGRATIONS_DIRECTORY,
} from "../worker-migration-readiness";

const FIRST = "20260720000000_first";
const SECOND = "20260720000001_second_migration";
const cleanupPaths: string[] = [];

afterEach(async () => {
  process.chdir(dirname(dirname(REFUND_WORKER_MIGRATIONS_DIRECTORY)));
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("refund worker fixed migration filesystem authority", () => {
  it("loads a valid inventory in deterministic name order and hashes exact raw bytes", async () => {
    const root = await migrationRoot();
    const raw = Buffer.from([0, 10, 13, 255]);
    await addMigration(root, SECOND, "second");
    await addMigration(root, FIRST, raw);

    expect(await loadRefundWorkerRepositoryMigrations(root)).toEqual([
      { name: FIRST, checksum: createHash("sha256").update(raw).digest("hex") },
      { name: SECOND, checksum: createHash("sha256").update("second").digest("hex") },
    ]);
  });

  it("rejects a missing migration root", async () => {
    const parent = await temporaryDirectory();
    await expect(loadRefundWorkerRepositoryMigrations(join(parent, "missing"))).rejects.toThrow();
  });

  it("rejects a migration root symlink", async () => {
    const target = await migrationRoot();
    const link = `${target}-link`;
    cleanupPaths.push(link);
    await symlink(target, link, "dir");

    await expect(loadRefundWorkerRepositoryMigrations(link)).rejects.toThrow();
  });

  it.each([
    ".hidden",
    "bad-name",
    `20260720000000_${"a".repeat(129)}`,
  ])("rejects malformed migration root entry %s", async (name) => {
    const root = await migrationRoot();
    await mkdir(join(root, name));
    await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
  });

  it("rejects a canonical-looking non-directory root child", async () => {
    const root = await migrationRoot();
    await writeFile(join(root, FIRST), "unexpected");
    await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
  });

  it("rejects a migration-directory symlink", async () => {
    const root = await migrationRoot();
    const target = await temporaryDirectory();
    await writeFile(join(target, "migration.sql"), "select 1;");
    await symlink(target, join(root, FIRST), "dir");
    await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
  });

  it("rejects a missing migration.sql", async () => {
    const root = await migrationRoot();
    await mkdir(join(root, FIRST));
    await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
  });

  it("rejects a migration.sql symlink", async () => {
    const root = await migrationRoot();
    const directory = join(root, FIRST);
    const targetDirectory = await temporaryDirectory();
    const target = join(targetDirectory, "target.sql");
    await mkdir(directory);
    await writeFile(target, "select 1;");
    await symlink(target, join(directory, "migration.sql"), "file");
    await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
  });

  it("rejects a nonregular migration.sql", async () => {
    const root = await migrationRoot();
    const directory = join(root, FIRST);
    await mkdir(directory);
    await mkdir(join(directory, "migration.sql"));
    await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
  });

  it("rejects an unexpected additional migration file", async () => {
    const root = await migrationRoot();
    const directory = await addMigration(root, FIRST, "select 1;");
    await writeFile(join(directory, "unexpected.txt"), "unexpected");
    await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
  });

  it("rejects an unreadable migration file", async () => {
    const root = await migrationRoot();
    const directory = await addMigration(root, FIRST, "select 1;");
    const file = join(directory, "migration.sql");
    await chmod(file, 0o000);
    try {
      await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
    } finally {
      await chmod(file, 0o600);
    }
  });

  it("rejects an unreadable migration directory", async () => {
    const root = await migrationRoot();
    const directory = await addMigration(root, FIRST, "select 1;");
    await chmod(directory, 0o000);
    try {
      await expect(loadRefundWorkerRepositoryMigrations(root)).rejects.toThrow();
    } finally {
      await chmod(directory, 0o700);
    }
  });

  it("uses the module-relative committed migration root from a different cwd", async () => {
    const alternateCwd = await temporaryDirectory();
    const originalCwd = process.cwd();
    process.chdir(alternateCwd);
    try {
      const migrations = await loadRefundWorkerRepositoryMigrations();
      expect(migrations).toHaveLength(40);
      expect(migrations[0]?.name).toBe("20260609111830_init");
    } finally {
      process.chdir(originalCwd);
    }
  });
});

async function migrationRoot(): Promise<string> {
  const root = await temporaryDirectory();
  await writeFile(join(root, "migration_lock.toml"), 'provider = "postgresql"\n');
  return root;
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "mira-refund-worker-migrations-"));
  cleanupPaths.push(path);
  return path;
}

async function addMigration(
  root: string,
  name: string,
  body: string | Uint8Array,
): Promise<string> {
  const directory = join(root, name);
  await mkdir(directory);
  await writeFile(join(directory, "migration.sql"), body);
  return directory;
}
