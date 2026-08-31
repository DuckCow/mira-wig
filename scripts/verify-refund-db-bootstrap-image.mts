import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const TAG = /^asia-northeast3-docker\.pkg\.dev\/mira-refund-sandbox-0001\/mira-p3e-sbx-refund-images\/refund-db-bootstrap:p3e-b2-[0-9a-f]{12}$/u;
const CA_BUNDLE_PATH = "/etc/ssl/certs/ca-certificates.crt";

type CaBundleEvidence = Readonly<{
  path: typeof CA_BUNDLE_PATH;
  uid: 65532;
  gid: 65532;
  regularFile: true;
  readable: true;
  size: number;
  sha256: string;
  sslCertFile: null;
  sslCertDir: null;
  nodeExtraCaCerts: null;
}>;

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
  const caBundle = inspectCaBundle(tag);
  const migrationInventory = run(tag, [
    "--network=none",
    "--entrypoint", "/usr/local/bin/node", tag,
    "--input-type=module", "--eval",
    "import('/app/scripts/refund-db-bootstrap-entrypoint.mjs').then(async runtime => { const inventory = await runtime.defaultRuntimeDependencies.loadMigrationInventory(); process.stdout.write(JSON.stringify({ count: inventory.migrationCount, sha256: inventory.migrationDigest, marketPreconditionMode: runtime.SYNTHETIC_SALE_MARKET_PRECONDITION_MODE, failureCodes: runtime.BOOTSTRAP_FAILURE_CODES, proxyFailureClasses: runtime.PROXY_FAILURE_CLASSES, proxyTransportClasses: runtime.PROXY_TRANSPORT_CLASSES, sqlAdminRequestPhase: runtime.SQLADMIN_REQUEST_PHASE, sqlAdminRequestHost: runtime.SQLADMIN_REQUEST_HOST, proxyArguments: runtime.proxyArguments(), passwordProxyArguments: runtime.proxyArguments(false), proxyDiagnosticByteLimit: runtime.PROXY_DIAGNOSTIC_BYTE_LIMIT, proxyStdio: runtime.PROXY_STDIO })); })",
  ]);
  if (migrationInventory.stdout !==
    '{"count":41,"sha256":"4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c","marketPreconditionMode":"materialize-synthetic-sale-market-precondition","failureCodes":["PROXY_START_FAILED","PROXY_EARLY_EXIT","PROXY_READY_TIMEOUT","DB_CONNECT_FAILED","LEDGER_READ_FAILED","LEDGER_REJECTED","RUNTIME_LOCAL_FAILED","SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT","SECRET_METADATA_UNAVAILABLE","SECRET_VERSION_BASELINE_DRIFT","APPLICATION_PASSWORD_TRANSACTION_FAILED","APPLICATION_PASSWORD_LOGIN_FAILED","SECRET_VERSION_ADD_FAILED","SECRET_VERSION_ADD_AMBIGUOUS_ZERO","SECRET_VERSION_ADD_AMBIGUOUS_ONE","SECRET_VERSION_ADD_AMBIGUOUS_DRIFT","SECRET_VERSION_POSTCONDITION_FAILED"],"proxyFailureClasses":["PROXY_CREDENTIAL_SOURCE_FAILED","PROXY_SQLADMIN_PERMISSION_DENIED","PROXY_SQLADMIN_REQUEST_FAILED","PROXY_INSTANCE_CONFIG_FAILED","PROXY_LISTENER_FAILED","PROXY_EARLY_EXIT_UNCLASSIFIED"],"proxyTransportClasses":["TOKEN","DNS","CONNECT","TLS","TIMEOUT","RESET","OTHER"],"sqlAdminRequestPhase":"INSTANCE_METADATA","sqlAdminRequestHost":"sqladmin.googleapis.com","proxyArguments":["--structured-logs","--private-ip","--auto-iam-authn","--unix-socket=/cloudsql","--health-check","--http-address=127.0.0.1","--http-port=9801","--exit-zero-on-sigterm","mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"],"passwordProxyArguments":["--structured-logs","--private-ip","--unix-socket=/cloudsql","--health-check","--http-address=127.0.0.1","--http-port=9801","--exit-zero-on-sigterm","mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"],"proxyDiagnosticByteLimit":4096,"proxyStdio":["ignore","pipe","pipe"]}') {
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
    diagnosticStageCount: 17,
    proxyFailureClassCount: 6,
    proxyTransportClassCount: 7,
    proxyDiagnosticByteLimit: 4096,
    caBundle,
    unknownModeExit: 64,
    network: "none",
  })}\n`);
}

function inspectCaBundle(tag: string): CaBundleEvidence {
  const result = run(tag, [
    "--network=none",
    "--entrypoint", "/usr/local/bin/node", tag,
    "--input-type=module", "--eval",
    `import { createHash } from "node:crypto";
      import { accessSync, constants, readFileSync, statSync } from "node:fs";
      const path = "${CA_BUNDLE_PATH}";
      accessSync(path, constants.R_OK);
      const stat = statSync(path);
      const body = readFileSync(path);
      process.stdout.write(JSON.stringify({
        path,
        uid: process.getuid(),
        gid: process.getgid(),
        regularFile: stat.isFile(),
        readable: true,
        size: body.byteLength,
        sha256: createHash("sha256").update(body).digest("hex"),
        sslCertFile: process.env.SSL_CERT_FILE ?? null,
        sslCertDir: process.env.SSL_CERT_DIR ?? null,
        nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ?? null,
      }));`,
  ]);
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error("DB_BOOTSTRAP_CA_BUNDLE_EVIDENCE_INVALID");
  }
  if (!isRecord(value)) {
    throw new Error("DB_BOOTSTRAP_CA_BUNDLE_INVALID");
  }
  const exactFields = Object.freeze({
    path: CA_BUNDLE_PATH,
    uid: 65532,
    gid: 65532,
    regularFile: true,
    readable: true,
    sslCertFile: null,
    sslCertDir: null,
    nodeExtraCaCerts: null,
  });
  for (const [key, expected] of Object.entries(exactFields)) {
    if (value[key] !== expected) throw new Error("DB_BOOTSTRAP_CA_BUNDLE_INVALID");
  }
  const { size, sha256 } = value;
  if (typeof size !== "number" || size <= 0
    || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(sha256)) {
    throw new Error("DB_BOOTSTRAP_CA_BUNDLE_INVALID");
  }
  return Object.freeze({ ...exactFields, size, sha256 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  const result = spawnSync("docker", ["run", "--rm", "--platform=linux/amd64", ...args], {
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
