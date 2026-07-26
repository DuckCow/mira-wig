import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleRefundWorkerBuildContext,
} from "./build-refund-worker-bundles.mjs";

const SOURCE_DATE_EPOCH = "1784764800";
const PLATFORM = "linux/amd64";
const directories: string[] = [];

try {
  const first = await buildOciLayout("first");
  const second = await buildOciLayout("second");
  const firstIdentity = await readOciIdentity(first.ociDirectory);
  const secondIdentity = await readOciIdentity(second.ociDirectory);
  requireEqual(first.contextIdentity, second.contextIdentity, "CONTEXT_REPRODUCIBILITY");
  requireEqual(firstIdentity, secondIdentity, "OCI_REPRODUCIBILITY");
  console.log(JSON.stringify({
    ok: true,
    first: Object.freeze({
      context: first.contextIdentity,
      oci: firstIdentity,
    }),
    second: Object.freeze({
      context: second.contextIdentity,
      oci: secondIdentity,
    }),
    match: true,
    algorithm: "RAW_OCI_INDEX_DESCRIPTORS_CHILD_CONFIG_AND_ORDERED_LAYER_BYTES",
    localAuthority: "LOCAL_REPRODUCIBILITY_PROOF: NOT_RELEASE_AUTHORITY",
    releaseImageDigest: "ABSENT",
  }));
} finally {
  await Promise.all(directories.map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
}

async function buildOciLayout(label: string) {
  const context = await assembleRefundWorkerBuildContext();
  directories.push(context.parent);
  const parent = await mkdtemp(join(tmpdir(), `mira-refund-r2a-${label}-`));
  directories.push(parent);
  const destination = join(parent, "oci");
  const dockerfile = join(
    context.directory,
    "containers/refund-worker/Dockerfile",
  );
  const result = spawnSync("docker", [
    "buildx", "build",
    "--platform", PLATFORM,
    "--no-cache",
    "--provenance=false",
    "--sbom=false",
    "--build-arg", `SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}`,
    "--output", `type=oci,dest=${destination},tar=false,rewrite-timestamp=true`,
    "-f", dockerfile,
    context.directory,
  ], {
    stdio: "inherit",
    env: strippedEnvironment(),
    timeout: 900_000,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`OCI_BUILD_FAILED:${label}`);
  }
  return Object.freeze({
    ociDirectory: destination,
    contextIdentity: Object.freeze({
      manifestDigest: context.manifestDigest,
      fileCount: context.manifestEntries.length,
      repositoryGraphInputCount: context.repositoryGraphInputCount,
      packagedGraphInputCount: context.packagedGraphInputCount,
      entrypointCount: context.entrypointCount,
    }),
  });
}

async function readOciIdentity(directory: string) {
  const indexBytes = await readFile(join(directory, "index.json"));
  const index = parseJson(indexBytes, "NONCANONICAL_OCI_INDEX");
  const parsedIndex = exactIndex(index);
  if (!parsedIndex) throw new Error("NONCANONICAL_OCI_INDEX");
  if (parsedIndex.manifests.length !== 1) {
    throw new Error("UNEXPECTED_OCI_INDEX_DESCRIPTOR");
  }
  const selected = parsedIndex.manifests[0];
  if (!selected) throw new Error("NONCANONICAL_OCI_INDEX");
  const childBytes = await readVerifiedBlob(directory, selected);
  const child = exactChildManifest(parseJson(
    childBytes,
    "NONCANONICAL_OCI_CHILD_MANIFEST",
  ));
  if (!child) throw new Error("NONCANONICAL_OCI_CHILD_MANIFEST");
  const configBytes = await readVerifiedBlob(directory, child.config);
  const layers = [];
  for (const descriptor of child.layers) {
    const bytes = await readVerifiedBlob(directory, descriptor);
    layers.push(Object.freeze({
      descriptor,
      rawSha256: sha256(bytes),
    }));
  }
  return Object.freeze({
    indexJsonSha256: sha256(indexBytes),
    indexMediaType: parsedIndex.mediaType,
    indexAnnotations: parsedIndex.annotations,
    indexManifestDescriptors: parsedIndex.manifests,
    indexSelectedManifestDescriptorDigest: selected.digest,
    childManifestRawSha256: sha256(childBytes),
    childManifestMediaType: child.mediaType,
    childManifestAnnotations: child.annotations,
    configDescriptor: child.config,
    configRawSha256: sha256(configBytes),
    layerDescriptors: Object.freeze(layers),
  });
}

async function readVerifiedBlob(directory: string, descriptor: OciDescriptor) {
  const [algorithm, hash] = descriptor.digest.split(":");
  if (algorithm !== "sha256" || !/^[a-f0-9]{64}$/u.test(hash ?? "")) {
    throw new Error("INVALID_OCI_DIGEST");
  }
  const path = join(directory, "blobs", algorithm, hash ?? "");
  const metadata = await stat(path);
  if (metadata.size !== descriptor.size) throw new Error("OCI_BLOB_SIZE_MISMATCH");
  const bytes = await readFile(path);
  if (`sha256:${sha256(bytes)}` !== descriptor.digest) {
    throw new Error("OCI_BLOB_DIGEST_MISMATCH");
  }
  return bytes;
}

function exactIndex(value: unknown): Readonly<{
  mediaType: string;
  annotations: Readonly<Record<string, string>> | null;
  manifests: readonly OciDescriptor[];
}> | null {
  if (!isRecord(value) || value.schemaVersion !== 2
    || typeof value.mediaType !== "string"
    || !Array.isArray(value.manifests)
    || !hasOnlyKeys(value, ["schemaVersion", "mediaType", "manifests", "annotations"])) {
    return null;
  }
  const manifests = value.manifests.map(exactDescriptor);
  if (manifests.some((descriptor) => descriptor === null)) return null;
  const annotations = exactAnnotations(value.annotations);
  if (value.annotations !== undefined && annotations === null) return null;
  return Object.freeze({
    mediaType: value.mediaType,
    annotations,
    manifests: Object.freeze(manifests.filter(
      (descriptor): descriptor is OciDescriptor => descriptor !== null,
    )),
  });
}

function exactChildManifest(value: unknown): Readonly<{
  mediaType: string;
  annotations: Readonly<Record<string, string>> | null;
  config: OciDescriptor;
  layers: readonly OciDescriptor[];
}> | null {
  if (!isRecord(value) || value.schemaVersion !== 2
    || typeof value.mediaType !== "string" || !Array.isArray(value.layers)
    || !hasOnlyKeys(value, ["schemaVersion", "mediaType", "config", "layers", "annotations"])) {
    return null;
  }
  const config = exactDescriptor(value.config);
  const layers = value.layers.map(exactDescriptor);
  const annotations = exactAnnotations(value.annotations);
  if (!config || layers.some((descriptor) => descriptor === null)
    || value.annotations !== undefined && annotations === null) return null;
  return Object.freeze({
    mediaType: value.mediaType,
    annotations,
    config,
    layers: Object.freeze(layers.filter(
      (descriptor): descriptor is OciDescriptor => descriptor !== null,
    )),
  });
}

type OciDescriptor = Readonly<{
  mediaType: string;
  digest: string;
  size: number;
  platform: Readonly<{
    architecture: string;
    os: string;
    variant?: string;
    "os.version"?: string;
    "os.features"?: readonly string[];
  }> | null;
  annotations: Readonly<Record<string, string>> | null;
}>;

function exactDescriptor(value: unknown): OciDescriptor | null {
  if (!isRecord(value) || !validDescriptorCore(value)) return null;
  const platform = exactPlatform(value.platform);
  const annotations = exactAnnotations(value.annotations);
  if (!validOptionalParsedValue(value.platform, platform)
    || !validOptionalParsedValue(value.annotations, annotations)) return null;
  return Object.freeze({
    mediaType: value.mediaType,
    digest: value.digest,
    size: Number(value.size),
    platform,
    annotations,
  });
}

function validDescriptorCore(value: Readonly<Record<string, unknown>>): value is
Readonly<Record<string, unknown>> & Readonly<{
  mediaType: string;
  digest: string;
  size: number;
}> {
  return typeof value.mediaType === "string"
    && typeof value.digest === "string"
    && Number.isSafeInteger(value.size)
    && Number(value.size) >= 0
    && hasOnlyKeys(value, [
      "mediaType", "digest", "size", "platform", "annotations",
    ]);
}

function validOptionalParsedValue(
  source: unknown,
  parsed: unknown,
): boolean {
  return source === undefined || parsed !== null;
}

function exactPlatform(value: unknown): OciDescriptor["platform"] {
  if (value === undefined) return null;
  if (!isRecord(value) || !validPlatformCore(value)) return null;
  const features = exactOptionalStringArray(value["os.features"]);
  if (features === null) return null;
  return Object.freeze({
    architecture: value.architecture,
    os: value.os,
    ...(typeof value.variant === "string" ? { variant: value.variant } : {}),
    ...(typeof value["os.version"] === "string"
      ? { "os.version": value["os.version"] } : {}),
    ...(features === undefined ? {} : { "os.features": features }),
  });
}

function validPlatformCore(value: Readonly<Record<string, unknown>>): value is
Readonly<Record<string, unknown>> & Readonly<{
  architecture: string;
  os: string;
}> {
  return typeof value.architecture === "string"
    && typeof value.os === "string"
    && hasOnlyKeys(value, [
      "architecture", "os", "variant", "os.version", "os.features",
    ])
    && validOptionalString(value.variant)
    && validOptionalString(value["os.version"]);
}

function validOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function exactOptionalStringArray(
  value: unknown,
): readonly string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)
    || !value.every((entry) => typeof entry === "string")) return null;
  return Object.freeze(value.filter(
    (entry): entry is string => typeof entry === "string",
  ));
}

function exactAnnotations(
  value: unknown,
): Readonly<Record<string, string>> | null {
  if (value === undefined) return null;
  if (!isRecord(value)
    || !Object.values(value).every((entry) => typeof entry === "string")) return null;
  return Object.freeze(Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, String(entry)]),
  ));
}

function parseJson(value: Buffer, reason: string): unknown {
  try {
    return JSON.parse(value.toString("utf8"));
  } catch {
    throw new Error(reason);
  }
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireEqual(left: unknown, right: unknown, label: string): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label}_MISMATCH`);
  }
}

function strippedEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DOCKER_HOST: process.env.DOCKER_HOST,
  };
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
