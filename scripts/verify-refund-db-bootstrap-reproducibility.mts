import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleRefundDbBootstrapBuildContext } from "./build-refund-db-bootstrap-context.mjs";

const SOURCE_DATE_EPOCH = "1788130800";

async function main(args: readonly string[]): Promise<void> {
  const sourceCommit = args[0];
  if (args.length !== 1 || !sourceCommit || !/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error("DB_BOOTSTRAP_REPRODUCIBILITY_INPUT_INVALID");
  }
  const first = await buildOci("first", sourceCommit);
  const second = await buildOci("second", sourceCommit);
  try {
    const firstDigest = await manifestDigest(first.ociDirectory);
    const secondDigest = await manifestDigest(second.ociDirectory);
    if (first.contextSha256 !== second.contextSha256 || first.fileCount !== second.fileCount
      || firstDigest !== secondDigest) throw new Error("DB_BOOTSTRAP_IMAGE_NOT_REPRODUCIBLE");
    process.stdout.write(`${JSON.stringify({
      contextSha256: first.contextSha256,
      contextFileCount: first.fileCount,
      reproducibilityBuilds: 2,
      reviewedOciManifestDigest: firstDigest,
    })}\n`);
  } finally {
    await Promise.all([first.cleanup(), second.cleanup()]);
  }
}

async function buildOci(label: string, sourceCommit: string) {
  const context = await assembleRefundDbBootstrapBuildContext();
  const parent = await mkdtemp(join(tmpdir(), `mira-db-bootstrap-oci-${label}-`));
  const destination = join(parent, "oci");
  const result = spawnSync("docker", [
    "buildx", "build", "--platform", "linux/amd64", "--no-cache",
    "--provenance=false", "--sbom=false", "--build-arg", `SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}`,
    "--build-arg", `SOURCE_COMMIT=${sourceCommit}`,
    "--output", `type=oci,dest=${destination},tar=false,rewrite-timestamp=true`,
    "--file", join(context.directory, "containers/refund-db-bootstrap/Dockerfile"), context.directory,
  ], { stdio: "inherit", env: strippedEnvironment(), timeout: 900_000 });
  if (result.status !== 0 || result.error) throw new Error(`DB_BOOTSTRAP_OCI_BUILD_FAILED:${label}`);
  return Object.freeze({
    ociDirectory: destination,
    contextSha256: context.manifestDigest,
    fileCount: context.manifestEntries.length,
    cleanup: async () => {
      await context.cleanup();
      await rm(parent, { recursive: true, force: true });
    },
  });
}

async function manifestDigest(directory: string): Promise<string> {
  const value: unknown = JSON.parse(await readFile(join(directory, "index.json"), "utf8"));
  if (!isRecord(value) || !Array.isArray(value.manifests) || value.manifests.length !== 1) {
    throw new Error("DB_BOOTSTRAP_OCI_INDEX_INVALID");
  }
  const descriptor: unknown = value.manifests[0];
  if (!isRecord(descriptor) || typeof descriptor.digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(descriptor.digest)) {
    throw new Error("DB_BOOTSTRAP_OCI_MANIFEST_INVALID");
  }
  return descriptor.digest;
}

function strippedEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DOCKER_HOST: process.env.DOCKER_HOST,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) await main(process.argv.slice(2));
