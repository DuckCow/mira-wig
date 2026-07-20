import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { chmod, lstat, mkdir, readdir } from "node:fs/promises";
import { atomicWriteJson, atomicWriteText, ensurePrivateDirectory, safeChild } from "./atomic-files";
import { fixtureManifestTemplate } from "./fixture-manifest";
import { parseRunId } from "./contracts";

export const H1_ARTIFACT_PARENT = join(homedir(), ".mira", "refund-sandbox-acceptance");

export type RawArtifactReference = Readonly<{ hash: string; size: number; relativePath: string }>;

export class H1ArtifactStore {
  readonly runDirectory: string;

  constructor(readonly root: string, readonly runId: string) {
    this.runDirectory = safeChild(root, parseRunId(runId));
  }

  async initialize(): Promise<void> {
    await ensurePrivateDirectory(this.root);
    await mkdir(this.runDirectory, { mode: 0o700 });
    await chmod(this.runDirectory, 0o700);
    for (const child of ["ledger", "raw", "sealed", "sanitized", "locks"]) {
      await ensurePrivateDirectory(safeChild(this.runDirectory, child));
    }
    const key = randomBytes(32);
    await atomicWriteText(this.path("raw", "hmac.key"), key.toString("hex"));
    await atomicWriteJson(this.path("fixtures.json"), fixtureManifestTemplate(this.runId));
  }

  path(...segments: readonly string[]): string {
    return safeChild(this.runDirectory, ...segments);
  }

  async writeRaw(name: string, value: unknown): Promise<RawArtifactReference> {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name)) throw new Error("RAW_ARTIFACT_NAME_INVALID");
    const body = `${JSON.stringify(value)}\n`;
    const path = this.path("raw", name);
    await atomicWriteText(path, body);
    return Object.freeze({
      hash: createHash("sha256").update(body).digest("hex"),
      size: Buffer.byteLength(body),
      relativePath: `raw/${name}`,
    });
  }

  async assertModes(): Promise<void> {
    await assertTreeModes(this.runDirectory, true);
  }
}

async function assertTreeModes(path: string, directory: boolean): Promise<void> {
  const metadata = await lstat(path);
  const expected = directory ? 0o700 : 0o600;
  if (metadata.isSymbolicLink() || (metadata.mode & 0o777) !== expected
    || metadata.uid !== expectedOwner() || (!directory && metadata.nlink !== 1)) {
    throw new Error("ARTIFACT_MODE_INVALID");
  }
  if (!directory) return;
  for (const child of await readdir(path, { withFileTypes: true })) {
    if (child.isSymbolicLink()) throw new Error("ARTIFACT_SYMLINK_FORBIDDEN");
    await assertTreeModes(join(path, child.name), child.isDirectory());
  }
}

function expectedOwner(): number {
  const owner = process.geteuid?.();
  if (owner === undefined) throw new Error("ARTIFACT_OWNER_UNAVAILABLE");
  return owner;
}
