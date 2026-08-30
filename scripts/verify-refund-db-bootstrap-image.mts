import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const TAG = /^asia-northeast3-docker\.pkg\.dev\/mira-refund-sandbox-0001\/mira-p3e-sbx-refund-images\/refund-db-bootstrap:p3e-b2-[0-9a-f]{12}$/u;

function main(args: readonly string[] = process.argv.slice(2)): void {
  const tag = args[0];
  const sourceCommit = args[1];
  if (!validInput(args, tag, sourceCommit)) {
    throw new Error("DB_BOOTSTRAP_IMAGE_VERIFY_INPUT_INVALID");
  }
  const labels = execFileSync("docker", [
    "image", "inspect", "--format", "{{json .Config.Labels}}", tag,
  ], { encoding: "utf8", maxBuffer: 262_144 });
  requireContains(labels, `"org.opencontainers.image.revision":"${sourceCommit}"`);
  requireContains(labels, '"mira.refund.default-mode":"check"');

  const proxyVersion = run(tag, ["--entrypoint", "/usr/local/bin/cloud-sql-proxy", tag, "--version"]);
  if (!proxyVersion.stdout.includes("cloud-sql-proxy version 2.22.0")) {
    throw new Error("DB_BOOTSTRAP_PROXY_VERSION_INVALID");
  }
  const prismaVersion = run(tag, [
    "--entrypoint", "/usr/local/bin/node", tag,
    "/app/node_modules/prisma/build/index.js", "--version",
  ]);
  if (!prismaVersion.stdout.includes("prisma") || !prismaVersion.stdout.includes("7.8.0")) {
    throw new Error("DB_BOOTSTRAP_PRISMA_VERSION_INVALID");
  }
  const migrationInventory = run(tag, [
    "--network=none",
    "--entrypoint", "/usr/local/bin/node", tag,
    "--input-type=module", "--eval",
    "import('/app/scripts/refund-db-bootstrap-entrypoint.mjs').then(async runtime => { const inventory = await runtime.defaultRuntimeDependencies.loadMigrationInventory(); process.stdout.write(JSON.stringify({ count: inventory.migrationCount, sha256: inventory.migrationDigest })); })",
  ]);
  if (migrationInventory.stdout !==
    '{"count":41,"sha256":"4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c"}') {
    throw new Error("DB_BOOTSTRAP_MIGRATION_INVENTORY_INVALID");
  }
  const unknown = run(tag, ["--network=none", tag, "unknown"], false);
  if (unknown.status !== 64
    || unknown.stderr !== '{"ok":false,"code":"INVALID_BOOTSTRAP_RUNTIME_INPUT"}\n') {
    throw new Error("DB_BOOTSTRAP_UNKNOWN_MODE_NOT_FAIL_CLOSED");
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    tag,
    sourceCommit,
    proxy: "2.22.0",
    prisma: "7.8.0",
    migrationCount: 41,
    migrationSha256: "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    unknownModeExit: 64,
    network: "none",
  })}\n`);
}

function validInput(
  args: readonly string[],
  tag: string | undefined,
  sourceCommit: string | undefined,
): tag is string {
  return args.length === 2
    && typeof tag === "string"
    && TAG.test(tag)
    && typeof sourceCommit === "string"
    && /^[0-9a-f]{40}$/u.test(sourceCommit);
}

function run(
  tag: string,
  args: readonly string[],
  requireSuccess = true,
): Readonly<{ status: number | null; stdout: string; stderr: string }> {
  const result = spawnSync("docker", ["run", "--rm", ...args], {
    encoding: "utf8",
    maxBuffer: 262_144,
  });
  if (result.error) throw result.error;
  if (requireSuccess && result.status !== 0) throw new Error(`DB_BOOTSTRAP_IMAGE_PROBE_FAILED:${tag}`);
  return Object.freeze({ status: result.status, stdout: result.stdout, stderr: result.stderr });
}

function requireContains(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error("DB_BOOTSTRAP_IMAGE_LABEL_INVALID");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) main();
