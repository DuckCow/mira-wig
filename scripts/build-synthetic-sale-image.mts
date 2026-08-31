import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleSyntheticSaleBuildContext } from "./build-synthetic-sale-context.mjs";

const TAG = /^mira-synthetic-sale-review:[0-9a-f]{12}-[ab]$/u;
const FULL_SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const PUBLICATION_REPOSITORY = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/synthetic-sale";

export type SyntheticSalePublicationTarget = Readonly<{
  imageFamily: "synthetic-sale";
  repository: typeof PUBLICATION_REPOSITORY;
  sourceCommit: string;
  tag: string;
  tagUri: string;
}>;

export function deriveSyntheticSalePublicationTarget(
  sourceCommit: string,
): SyntheticSalePublicationTarget {
  if (!FULL_SOURCE_COMMIT.test(sourceCommit)) {
    throw new Error("SYNTHETIC_SALE_PUBLICATION_SOURCE_COMMIT_INVALID");
  }
  const tag = `p3e-b2-${sourceCommit.slice(0, 12)}`;
  return Object.freeze({
    imageFamily: "synthetic-sale",
    repository: PUBLICATION_REPOSITORY,
    sourceCommit,
    tag,
    tagUri: `${PUBLICATION_REPOSITORY}:${tag}`,
  });
}

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
