import { constants } from "node:fs";
import {
  chmod, link, lstat, mkdir, open, readFile, realpath, rename, rm, stat, unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalJson } from "./canonical-json";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(path, DIRECTORY_MODE);
  const metadata = await stat(path);
  if (!metadata.isDirectory() || (metadata.mode & 0o777) !== DIRECTORY_MODE) {
    throw new Error("PRIVATE_DIRECTORY_INVALID");
  }
}

export async function assertExternalArtifactRoot(
  root: string,
  worktree: string,
): Promise<string> {
  if (!isAbsolute(root) || !isAbsolute(worktree)) throw new Error("ARTIFACT_PATH_INVALID");
  await ensurePrivateDirectory(root);
  const [resolvedRoot, resolvedWorktree] = await Promise.all([realpath(root), realpath(worktree)]);
  if (isWithin(resolvedRoot, resolvedWorktree)) throw new Error("ARTIFACT_ROOT_INSIDE_WORKTREE");
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || (metadata.mode & 0o777) !== DIRECTORY_MODE) {
    throw new Error("ARTIFACT_ROOT_INVALID");
  }
  return resolvedRoot;
}

export async function assertExistingExternalArtifactRoot(
  root: string,
  worktree: string,
): Promise<string> {
  if (!isAbsolute(root) || !isAbsolute(worktree)) throw new Error("ARTIFACT_PATH_INVALID");
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()
    || (metadata.mode & 0o777) !== DIRECTORY_MODE || metadata.uid !== expectedOwner()) {
    throw new Error("ARTIFACT_ROOT_INVALID");
  }
  const [resolvedRoot, resolvedWorktree] = await Promise.all([realpath(root), realpath(worktree)]);
  if (isWithin(resolvedRoot, resolvedWorktree)) throw new Error("ARTIFACT_ROOT_INSIDE_WORKTREE");
  return resolvedRoot;
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteText(path, `${canonicalJson(value)}\n`);
}

export async function atomicCreateJson(path: string, value: unknown): Promise<void> {
  const body = `${canonicalJson(value)}\n`;
  try {
    if (await readPrivateText(path) !== body) throw new Error("IMMUTABLE_FILE_MISMATCH");
    return;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  await atomicWriteText(path, body);
}

export async function atomicWriteText(path: string, value: string): Promise<void> {
  const directory = dirname(path);
  await ensurePrivateDirectory(directory);
  const temporary = join(directory, `.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, FILE_MODE);
    try {
      await file.writeFile(value, "utf8");
      await file.chmod(FILE_MODE);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    await syncDirectory(directory);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export type NoClobberPublicationDependencies = Readonly<{
  beforePublish?: () => Promise<void>;
  afterPublish?: () => Promise<void>;
  afterFirstDirectorySync?: () => Promise<void>;
  afterTemporaryRemoval?: () => Promise<void>;
}>;

export class NoClobberPublicationError extends Error {
  constructor(
    readonly state: "NOT_COMMITTED" | "ALREADY_EXISTS" | "COMMITTED_AMBIGUOUS",
    options?: ErrorOptions,
  ) {
    super(`NO_CLOBBER_PUBLICATION_${state}`, options);
    this.name = "NoClobberPublicationError";
  }
}

export async function publishPrivateTextNoClobber(
  path: string,
  value: string,
  owner: number,
  validateCandidate: (temporaryPath: string) => Promise<void>,
  dependencies: NoClobberPublicationDependencies = Object.freeze({}),
): Promise<void> {
  const directory = dirname(path);
  await assertPrivateOwnedDirectory(directory, owner);
  const temporary = join(
    directory,
    `.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.population-tmp`,
  );
  let committed = false;
  try {
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, FILE_MODE);
    try {
      await file.writeFile(value, "utf8");
      await file.chmod(FILE_MODE);
      await file.sync();
    } finally {
      await file.close();
    }
    await assertPrivateOwnedFile(temporary, owner);
    await validateCandidate(temporary);
    await dependencies.beforePublish?.();
    await link(temporary, path);
    committed = true;
    await dependencies.afterPublish?.();
    await syncDirectory(directory);
    await dependencies.afterFirstDirectorySync?.();
    await unlink(temporary);
    await dependencies.afterTemporaryRemoval?.();
    await syncDirectory(directory);
    await assertPrivateOwnedFile(path, owner);
  } catch (error) {
    if (committed) {
      throw new NoClobberPublicationError("COMMITTED_AMBIGUOUS", { cause: error });
    }
    try {
      await rm(temporary, { force: true });
      await syncDirectory(directory);
    } catch (cleanupError) {
      throw new NoClobberPublicationError("NOT_COMMITTED", { cause: cleanupError });
    }
    if (isExists(error)) {
      throw new NoClobberPublicationError("ALREADY_EXISTS", { cause: error });
    }
    throw new NoClobberPublicationError("NOT_COMMITTED", { cause: error });
  }
}

export async function readPrivateText(path: string): Promise<string> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== FILE_MODE
    || metadata.nlink !== 1 || metadata.uid !== expectedOwner()) {
    throw new Error("PRIVATE_FILE_INVALID");
  }
  return readFile(path, "utf8");
}

export async function ordinaryDelete(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

export function safeChild(root: string, ...segments: readonly string[]): string {
  const child = resolve(root, ...segments);
  if (!isWithin(child, resolve(root)) || child === resolve(root)) throw new Error("ARTIFACT_PATH_ESCAPE");
  return child;
}

function isWithin(candidate: string, parent: string): boolean {
  const path = relative(parent, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function assertPrivateOwnedDirectory(path: string, owner: number): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()
    || (metadata.mode & 0o777) !== DIRECTORY_MODE || metadata.uid !== owner) {
    throw new Error("PRIVATE_DIRECTORY_INVALID");
  }
}

async function assertPrivateOwnedFile(path: string, owner: number) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()
    || (metadata.mode & 0o777) !== FILE_MODE || metadata.uid !== owner
    || metadata.nlink !== 1) {
    throw new Error("PRIVATE_FILE_INVALID");
  }
  return metadata;
}

async function syncDirectory(directory: string): Promise<void> {
  const directoryHandle = await open(directory, constants.O_RDONLY);
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

function expectedOwner(): number {
  const owner = process.geteuid?.();
  if (owner === undefined) throw new Error("ARTIFACT_OWNER_UNAVAILABLE");
  return owner;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
