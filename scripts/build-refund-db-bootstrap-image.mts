import { refundArtifactEnvironment } from "./refund-artifact-environment.mjs";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleRefundDbBootstrapBuildContext } from "./build-refund-db-bootstrap-context.mjs";

const TAG = /^asia-northeast3-docker\.pkg\.dev\/mira-refund-sandbox-0001\/mira-p3e-sbx-refund-images\/refund-db-bootstrap:p3e-b2-[0-9a-f]{12}$/u;

async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const tag = args[0];
  const sourceCommit = args[1];
  if (args.length !== 2 || !tag || !TAG.test(tag)
    || !sourceCommit || !/^[0-9a-f]{40}$/u.test(sourceCommit)
    || tag.slice(-12) !== sourceCommit.slice(0, 12)) {
    throw new Error("DB_BOOTSTRAP_IMAGE_BUILD_INPUT_INVALID");
  }
  requireLocalTagAbsent(tag);
  const context = await assembleRefundDbBootstrapBuildContext();
  const proofDirectory = await mkdtemp(join(tmpdir(), "mira-refund-db-bootstrap-image-"));
  const iidFile = join(proofDirectory, "iid");
  try {
    execFileSync("docker", [
      "buildx", "build",
      "--platform=linux/amd64",
      "--load",
      "--no-cache",
      "--provenance=false",
      "--sbom=false",
      "--build-arg", `SOURCE_COMMIT=${sourceCommit}`,
      "--iidfile", iidFile,
      "--tag", tag,
      "--file", "containers/refund-db-bootstrap/Dockerfile",
      context.directory,
    ], { env: refundArtifactEnvironment(), stdio: "inherit" });
    const imageId = (await readFile(iidFile, "utf8")).trim();
    process.stdout.write(`${JSON.stringify({
      tag,
      sourceCommit,
      imageId,
      contextFileCount: context.manifestEntries.length,
      contextManifestSha256: context.manifestDigest,
      migrationCount: context.migrationCount,
      migrationSha256: context.migrationDigest,
    })}\n`);
  } finally {
    await context.cleanup();
    await rm(proofDirectory, { recursive: true, force: true });
  }
}

function requireLocalTagAbsent(tag: string): void {
  try {
    execFileSync("docker", ["image", "inspect", tag], { env: refundArtifactEnvironment(), stdio: "ignore" });
  } catch {
    return;
  }
  throw new Error("DB_BOOTSTRAP_LOCAL_IMAGE_TAG_COLLISION");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) await main();
