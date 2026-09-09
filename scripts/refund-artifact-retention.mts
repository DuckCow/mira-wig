import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function fileSha256(path: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const value of createReadStream(path)) {
    const chunk: unknown = value;
    if (!(chunk instanceof Uint8Array)) throw new Error("ARTIFACT_BYTES_INVALID");
    digest.update(chunk);
  }
  return digest.digest("hex");
}

export async function writeReceipt(directory: string, name: string, value: unknown): Promise<void> {
  await writeFile(join(directory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

export type RetainedArtifact = Readonly<{
  tag: string; archive: string; archiveSha256: string; manifestDigest: string;
}>;

export async function readRetainedArtifact(directory: string): Promise<RetainedArtifact> {
  const value: unknown = JSON.parse(await readFile(join(directory, "verified.json"), "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ARTIFACT_RECEIPT_INVALID");
  const tag = requiredString(value, "tag");
  const archive = requiredString(value, "archive");
  const archiveSha256 = requiredString(value, "archiveSha256");
  const manifestDigest = requiredString(value, "manifestDigest");
  if (archive !== join(directory, "image.oci.tar")) throw new Error("ARTIFACT_ARCHIVE_PATH_INVALID");
  return { tag, archive, archiveSha256, manifestDigest };
}

function requiredString(record: object, key: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  const value: unknown = descriptor?.value;
  if (typeof value !== "string") throw new Error("ARTIFACT_RECEIPT_INVALID");
  return value;
}

// An attempt is recorded before the external command. Failure adds a result but
// never cleans the build receipt, verification, or archive. Callers adjudicate a
// remote outcome before invoking a separately authorized second attempt.
export async function publishRetainedArtifact(
  directory: string,
  attempt: 1 | 2,
  push: (tag: string) => Promise<void>,
): Promise<void> {
  const artifact = await readRetainedArtifact(directory);
  if (!/^asia-northeast3-docker\.pkg\.dev\/mira-refund-sandbox-0001\/mira-p3e-sbx-refund-images\/refund-(worker|db-bootstrap):p3e-b2-[0-9a-f]{12}$/u.test(artifact.tag)
    || !/^sha256:[0-9a-f]{64}$/u.test(artifact.manifestDigest)
    || await fileSha256(artifact.archive) !== artifact.archiveSha256) throw new Error("RETAINED_ARTIFACT_INVALID");
  await writeReceipt(directory, `publication-${attempt}-attempt.json`, { tag: artifact.tag, manifestDigest: artifact.manifestDigest, attemptedAt: new Date().toISOString() });
  try { await push(artifact.tag); }
  catch {
    await writeReceipt(directory, `publication-${attempt}-result.json`, { commandSucceeded: false, remoteOutcome: "REQUIRES_READBACK", retainedBuild: true });
    throw new Error("PUBLICATION_FAILED_BUILD_RETAINED");
  }
  await writeReceipt(directory, `publication-${attempt}-result.json`, { commandSucceeded: true, remoteOutcome: "REQUIRES_READBACK", retainedBuild: true });
}
