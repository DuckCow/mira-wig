import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function requireCondition(condition: boolean, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function requireStringArray(value: unknown, code: string): readonly string[] {
  requireCondition(isUnknownArray(value), code);
  return Object.freeze(value.map((item) => {
    requireCondition(typeof item === "string", code);
    return item;
  }));
}

function requireNumberArray(value: unknown, code: string): readonly number[] {
  requireCondition(isUnknownArray(value), code);
  return Object.freeze(value.map((item) => {
    requireCondition(Number.isSafeInteger(item) && Number(item) >= 0, code);
    return Number(item);
  }));
}

export type SyntheticSaleRawManifestProof = Readonly<{
  digest: string;
  rawByteLength: number;
  mediaType: string;
  configDigest: string;
  orderedLayerDescriptorCount: number;
}>;

export function verifySyntheticSaleRawManifest(
  rawManifest: Uint8Array,
  policyValue: unknown,
): SyntheticSaleRawManifestProof {
  const rawBytes = Buffer.from(rawManifest);
  requireCondition(rawBytes.byteLength > 0 && rawBytes.byteLength <= 1_048_576,
    "SYNTHETIC_MANIFEST_RAW_SIZE_INVALID");
  requireCondition(isRecord(policyValue), "SYNTHETIC_POLICY_INVALID");
  requireCondition(
    (policyValue.contractVersion === "mira-refund-p3e-b2-synthetic-sale-image-policy/v2"
      || policyValue.contractVersion === "mira-refund-p3e-b2-synthetic-sale-image-policy/v3")
      && policyValue.status === "CURRENT_SUCCESSOR",
    "SYNTHETIC_POLICY_VERSION_INVALID",
  );
  const artifact = policyValue.artifact;
  requireCondition(isRecord(artifact), "SYNTHETIC_POLICY_ARTIFACT_INVALID");
  requireCondition(typeof artifact.manifestDigest === "string",
    "SYNTHETIC_POLICY_MANIFEST_DIGEST_INVALID");
  requireCondition(Number.isSafeInteger(artifact.manifestRawByteLength),
    "SYNTHETIC_POLICY_MANIFEST_SIZE_INVALID");
  requireCondition(typeof artifact.configDigest === "string",
    "SYNTHETIC_POLICY_CONFIG_DIGEST_INVALID");
  requireCondition(Number.isSafeInteger(artifact.configSize),
    "SYNTHETIC_POLICY_CONFIG_SIZE_INVALID");
  requireCondition(Number.isSafeInteger(artifact.layerCount),
    "SYNTHETIC_POLICY_LAYER_COUNT_INVALID");
  const policyLayerDigests = requireStringArray(
    artifact.layerDigests,
    "SYNTHETIC_POLICY_LAYER_DIGESTS_INVALID",
  );
  const policyLayerSizes = requireNumberArray(
    artifact.layerSizes,
    "SYNTHETIC_POLICY_LAYER_SIZES_INVALID",
  );

  const digest = `sha256:${createHash("sha256").update(rawBytes).digest("hex")}`;
  requireCondition(digest === artifact.manifestDigest,
    "SYNTHETIC_MANIFEST_DIGEST_MISMATCH");
  requireCondition(rawBytes.byteLength === artifact.manifestRawByteLength,
    "SYNTHETIC_MANIFEST_RAW_SIZE_MISMATCH");

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(rawBytes.toString("utf8"));
  } catch {
    throw new Error("SYNTHETIC_MANIFEST_JSON_INVALID");
  }
  requireCondition(isRecord(manifestValue) && manifestValue.schemaVersion === 2,
    "SYNTHETIC_MANIFEST_SHAPE_INVALID");
  requireCondition(
    manifestValue.mediaType === "application/vnd.docker.distribution.manifest.v2+json",
    "SYNTHETIC_MANIFEST_MEDIA_TYPE_INVALID",
  );
  requireCondition(isRecord(manifestValue.config), "SYNTHETIC_MANIFEST_CONFIG_INVALID");
  requireCondition(
    manifestValue.config.digest === artifact.configDigest
      && manifestValue.config.size === artifact.configSize,
    "SYNTHETIC_MANIFEST_CONFIG_MISMATCH",
  );
  requireCondition(Array.isArray(manifestValue.layers), "SYNTHETIC_MANIFEST_LAYERS_INVALID");
  const layerDigests = manifestValue.layers.map((layer) => {
    requireCondition(isRecord(layer) && typeof layer.digest === "string",
      "SYNTHETIC_MANIFEST_LAYER_INVALID");
    return layer.digest;
  });
  const layerSizes = manifestValue.layers.map((layer) => {
    requireCondition(isRecord(layer) && Number.isSafeInteger(layer.size),
      "SYNTHETIC_MANIFEST_LAYER_INVALID");
    return layer.size;
  });
  requireCondition(
    manifestValue.layers.length === artifact.layerCount
      && JSON.stringify(layerDigests) === JSON.stringify(policyLayerDigests)
      && JSON.stringify(layerSizes) === JSON.stringify(policyLayerSizes),
    "SYNTHETIC_MANIFEST_LAYER_MISMATCH",
  );

  return Object.freeze({
    digest,
    rawByteLength: rawBytes.byteLength,
    mediaType: manifestValue.mediaType,
    configDigest: manifestValue.config.digest,
    orderedLayerDescriptorCount: manifestValue.layers.length,
  });
}

async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 2 || !args[0] || !args[1]) {
    throw new Error("SYNTHETIC_POLICY_VERIFY_INPUT_INVALID");
  }
  const [policyBytes, rawManifest] = await Promise.all([
    readFile(args[0]),
    readFile(args[1]),
  ]);
  const policyValue: unknown = JSON.parse(policyBytes.toString("utf8"));
  process.stdout.write(`${JSON.stringify(verifySyntheticSaleRawManifest(rawManifest, policyValue))}\n`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main(process.argv.slice(2));
}
