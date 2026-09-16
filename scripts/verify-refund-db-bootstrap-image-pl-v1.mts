// Historical PL verification only.
import { refundArtifactEnvironment } from "./refund-artifact-environment.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TAG = /^asia-northeast3-docker\.pkg\.dev\/mira-refund-sandbox-0001\/mira-p3e-sbx-refund-images\/refund-db-bootstrap:p3e-b2-[0-9a-f]{12}$/u;
const CA_BUNDLE_PATH = "/etc/ssl/certs/ca-certificates.crt";
const RUNTIME_PATH = "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v2.json";
const POLICY_PATH = "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json";
const PRODUCER_PATH = "scripts/eximbay-refund-canary-target-producer.mjs";
const BOOTSTRAP_ENTRYPOINT_PATH = "scripts/refund-db-bootstrap-entrypoint.mjs";
const RUNTIME_SHA256 = "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41";
const POLICY_SHA256 = "ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf";
const WORKER_MANIFEST = "sha256:f3bbc000423588905c19507fcabb52e475923c1fcf1d0d03ffe5ac6b1d9fa691";
const WORKER_CONFIG = "sha256:1bfa5a67f9219a62f717056f1edb2fafaa0ca1c2dabb58c854eb655a435d1e27";
const STALE_SELECTIONS = Object.freeze([
  "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v1.json",
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json",
  "9c0735317a2d7222c384cf7241858c24e6a4939fce18fd1d4a83922d8ad32703",
  "5ffc8c8af5ba5892296e15d78932dc61ce883aeaac6861bb9bb006a4b790e876",
]);

export type PackagedRefundAuthorityEvidence = Readonly<{
  runtimeContractVersion: "mira-refund-p3e-b2-eximbay-canary-runtime/v2";
  runtimeSha256: typeof RUNTIME_SHA256;
  imagePolicyVersion: "mira-refund-eximbay-canary-image-policy/v9";
  imagePolicySha256: typeof POLICY_SHA256;
  workerManifestDigest: typeof WORKER_MANIFEST;
  workerConfigDigest: typeof WORKER_CONFIG;
  staleRuntimeV1Selected: false;
}>;

export type PackagedProducerResultTransportEvidence = Readonly<{
  stdoutByteLimit: 16_384;
  producerStdout: "BOUNDED_PIPE";
  producerStderr: "DISCARDED";
  singleCanonicalJson: true;
  exactModeSchemas: true;
  paymentCorrespondence: true;
  targetBindingCorrespondence: true;
  runtimeBindingsPreserved: true;
  cleanupFailurePreservesValidatedResult: true;
}>;

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

