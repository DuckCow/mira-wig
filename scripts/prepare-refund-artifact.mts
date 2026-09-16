import { spawn, execFileSync } from "node:child_process";
import { open, mkdir, copyFile, appendFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleRefundWorkerBuildContext } from "./build-refund-worker-bundles.mjs";
import { assembleRefundDbBootstrapBuildContext } from "./build-refund-db-bootstrap-context.mjs";
import { refundArtifactEnvironment } from "./refund-artifact-environment.mjs";
import { fileSha256, publishRetainedArtifact, readRetainedArtifact, writeReceipt } from "./refund-artifact-retention.mjs";
import { readOciIdentity } from "./verify-refund-worker-reproducibility.mjs";
import { verifyExistingRefundWorkerImage } from "./verify-refund-worker-image.mjs";
import { verifyRefundDbBootstrapImage } from "./verify-refund-db-bootstrap-image.mjs";

type Component = "worker" | "db-bootstrap";
const repository = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images";

async function command(directory: string, label: string, executable: string, args: string[]): Promise<void> {
  await appendFile(join(directory, "commands.jsonl"), `${JSON.stringify({ label, executable, args, attemptedAt: new Date().toISOString() })}\n`);
  const log = await open(join(directory, `${label}.log`), "wx", 0o600);
  try {
    await new Promise<void>((resolveCommand, reject) => {
      const child = spawn(executable, args, { env: refundArtifactEnvironment(), stdio: ["ignore", log.fd, log.fd] });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolveCommand() : reject(new Error(`ARTIFACT_COMMAND_FAILED:${label}`)));
    });
  } finally { await log.close(); }
}

