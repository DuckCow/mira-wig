import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleSyntheticSaleBuildContext } from "./build-synthetic-sale-context.mjs";

const TAG = /^mira-synthetic-sale-review:[0-9a-f]{12}-[ab]$/u;

export async function buildSyntheticSaleImage(tag: string, sourceCommit: string) {
  if (!TAG.test(tag) || !/^[0-9a-f]{40}$/u.test(sourceCommit)
    || !tag.includes(sourceCommit.slice(0, 12))) throw new Error("SYNTHETIC_SALE_IMAGE_INPUT_INVALID");
  const context = await assembleSyntheticSaleBuildContext();
  const proof = await mkdtemp(join(tmpdir(), "mira-synthetic-sale-image-"));
  const iidFile = join(proof, "iid");
  try {
    execFileSync("docker", [
      "buildx", "build", "--platform=linux/amd64", "--load", "--no-cache",
      "--provenance=false", "--sbom=false", "--build-arg", `SOURCE_COMMIT=${sourceCommit}`,
      "--iidfile", iidFile, "--tag", tag, "--file", "containers/synthetic-sale/Dockerfile",
      context.directory,
    ], { stdio: "inherit" });
    return Object.freeze({
      tag,
      imageId: (await readFile(iidFile, "utf8")).trim(),
      contextFileCount: context.manifestEntries.length,
      contextManifestSha256: context.manifestSha256,
    });
  } finally {
    await context.cleanup();
    await rm(proof, { recursive: true, force: true });
  }
}

async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 2 || !args[0] || !args[1]) throw new Error("SYNTHETIC_SALE_IMAGE_INPUT_INVALID");
  process.stdout.write(`${JSON.stringify(await buildSyntheticSaleImage(args[0], args[1]))}\n`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) await main(process.argv.slice(2));