export async function verifyRefundDbBootstrapImage(args: readonly string[], prospective = false) {
  const tag = args[0];
  const sourceCommit = args[1];
  if (!validInput(args, tag, sourceCommit)) {
    throw new Error("DB_BOOTSTRAP_IMAGE_VERIFY_INPUT_INVALID");
  }
  const labels = execFileSync("docker", [
    "image", "inspect", "--format", "{{json .Config.Labels}}", tag,
  ], { env: refundArtifactEnvironment(), encoding: "utf8", maxBuffer: 262_144 });
  requireContains(labels, `"org.opencontainers.image.revision":"${sourceCommit}"`);
  requireContains(labels, '"mira.refund.default-mode":"check"');
  const packaged = await inspectPackagedBootstrap(tag);

  const proxyVersion = run(tag, [
    "--network=none", "--entrypoint", "/usr/local/bin/cloud-sql-proxy", tag, "--version",
  ]);
  if (!proxyVersion.stdout.includes("cloud-sql-proxy version 2.22.0")) {
    throw new Error("DB_BOOTSTRAP_PROXY_VERSION_INVALID");
  }
  const prismaVersion = run(tag, [
    "--network=none", "--entrypoint", "/usr/local/bin/node", tag,
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
    "import('/app/scripts/refund-db-bootstrap-entrypoint.mjs').then(async runtime => { const inventory = await runtime.defaultRuntimeDependencies.loadMigrationInventory(); process.stdout.write(JSON.stringify({ count: inventory.migrationCount, sha256: inventory.migrationDigest, marketPreconditionMode: runtime.SYNTHETIC_SALE_MARKET_PRECONDITION_MODE, failureCodes: runtime.BOOTSTRAP_FAILURE_CODES, proxyFailureClasses: runtime.PROXY_FAILURE_CLASSES, proxyTransportClasses: runtime.PROXY_TRANSPORT_CLASSES, sqlAdminRequestPhase: runtime.SQLADMIN_REQUEST_PHASE, sqlAdminRequestHost: runtime.SQLADMIN_REQUEST_HOST, proxyArguments: runtime.proxyArguments(), passwordProxyArguments: runtime.proxyArguments(false), proxyDiagnosticByteLimit: runtime.PROXY_DIAGNOSTIC_BYTE_LIMIT, producerResultByteLimit: runtime.PRODUCER_RESULT_BYTE_LIMIT, proxyStdio: runtime.PROXY_STDIO })); })",
  ]);
  const expectedInventory = expectedBootstrapInventory(prospective);
  if (prospective) verifyProspectiveCutoverMode(tag);
  if (migrationInventory.stdout !== JSON.stringify(expectedInventory)) {
    throw new Error("DB_BOOTSTRAP_MIGRATION_INVENTORY_INVALID");
  }
  const unknown = run(tag, ["--network=none", tag, "unknown"], false);
  if (unknown.status !== 64
    || unknown.stderr !== '{"ok":false,"code":"INVALID_BOOTSTRAP_RUNTIME_INPUT"}\n') {
    throw new Error("DB_BOOTSTRAP_UNKNOWN_MODE_NOT_FAIL_CLOSED");
  }
  return Object.freeze({
    ok: true,
    tag,
    sourceCommit,
    proxy: "2.22.0",
    prisma: "7.8.0",
    migrationCount: expectedInventory.count,
    migrationSha256: expectedInventory.sha256,
    diagnosticStageCount: 18,
    proxyFailureClassCount: 6,
    proxyTransportClassCount: 7,
    proxyDiagnosticByteLimit: 4096,
    caBundle,
    refundAuthority: packaged.refundAuthority,
    producerResultTransport: packaged.producerResultTransport,
    unknownModeExit: 64,
    network: "none",
  });
}

function expectedBootstrapInventory(prospective: boolean): Record<string, unknown> {
  const expectedInventory: unknown = JSON.parse('{"count":41,"sha256":"4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c","marketPreconditionMode":"materialize-synthetic-sale-market-precondition","failureCodes":["PROXY_START_FAILED","PROXY_EARLY_EXIT","PROXY_READY_TIMEOUT","DB_CONNECT_FAILED","LEDGER_READ_FAILED","LEDGER_REJECTED","ROLE_AUTHORITY_POSTCONDITION_FAILED","RUNTIME_LOCAL_FAILED","SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT","SECRET_METADATA_UNAVAILABLE","SECRET_VERSION_BASELINE_DRIFT","APPLICATION_PASSWORD_TRANSACTION_FAILED","APPLICATION_PASSWORD_LOGIN_FAILED","SECRET_VERSION_ADD_FAILED","SECRET_VERSION_ADD_AMBIGUOUS_ZERO","SECRET_VERSION_ADD_AMBIGUOUS_ONE","SECRET_VERSION_ADD_AMBIGUOUS_DRIFT","SECRET_VERSION_POSTCONDITION_FAILED"],"proxyFailureClasses":["PROXY_CREDENTIAL_SOURCE_FAILED","PROXY_SQLADMIN_PERMISSION_DENIED","PROXY_SQLADMIN_REQUEST_FAILED","PROXY_INSTANCE_CONFIG_FAILED","PROXY_LISTENER_FAILED","PROXY_EARLY_EXIT_UNCLASSIFIED"],"proxyTransportClasses":["TOKEN","DNS","CONNECT","TLS","TIMEOUT","RESET","OTHER"],"sqlAdminRequestPhase":"INSTANCE_METADATA","sqlAdminRequestHost":"sqladmin.googleapis.com","proxyArguments":["--structured-logs","--private-ip","--auto-iam-authn","--unix-socket=/cloudsql","--health-check","--http-address=127.0.0.1","--http-port=9801","--exit-zero-on-sigterm","mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"],"passwordProxyArguments":["--structured-logs","--private-ip","--unix-socket=/cloudsql","--health-check","--http-address=127.0.0.1","--http-port=9801","--exit-zero-on-sigterm","mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"],"proxyDiagnosticByteLimit":4096,"producerResultByteLimit":16384,"proxyStdio":["ignore","pipe","pipe"]}');
  if (!isRecord(expectedInventory)) throw new Error("DB_BOOTSTRAP_EXPECTATION_INVALID");
  if (prospective) {
    expectedInventory.count = 42;
    expectedInventory.sha256 = "7eea189bc4bfe165ab699113952c22493895692a2377fcdfc00e7ba956abb370";
  }
  return expectedInventory;
}