function capture(args: string[]): string {
  return execFileSync("docker", args, { env: refundArtifactEnvironment(), encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
}

export async function prepareRefundArtifact(component: Component, directory: string): Promise<void> {
  if (!isAbsolute(directory)) throw new Error("ARTIFACT_DIRECTORY_MUST_BE_ABSOLUTE");
  await mkdir(directory, { mode: 0o700 }); // Never overwrite a prior attempt.
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  if (execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).trim()) throw new Error("ARTIFACT_SOURCE_NOT_FROZEN");
  const tag = `${repository}/refund-${component}:p3e-b2-${sourceCommit.slice(0,12)}`;
  const existing = capture(["image", "ls", "--filter", `reference=${tag}`, "--format", "{{.ID}}"]);
  if (existing) throw new Error("ARTIFACT_LOCAL_REFERENCE_EXISTS");
  await writeReceipt(directory, "source.json", { component, sourceCommit, sourceTree, tag,
    acceptedFinancialSource: "35388a920ce6407e974d9dfe3cc97da52107f0e5",
    rootLockSha256: await fileSha256("package-lock.json"),
    assemblerSha256: await fileSha256(`scripts/${component === "worker" ? "build-refund-worker-bundles" : "build-refund-db-bootstrap-context"}.mts`),
    environmentControls: Object.keys(refundArtifactEnvironment()).sort(),
    dockerVersion: capture(["version", "--format", "{{json .}}"]),
    builder: capture(["buildx", "inspect"]),
  });
  const first = await buildOci(component, directory, "candidate-1", tag, sourceCommit);
  const identity = await readOciIdentity(first.layout);
  const archive = join(directory, "image.oci.tar");
  await command(directory, "archive", "tar", ["-cf", archive, "-C", first.layout, "."]);
  const retained = { tag, archive, archiveSha256: await fileSha256(archive), manifestDigest: `sha256:${identity.childManifestRawSha256}` };
  await writeReceipt(directory, "build.json", { ...retained, sourceCommit, sourceTree, context: first.context, identity, buildSucceeded: true });
  if (component === "worker") await compareWorkerBuild(directory, tag, sourceCommit, first, identity);
  await command(directory, "load", "docker", ["image", "load", "--input", archive]);
  const verification = await verifyLoadedArtifact(component, directory, sourceCommit, retained, first.context.manifestSha256);
  await writeReceipt(directory, "verified.json", { ...retained, sourceCommit, sourceTree, context: first.context, identity, verification, deploymentAuthority: "ABSENT" });
}

async function compareWorkerBuild(directory: string, tag: string, sourceCommit: string,
  first: Awaited<ReturnType<typeof buildOci>>, identity: Awaited<ReturnType<typeof readOciIdentity>>) {
    // The installed R2A contract requires two independent OCI builds. These are
    // the two candidate invocations, not two extra builds after a smoke image.
    const second = await buildOci("worker", directory, "candidate-2", tag, sourceCommit);
    const other = await readOciIdentity(second.layout);
    if (JSON.stringify(identity) !== JSON.stringify(other) || first.context.manifestSha256 !== second.context.manifestSha256) {
      throw new Error("ARTIFACT_OCI_REPRODUCIBILITY_MISMATCH");
    }
    await writeReceipt(directory, "reproducibility.json", { builds: 2, match: true, first: identity, second: other });
}

async function verifyLoadedArtifact(component: Component, directory: string, sourceCommit: string,
  retained: Awaited<ReturnType<typeof readRetainedArtifact>>, contextDigest: string) {
  const inspection: unknown = JSON.parse(capture(["image", "inspect", retained.tag]));
  if (!Array.isArray(inspection) || inspection.length !== 1 || loadedManifestId(inspection[0]) !== retained.manifestDigest) throw new Error("ARTIFACT_LOADED_MANIFEST_MISMATCH");
  await writeReceipt(directory, "inspection.json", inspection);
  const verification = component === "worker"
    ? await verifyExistingRefundWorkerImage(retained.tag, true)
    : await verifyRefundDbBootstrapImage([retained.tag, sourceCommit], true);
  if ("contextManifestDigest" in verification && verification.contextManifestDigest !== contextDigest) throw new Error("ARTIFACT_VERIFICATION_CONTEXT_CHANGED");
  return verification;
}

function loadedManifestId(value: unknown): unknown {
  return value && typeof value === "object" && "Id" in value ? value.Id : undefined;
}

async function buildOci(component: Component, directory: string, label: string, tag: string, sourceCommit: string) {
  const context = component === "worker" ? await assembleRefundWorkerBuildContext() : await assembleRefundDbBootstrapBuildContext();
  const destination = join(directory, label);
  await mkdir(destination, { mode: 0o700 });
  await copyFile(context.manifestPath, join(destination, "context-manifest.json"));
  const summary = { manifestSha256: context.manifestDigest, fileCount: context.manifestEntries.length,
    migrationCount: "migrationInventory" in context ? context.migrationInventory.migrationCount : context.migrationCount,
    migrationSha256: "migrationInventory" in context ? context.migrationInventory.migrationDigest : context.migrationDigest };
  await writeReceipt(destination, "context.json", { ...summary, assemblyDirectory: context.directory });
  await command(destination, "context-archive", "tar", ["-cf", join(destination, "context.tar"), "-C", context.directory, "."]);
  const layout = join(destination, "oci");
  try {
    await command(destination, "image-build", "docker", ["buildx", "build", "--platform", "linux/amd64", "--no-cache",
      "--provenance=false", "--sbom=false", "--build-arg", `SOURCE_DATE_EPOCH=${component === "worker" ? "1784764800" : "1788130800"}`,
      ...(component === "db-bootstrap" ? ["--build-arg", `SOURCE_COMMIT=${sourceCommit}`] : []),
      "--metadata-file", join(destination, "build-metadata.json"),
      "--output", `type=oci,dest=${layout},tar=false,rewrite-timestamp=true`, "--tag", tag,
      "--file", join(context.directory, `containers/refund-${component}/Dockerfile`), context.directory]);
    await writeReceipt(destination, "oci-identity.json", await readOciIdentity(layout));
    return { layout, context: summary };
  } finally {
    // Archives and every earlier receipt remain owned by the release task.
    await context.cleanup();
  }
}

async function publish(directory: string, attempt: 1 | 2) {
  await publishRetainedArtifact(directory, attempt, async (tag) => {
    const retained = await readRetainedArtifact(directory);
    if (capture(["image", "inspect", "--format", "{{.Id}}", tag]) !== retained.manifestDigest) throw new Error("ARTIFACT_PUBLICATION_IMAGE_CHANGED");
    await command(directory, `push-${attempt}`, "docker", ["push", tag]);
  });
}

function publicationAttempt(value: string): 1 | 2 {
  if (value === "1") return 1;
  if (value === "2") return 2;
  throw new Error("ARTIFACT_ATTEMPT_INVALID");
}

async function main(args: string[]) {
  if (args.length !== 3) throw new Error("ARTIFACT_ARGUMENT_INVALID");
  const [mode, subject, directory] = args;
  if (!subject || !directory) throw new Error("ARTIFACT_ARGUMENT_INVALID");
  if (mode === "prepare") {
    if (subject !== "worker" && subject !== "db-bootstrap") throw new Error("ARTIFACT_COMPONENT_INVALID");
    await prepareRefundArtifact(subject, resolve(directory));
  } else if (mode === "publish") {
    await publish(resolve(subject), publicationAttempt(directory));
  } else throw new Error("ARTIFACT_ARGUMENT_INVALID");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
