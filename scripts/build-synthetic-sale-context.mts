import { createHash } from "node:crypto";
import {
  chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceDateEpochSeconds = 1_788_130_800;
const exactAssets = Object.freeze([
  "containers/synthetic-sale/Dockerfile",
  "containers/synthetic-sale/README.md",
  "containers/synthetic-sale/package-lock.json",
  "containers/synthetic-sale/package.json",
  "infra/refund-sandbox/p3e-b2/contracts/synthetic-sale-service-v1.json",
  "prisma.config.ts",
  "prisma/schema.prisma",
]);

export type SyntheticSaleContextEntry = Readonly<{
  path: string;
  size: number;
  mode: number;
  sha256: string;
}>;

export async function assembleSyntheticSaleBuildContext() {
  const parent = await mkdtemp(join(tmpdir(), "mira-synthetic-sale-context-"));
  const directory = join(parent, "context");
  await mkdir(directory, { recursive: true, mode: 0o755 });
  try {
    for (const path of exactAssets) await copyExact(path, directory);
    await mkdir(join(directory, "dist"), { recursive: true, mode: 0o755 });
    const [server, browser] = await Promise.all([
      build({
        absWorkingDir: repositoryRoot,
        entryPoints: ["containers/synthetic-sale/entrypoint.ts"],
        bundle: true,
        write: false,
        platform: "node",
        target: "node22",
        format: "esm",
        conditions: ["react-server"],
        external: ["@prisma/client", "@prisma/adapter-pg", "pg"],
        tsconfig: "tsconfig.json",
      }),
      build({
        absWorkingDir: repositoryRoot,
        entryPoints: ["src/lib/payment/synthetic-sale/browser.ts"],
        bundle: true,
        write: false,
        platform: "browser",
        target: ["chrome111", "safari16.4"],
        format: "esm",
        minify: true,
        tsconfig: "tsconfig.json",
      }),
    ]);
    await writeBundle(server.outputFiles, join(directory, "dist/synthetic-sale-server.mjs"));
    await writeBundle(browser.outputFiles, join(directory, "dist/synthetic-sale-client.js"));
    await normalizeTree(directory);
    const entries = await manifestEntries(directory);
    const manifestSha256 = sha256(Buffer.from(JSON.stringify(entries)));
    return Object.freeze({
      directory,
      manifestEntries: Object.freeze(entries),
      manifestSha256,
      cleanup: () => rm(parent, { recursive: true, force: true }),
    });
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

async function writeBundle(files: readonly { contents: Uint8Array }[], destination: string): Promise<void> {
  const output = files[0];
  if (files.length !== 1 || !output) throw new Error("SYNTHETIC_SALE_BUNDLE_INVALID");
  await writeFile(destination, output.contents, { mode: 0o644 });
}

async function copyExact(path: string, root: string): Promise<void> {
  const source = resolve(repositoryRoot, path);
  const destination = resolve(root, path);
  requireContained(source, repositoryRoot);
  requireContained(destination, root);
  const stats = await lstat(source);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("SYNTHETIC_SALE_CONTEXT_SOURCE_INVALID");
  await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
  await copyFile(source, destination);
  await chmod(destination, 0o644);
}

async function normalizeTree(root: string): Promise<void> {
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index];
    if (!directory) throw new Error("SYNTHETIC_SALE_CONTEXT_INVALID");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("SYNTHETIC_SALE_CONTEXT_SYMLINK");
      const path = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(path);
      else if (!entry.isFile()) throw new Error("SYNTHETIC_SALE_CONTEXT_INVALID");
      else await normalize(path, 0o644);
    }
  }
  for (const directory of directories.reverse()) await normalize(directory, 0o755);
}

async function normalize(path: string, mode: number): Promise<void> {
  const time = new Date(sourceDateEpochSeconds * 1_000);
  await chmod(path, mode);
  await utimes(path, time, time);
}

async function manifestEntries(root: string): Promise<SyntheticSaleContextEntry[]> {
  const paths: string[] = [];
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) throw new Error("SYNTHETIC_SALE_CONTEXT_INVALID");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(path);
      else paths.push(path);
    }
  }
  paths.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  return Promise.all(paths.map(async (path) => {
    const [stats, body] = await Promise.all([lstat(path), readFile(path)]);
    return Object.freeze({
      path: relative(root, path).split(sep).join("/"),
      size: stats.size,
      mode: stats.mode & 0o777,
      sha256: sha256(body),
    });
  }));
}

function requireContained(path: string, root: string): void {
  if (!path.startsWith(`${root}${sep}`)) throw new Error("SYNTHETIC_SALE_CONTEXT_PATH_ESCAPE");
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const context = await assembleSyntheticSaleBuildContext();
  try {
    process.stdout.write(`${JSON.stringify({
      fileCount: context.manifestEntries.length,
      manifestSha256: context.manifestSha256,
      files: context.manifestEntries.map((entry) => entry.path),
    })}\n`);
  } finally {
    await context.cleanup();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) await main();
