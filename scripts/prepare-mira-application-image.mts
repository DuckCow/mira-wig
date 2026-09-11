import { spawn, execFileSync } from "node:child_process";
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleMiraApplicationContext } from "./build-mira-application-context.mjs";
import { refundArtifactEnvironment } from "./refund-artifact-environment.mjs";
import { fileSha256, publishRetainedArtifact, readRetainedArtifact, writeReceipt } from "./refund-artifact-retention.mjs";
import { readOciIdentity } from "./verify-refund-worker-reproducibility.mjs";

const repository = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/mira-application";
const environment = () => ({ ...refundArtifactEnvironment(), NEXT_TELEMETRY_DISABLED: "1" });
function capture(file: string, args: string[]) {
  return execFileSync(file, args, { env: environment(), encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }).trim();
}
async function command(directory: string, label: string, file: string, args: string[]) {
  await appendFile(join(directory, "commands.jsonl"), `${JSON.stringify({ label, file, args, attemptedAt: new Date().toISOString() })}\n`);
  const log = await open(join(directory, `${label}.log`), "wx", 0o600);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(file, args, { env: environment(), stdio: ["ignore", log.fd, log.fd] });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`APPLICATION_COMMAND_FAILED:${label}`)));
    });
  } finally { await log.close(); }
}

export async function prepareMiraApplication(directory: string, buildEnvironmentFile: string) {
  if (!isAbsolute(directory) || !isAbsolute(buildEnvironmentFile)) throw new Error("APPLICATION_PATH_INVALID");
  await requireSyntheticBuildEnvironment(buildEnvironmentFile);
  if (capture("git", ["status", "--porcelain", "--untracked-files=all"])) throw new Error("APPLICATION_SOURCE_NOT_FROZEN");
  await mkdir(directory, { mode: 0o700 });
  const sourceCommit = capture("git", ["rev-parse", "HEAD"]);
  const sourceTree = capture("git", ["rev-parse", "HEAD^{tree}"]);
  const tag = `${repository}:p3e-b2-${sourceCommit.slice(0, 12)}`;
  if (capture("docker", ["image", "ls", "--filter", `reference=${tag}`, "--format", "{{.ID}}"])) throw new Error("APPLICATION_LOCAL_TAG_EXISTS");
  const context = await assembleMiraApplicationContext(join(directory, "context"));
  await writeReceipt(directory, "source.json", { sourceCommit, sourceTree, tag, contextSha256: context.sha256,
    contextFileCount: context.entries.length, docker: capture("docker", ["version", "--format", "{{json .}}"]),
    builder: capture("docker", ["buildx", "inspect"]), rootLockSha256: await fileSha256("package-lock.json"),
    buildConfiguration: "SYNTHETIC_IMPORT_VALUES_VIA_EPHEMERAL_SECRET_MOUNT", buildConfigurationSha256: await fileSha256(buildEnvironmentFile), publicBuildConfiguration: "NO_NEXT_PUBLIC_VALUES",
    workerBootstrapWorkflowsInvoked: 0 });
  await command(directory, "context-archive", "tar", ["-cf", join(directory, "context.tar"), "-C", join(directory, "context"), "."]);
  const layout = join(directory, "oci");
  await command(directory, "image-build", "docker", ["buildx", "build", "--platform", "linux/amd64", "--no-cache",
    "--provenance=false", "--sbom=false", "--build-arg", `SOURCE_COMMIT=${sourceCommit}`,
    "--secret", `id=build-env,src=${buildEnvironmentFile}`, "--metadata-file", join(directory, "build-metadata.json"),
    "--output", `type=oci,dest=${layout},tar=false`, "--tag", tag,
    "--file", join(directory, "context/containers/mira-application/Dockerfile"), join(directory, "context")]);
  const identity = await readOciIdentity(layout);
  const archive = join(directory, "image.oci.tar");
  await command(directory, "archive", "tar", ["-cf", archive, "-C", layout, "."]);
  await writeReceipt(directory, "build.json", { sourceCommit, sourceTree, tag, contextSha256: context.sha256,
    contextFileCount: context.entries.length, archive, archiveSha256: await fileSha256(archive), identity,
    manifestDigest: `sha256:${identity.childManifestRawSha256}`, buildSucceeded: true });
  await command(directory, "load", "docker", ["image", "load", "--input", archive]);
  if (capture("docker", ["image", "inspect", "--format", "{{.Id}}", tag]) !== `sha256:${identity.childManifestRawSha256}`) {
    throw new Error("APPLICATION_LOADED_MANIFEST_MISMATCH");
  }
  await writeReceipt(directory, "verified.json", { sourceCommit, sourceTree, tag, contextSha256: context.sha256,
    contextFileCount: context.entries.length, archive, archiveSha256: await fileSha256(archive), identity,
    manifestDigest: `sha256:${identity.childManifestRawSha256}`, loadedManifestMatches: true,
    deploymentAuthority: "ABSENT" });
}

async function requireSyntheticBuildEnvironment(file: string) {
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  const fixed = { DATABASE_URL: "postgresql://unused@127.0.0.1:9/image_build_unused", NEXTAUTH_URL: "http://127.0.0.1:8080",
    STORAGE_PROVIDER: "mock", PAYMENT_MODE: "SANDBOX", MIRA_REFUND_AUTHORIZATION_ENABLED: "DISABLED" };
  const synthetic = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXTAUTH_SECRET"];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("APPLICATION_BUILD_ENVIRONMENT_INVALID");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(fields).length !== Object.keys(fixed).length + synthetic.length
    || Object.entries(fixed).some(([key, expected]) => fields[key]?.value !== expected)
    || synthetic.some((key) => typeof fields[key]?.value !== "string" || !/^mira-build-only-[a-f0-9]{32}$/u.test(String(fields[key]?.value)))) {
    throw new Error("APPLICATION_BUILD_ENVIRONMENT_INVALID");
  }
}

export async function publishMiraApplication(directory: string, attempt: 1 | 2) {
  const receipt = await readRetainedArtifact(directory);
  if (!receipt.tag.startsWith(`${repository}:p3e-b2-`)) throw new Error("APPLICATION_TAG_INVALID");
  await publishRetainedArtifact(directory, attempt, async (tag) => {
    if (capture("docker", ["image", "inspect", "--format", "{{.Id}}", tag]) !== receipt.manifestDigest) throw new Error("APPLICATION_PUBLICATION_IMAGE_CHANGED");
    await command(directory, `push-${attempt}`, "docker", ["push", tag]);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, directory, value] = process.argv.slice(2);
  if (!directory || !value || process.argv.length !== 5) throw new Error("APPLICATION_ARGUMENT_INVALID");
  if (mode === "prepare") await prepareMiraApplication(directory, value);
  else if (mode === "publish" && (value === "1" || value === "2")) await publishMiraApplication(directory, value === "1" ? 1 : 2);
  else throw new Error("APPLICATION_ARGUMENT_INVALID");
}