function verifyProspectiveCutoverMode(tag: string): void {
    const mode = run(tag, ["--network=none", "--entrypoint", "/usr/local/bin/node", tag,
      "--input-type=module", "--eval", "import('/app/scripts/refund-db-bootstrap-entrypoint.mjs').then(m=>process.stdout.write(m.REFUND_AUTHORIZATION_CUTOVER_MODE))"]);
    if (mode.stdout !== "apply-refund-authorization-cutover") throw new Error("DB_BOOTSTRAP_CUTOVER_MODE_MISSING");
    const closed = run(tag, ["--network=none", tag, "apply-refund-authorization-cutover"], false);
    if (closed.status !== 64) throw new Error("DB_BOOTSTRAP_CUTOVER_NOT_CLOSED");
}

async function inspectPackagedBootstrap(
  tag: string,
): Promise<Readonly<{
  refundAuthority: PackagedRefundAuthorityEvidence;
  producerResultTransport: PackagedProducerResultTransportEvidence;
}>> {
  const directory = await mkdtemp(join(tmpdir(), "mira-db-bootstrap-static-"));
  const containerName = `mira-db-bootstrap-static-${randomUUID()}`;
  let created = false;
  try {
    execFileSync("docker", [
      "create", "--platform=linux/amd64", "--name", containerName, tag,
    ], { env: refundArtifactEnvironment(), stdio: "ignore" });
    created = true;
    copyFromContainer(containerName, `/app/${RUNTIME_PATH}`, join(directory, "runtime.json"));
    copyFromContainer(containerName, `/app/${POLICY_PATH}`, join(directory, "policy.json"));
    copyFromContainer(containerName, `/app/${PRODUCER_PATH}`, join(directory, "producer.mjs"));
    copyFromContainer(containerName, `/app/${BOOTSTRAP_ENTRYPOINT_PATH}`, join(directory, "entrypoint.mjs"));
    const [runtime, policy, producer, entrypoint] = await Promise.all([
      readFile(join(directory, "runtime.json")),
      readFile(join(directory, "policy.json")),
      readFile(join(directory, "producer.mjs")),
      readFile(join(directory, "entrypoint.mjs")),
    ]);
    return Object.freeze({
      refundAuthority: verifyPackagedRefundAuthority(runtime, policy, producer),
      producerResultTransport: verifyPackagedProducerResultTransport(entrypoint),
    });
  } finally {
    try {
      if (created) {
        execFileSync("docker", ["container", "rm", containerName], { env: refundArtifactEnvironment(), stdio: "ignore" });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function verifyPackagedProducerResultTransport(
  entrypointBytes: Uint8Array,
): PackagedProducerResultTransportEvidence {
  const entrypoint = Buffer.from(entrypointBytes).toString("utf8");
  const required = [
    /PRODUCER_RESULT_BYTE_LIMIT\s*=\s*16_?384/u,
    /stdio:\s*\["ignore",\s*"pipe",\s*"ignore"\]/u,
    /new TextDecoder\("utf-8",\s*\{\s*fatal:\s*true\s*\}\)/u,
    /JSON\.stringify\(value\)\s*!==\s*json/u,
    /MATERIALIZED_TARGET_RESULT_KEYS/u,
    /ISSUED_APPROVAL_RESULT_KEYS/u,
    /paymentId\s*===\s*requestedPaymentId/u,
    /runtimeBindings\.targetBindingDigest\s*===\s*targetBindingDigest/u,
    /runtimeBindings\.syntheticProvenanceDigest\s*===\s*syntheticProvenanceDigest/u,
    /validatedProducerResult/u,
    /BootstrapStageFailure\("RUNTIME_LOCAL_FAILED",\s*\{\s*validatedProducerResult:\s*result\s*\}\)/u,
  ];
  if (!required.every((selection) => selection.test(entrypoint))) {
    throw new Error("DB_BOOTSTRAP_PRODUCER_RESULT_TRANSPORT_INVALID");
  }
  return Object.freeze({
    stdoutByteLimit: 16_384,
    producerStdout: "BOUNDED_PIPE",
    producerStderr: "DISCARDED",
    singleCanonicalJson: true,
    exactModeSchemas: true,
    paymentCorrespondence: true,
    targetBindingCorrespondence: true,
    runtimeBindingsPreserved: true,
    cleanupFailurePreservesValidatedResult: true,
  });
}

function copyFromContainer(
  containerName: string,
  source: string,
  destination: string,
): void {
  execFileSync("docker", ["cp", `${containerName}:${source}`, destination], { env: refundArtifactEnvironment(), stdio: "ignore" });
}

export function verifyPackagedRefundAuthority(
  runtimeBytes: Uint8Array,
  policyBytes: Uint8Array,
  producerBytes: Uint8Array,
): PackagedRefundAuthorityEvidence {
  if (sha256(runtimeBytes) !== RUNTIME_SHA256 || sha256(policyBytes) !== POLICY_SHA256) {
    throw new Error("DB_BOOTSTRAP_REFUND_AUTHORITY_BYTES_INVALID");
  }
  const runtime = parseRecord(runtimeBytes);
  const runtimeImage = recordField(runtime, "image");
  const runtimeJob = recordField(runtime, "job");
  const providerContact = recordField(runtime, "providerContact");
  const effectCaps = recordField(providerContact, "effectCaps");
  const lifecycle = recordField(runtime, "lifecycle");
  const policy = parseRecord(policyBytes);
  const artifact = recordField(policy, "artifact");
  const producer = Buffer.from(producerBytes).toString("utf8");
  const requiredSelections = [
    RUNTIME_PATH,
    POLICY_PATH,
    RUNTIME_SHA256,
    POLICY_SHA256,
    WORKER_MANIFEST,
  ];
  const valid = [
    runtime.contractVersion === "mira-refund-p3e-b2-eximbay-canary-runtime/v2",
    runtimeImage.imagePolicyPath === POLICY_PATH,
    runtimeImage.imagePolicySha256 === POLICY_SHA256,
    runtimeImage.digestUri === `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@${WORKER_MANIFEST}`,
    runtimeJob.taskCount === 1,
    runtimeJob.parallelism === 1,
    runtimeJob.maxRetries === 0,
    runtimeJob.automaticTrigger === false,
    effectCaps.preRefundRetrieve === 1,
    effectCaps.refundRequest === 1,
    effectCaps.postRefundRetrieve === 0,
    effectCaps.recoveryRetrieve === 0,
    effectCaps.secondRefundRequest === 0,
    effectCaps.automaticRetry === 0,
    lifecycle.default === "ABSENT",
    policy.contractVersion === "mira-refund-eximbay-canary-image-policy/v9",
    artifact.manifestDigest === WORKER_MANIFEST,
    artifact.configDigest === WORKER_CONFIG,
    requiredSelections.every((selection) => producer.includes(selection)),
    STALE_SELECTIONS.every((selection) => !producer.includes(selection)),
  ].every(Boolean);
  if (!valid) throw new Error("DB_BOOTSTRAP_REFUND_AUTHORITY_INVALID");
  return Object.freeze({
    runtimeContractVersion: "mira-refund-p3e-b2-eximbay-canary-runtime/v2",
    runtimeSha256: RUNTIME_SHA256,
    imagePolicyVersion: "mira-refund-eximbay-canary-image-policy/v9",
    imagePolicySha256: POLICY_SHA256,
    workerManifestDigest: WORKER_MANIFEST,
    workerConfigDigest: WORKER_CONFIG,
    staleRuntimeV1Selected: false,
  });
}

function parseRecord(bytes: Uint8Array): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("DB_BOOTSTRAP_REFUND_AUTHORITY_JSON_INVALID");
  }
  if (!isRecord(value)) throw new Error("DB_BOOTSTRAP_REFUND_AUTHORITY_JSON_INVALID");
  return value;
}

function recordField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const field = value[key];
  if (!isRecord(field)) throw new Error("DB_BOOTSTRAP_REFUND_AUTHORITY_SHAPE_INVALID");
  return field;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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
    env: refundArtifactEnvironment(),
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
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const args = process.argv.slice(2);
  const prospective = args[0] === "--prospective";
  const result = await verifyRefundDbBootstrapImage(prospective ? args.slice(1) : args, prospective);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
