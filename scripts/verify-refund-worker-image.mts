import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleRefundWorkerBuildContext,
} from "./build-refund-worker-bundles.mjs";
import type {
  RefundWorkerMigrationInventory,
} from "../src/lib/payment/refund/worker-migration-inventory.js";

const PROOF_IMAGE_TAG_PREFIX = "mira-refund-worker:r2a-local-proof-";
const PROOF_CONTAINER_NAME_PREFIX = "mira-refund-r2a-proof-";
const PLATFORM = "linux/amd64";
const SOURCE_DATE_EPOCH = "1784764800";
const IMAGE_NATIVE_AUTHORITY = "IMAGE_NATIVE_CONTAINER_LSTAT";
const NODE_BASE =
  "node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27";
const PROXY_SHA256 = "12f2c210ef4a60c4284888edbd34c4c9868a2cba5ce26a665ad875aaf980b6fb";
const CONTRACT_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json",
);
const FROZEN_PARENT_AUTHORITY_SHA256 =
  "4ec6d62d3e205452cd154a6f2ed7229f39357d8f4364f26eec78405fd1c43473";
const CURRENT_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json",
);
const CURRENT_BASELINE_COMMIT = "dc3682e7d61c1585b6b5cc5daa288ea5f2c2a939";
const CURRENT_ENTRYPOINTS = Object.freeze([
  Object.freeze({ source: "containers/refund-worker/entrypoint.ts", runtimePath: "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs" }),
  Object.freeze({ source: "scripts/eximbay-refund-canary.ts", runtimePath: "/app/src/lib/payment/refund/eximbay-refund-canary.mjs" }),
  Object.freeze({ source: "scripts/refund-execution-worker.ts", runtimePath: "/app/src/lib/payment/refund/refund-execution-worker.mjs" }),
  Object.freeze({ source: "scripts/refund-sandbox-provider-free-preflight.ts", runtimePath: "/app/src/lib/payment/refund/refund-sandbox-provider-free-preflight.mjs" }),
]);

export const DOCKER_INSPECTION_LIMITS = Object.freeze({
  inspectionJsonMaxBytes: 262_144,
  repoTagMaxCount: 64,
  repoDigestMaxCount: 64,
  repoTagMaxBytes: 512,
  repoDigestMaxBytes: 512,
  repositoryReferenceAggregateMaxBytes: 65_536,
  oversizedInputPolicy: "FAIL_CLOSED_WITH_BOUNDED_NON_DISCLOSING_ERROR",
  truncationPolicy: "FORBIDDEN",
});

export const MAX_DOCKER_INSPECTION_JSON_BYTES =
  DOCKER_INSPECTION_LIMITS.inspectionJsonMaxBytes;
export const MAX_REPO_TAG_COUNT = DOCKER_INSPECTION_LIMITS.repoTagMaxCount;
export const MAX_REPO_DIGEST_COUNT =
  DOCKER_INSPECTION_LIMITS.repoDigestMaxCount;
export const MAX_REPO_TAG_BYTES = DOCKER_INSPECTION_LIMITS.repoTagMaxBytes;
export const MAX_REPO_DIGEST_BYTES =
  DOCKER_INSPECTION_LIMITS.repoDigestMaxBytes;
export const MAX_TOTAL_REPOSITORY_REFERENCE_BYTES =
  DOCKER_INSPECTION_LIMITS.repositoryReferenceAggregateMaxBytes;

export const FORBIDDEN_EXECUTABLE_NAMES = Object.freeze([
  "apt",
  "apt-cache",
  "apt-cdrom",
  "apt-compat",
  "apt-config",
  "apt-daily-upgrade.timer",
  "apt-daily.timer",
  "apt-get",
  "apt-helper",
  "apt-key",
  "apt-mark",
  "aptitude",
  "ar",
  "as",
  "bash",
  "c++",
  "c89",
  "c99",
  "cc",
  "corepack",
  "cpp",
  "curl",
  "dash",
  "deb-systemd-helper",
  "deb-systemd-invoke",
  "dpkg",
  "dpkg-db-backup",
  "dpkg-db-backup.timer",
  "dpkg-deb",
  "dpkg-divert",
  "dpkg-fsys-usrunmess",
  "dpkg-maintscript-helper",
  "dpkg-preconfigure",
  "dpkg-query",
  "dpkg-realpath",
  "dpkg-reconfigure",
  "dpkg-split",
  "dpkg-statoverride",
  "dpkg-trigger",
  "esbuild",
  "g++",
  "gcc",
  "ld",
  "make",
  "nm",
  "npm",
  "npx",
  "objcopy",
  "objdump",
  "pnpm",
  "pnpx",
  "ranlib",
  "rbash",
  "sh",
  "strip",
  "tsc",
  "tsx",
  "update-alternatives",
  "wget",
  "yarn",
  "yarnpkg",
]);

export const FORBIDDEN_CONTENT_PREFIXES = Object.freeze([
  "/app/node_modules/esbuild",
  "/app/node_modules/tsx",
  "/app/node_modules/typescript",
  "/opt/yarn",
  "/usr/local/lib/node_modules/corepack",
  "/usr/local/lib/node_modules/npm",
]);

const EXACT_VIRTUAL_RUNTIME_PATHS = Object.freeze([
  "/.dockerenv",
  "/dev",
  "/etc/hostname",
  "/etc/hosts",
  "/etc/resolv.conf",
  "/proc",
  "/root/.cache",
  "/sys",
]);
const REQUIRED_VIRTUAL_RUNTIME_PATHS = Object.freeze(
  EXACT_VIRTUAL_RUNTIME_PATHS.filter((path) => path !== "/root/.cache"),
);
const ROOT_OWNED_READ_ONLY_ROOTS = Object.freeze([
  "/",
  "/app",
  "/etc",
  "/usr",
  "/usr/local",
  "/usr/local/bin",
]);
const RUNTIME_USER_WRITABLE_ROOTS = Object.freeze([
  "/cloudsql",
  "/tmp/refund-worker",
]);
const CRITICAL_ROOT_OWNED_FILES = Object.freeze([
  "/usr/local/bin/cloud-sql-proxy",
  "/usr/local/bin/node",
]);

export type RootEntry = Readonly<{
  path: string;
  type: "DIRECTORY" | "REGULAR_FILE" | "SYMLINK";
  mode: number;
  uid: number;
  gid: number;
  executable: boolean;
  sha256: string | null;
  symlinkTarget: string | null;
}>;

export type RootManifestEntry = Readonly<Omit<RootEntry, "executable">>;

export type ImageNativeInventory = Readonly<{
  authority: typeof IMAGE_NATIVE_AUTHORITY;
  entries: readonly RootEntry[];
  virtualRuntimeExclusions: readonly string[];
  counts: Readonly<{
    regularFiles: number;
    directories: number;
    symlinks: number;
    executables: number;
  }>;
}>;

export type FilesystemInspection = Readonly<{
  regularFileCount: number;
  directoryCount: number;
  symlinkCount: number;
  executableCount: number;
  unchangedFromPinnedBaseCount: number;
  reviewedRemovalCount: number;
  removedPathManifestSha256: string;
  reviewedChangedEntryCount: number;
  changedMetadataContentManifestSha256: string;
  reviewedRuntimeAdditionCount: number;
  addedMetadataContentManifestSha256: string;
  nonApplicationAdditions: readonly RootManifestEntry[];
  applicationClosureCount: number;
  applicationMetadataManifestSha256: string;
  applicationContentManifestSha256: string;
  forbiddenExecutableCount: number;
  forbiddenExecutablePathSample: readonly string[];
  forbiddenContentCount: number;
  forbiddenContentPathSample: readonly string[];
  rootOwnershipViolationCount: number;
  rootOwnershipViolationPathSample: readonly string[];
  workerWritableDirectoryPaths: readonly string[];
  virtualRuntimeExclusions: readonly string[];
}>;

export type FrozenImageContract = Readonly<{
  proofImageInspectionBounds: typeof DOCKER_INSPECTION_LIMITS;
  applicationClosure: Readonly<{
    entryCount: number;
    metadataManifestSha256: string;
    contentManifestSha256: string;
  }>;
  systemClosure: Readonly<{
    removedEntryCount: number;
    removedPathManifestSha256: string;
    changedEntryCount: number;
    changedMetadataContentManifestSha256: string;
    addedEntryCount: number;
    addedMetadataContentManifestSha256: string;
  }>;
  forbiddenRuntimeExecutables: readonly string[];
  forbiddenRuntimePathPrefixes: readonly string[];
}>;

export type CurrentEximbayImageAuthority = Readonly<{
  parentAuthoritySha256: string;
  baselineCommit: string;
  buildContext: Readonly<{
    manifestSha256: string;
    fileCount: number;
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
  }>;
  entrypoints: readonly Readonly<{ source: string; runtimePath: string }>[];
  applicationClosure: FrozenImageContract["applicationClosure"];
  systemClosure: FrozenImageContract["systemClosure"];
  nonApplicationAdditionCount: 3;
  nonApplicationAdditions: readonly RootManifestEntry[];
}>;

export type ProofImageDockerResult = Readonly<{
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}>;

export type ProofImageDockerExecutor = (
  args: readonly string[],
  timeoutMs: number,
) => ProofImageDockerResult;

type DockerIdentityValue<
  TKind extends
    | "CONFIG_DIGEST"
    | "MANIFEST_DIGEST"
    | "MANIFEST_DESCRIPTOR_DIGEST"
    | "LOCAL_STORE_IMAGE_ID",
> = Readonly<{
  kind: TKind;
  value: string;
}>;

export type ConfigDigest = DockerIdentityValue<"CONFIG_DIGEST">;
export type ManifestDigest = DockerIdentityValue<"MANIFEST_DIGEST">;
export type ManifestDescriptorDigest =
  DockerIdentityValue<"MANIFEST_DESCRIPTOR_DIGEST">;
export type LocalStoreImageId = DockerIdentityValue<"LOCAL_STORE_IMAGE_ID">;
export type TagReference = Readonly<{
  kind: "TAG_REFERENCE";
  value: string;
}>;
export type RepoDigestReference = Readonly<{
  kind: "REPO_DIGEST_REFERENCE";
  value: string;
}>;
export type ImageStoreIdentityProfile =
  "DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID";

type ParsedProofImageIdentity = Readonly<{
  iidfileImageId: LocalStoreImageId;
  configDigest: ConfigDigest;
  manifestDigest: ManifestDigest;
  manifestDescriptorDigest: ManifestDescriptorDigest;
  manifestDescriptorMediaType: string;
  manifestDescriptorSize: number;
  localStoreImageId: LocalStoreImageId;
  tagReference: TagReference;
  repoDigestReferences: readonly RepoDigestReference[];
}>;

export type ProofImageIdentity = ParsedProofImageIdentity & Readonly<{
  imageStoreIdentityProfile: ImageStoreIdentityProfile;
}>;

export type ImageStoreIdentityProfileDefinition = Readonly<{
  name: ImageStoreIdentityProfile;
  matches: (identity: ParsedProofImageIdentity) => boolean;
}>;

const DOCKER_DESKTOP_CONTAINERD_PROFILE =
  Object.freeze<ImageStoreIdentityProfileDefinition>({
    name: "DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID",
    matches: (identity) => {
      const expectedRepoDigest =
        `${repositoryFromTag(identity.tagReference.value)}@${identity.manifestDigest.value}`;
      return identity.iidfileImageId.value === identity.configDigest.value
        && identity.manifestDigest.value
          === identity.manifestDescriptorDigest.value
        && identity.localStoreImageId.value === identity.manifestDigest.value
        && identity.configDigest.value !== identity.manifestDigest.value
        && (
          identity.repoDigestReferences.length === 0
          || identity.repoDigestReferences.some(
            (reference) => reference.value === expectedRepoDigest,
          )
        );
    },
  });

export const SUPPORTED_IMAGE_STORE_IDENTITY_PROFILES = Object.freeze([
  DOCKER_DESKTOP_CONTAINERD_PROFILE,
]);

export type ProofImageIdentityInput = Readonly<{
  iidFileValue: string;
  metadataFileValue: string;
  localInspectionValue: string;
  tag: string;
}>;

export type DockerImageIdentityInspection = Readonly<{
  localStoreImageId: LocalStoreImageId;
  repoTags: readonly string[];
  repoDigestReferences: readonly RepoDigestReference[];
}>;

export function classifyProofImageIdentity(
  input: ProofImageIdentityInput,
  profiles: readonly ImageStoreIdentityProfileDefinition[] =
    SUPPORTED_IMAGE_STORE_IDENTITY_PROFILES,
): ProofImageIdentity {
  const identity = parseProofImageIdentity(input);
  const matchingProfiles = profiles.filter(
    (profile) => profile.matches(identity),
  );
  requireCondition(
    matchingProfiles.length === 1,
    "LOCAL_IMAGE_STORE_IDENTITY_PROFILE_UNSUPPORTED",
  );
  const matched = matchingProfiles[0];
  requireCondition(
    matched !== undefined,
    "LOCAL_IMAGE_STORE_IDENTITY_PROFILE_UNSUPPORTED",
  );
  return Object.freeze({
    ...identity,
    imageStoreIdentityProfile: matched.name,
  });
}

function parseProofImageIdentity(
  input: ProofImageIdentityInput,
): ParsedProofImageIdentity {
  const tagReference = parseTagReference(input.tag);
  const iidfileImageId = parseDockerIdentityValue(
    "LOCAL_STORE_IMAGE_ID",
    input.iidFileValue.trim(),
    "PROOF_IMAGE_IID",
  );
  const metadata = parseBoundedJson(
    input.metadataFileValue,
    "PROOF_IMAGE_METADATA",
  );
  requireCondition(isRecord(metadata), "PROOF_IMAGE_METADATA");
  const configDigest = parseDockerIdentityValue(
    "CONFIG_DIGEST",
    metadata["containerimage.config.digest"],
    "PROOF_IMAGE_CONFIG_DIGEST",
  );
  const manifestDigest = parseDockerIdentityValue(
    "MANIFEST_DIGEST",
    metadata["containerimage.digest"],
    "PROOF_IMAGE_MANIFEST_DIGEST",
  );
  const descriptor = metadata["containerimage.descriptor"];
  requireCondition(isRecord(descriptor), "PROOF_IMAGE_MANIFEST_DESCRIPTOR");
  const manifestDescriptorDigest = parseDockerIdentityValue(
    "MANIFEST_DESCRIPTOR_DIGEST",
    descriptor.digest,
    "PROOF_IMAGE_MANIFEST_DESCRIPTOR_DIGEST",
  );
  const mediaType = descriptor.mediaType;
  requireCondition(
    mediaType === "application/vnd.docker.distribution.manifest.v2+json"
      || mediaType === "application/vnd.oci.image.manifest.v1+json",
    "PROOF_IMAGE_MANIFEST_DESCRIPTOR_MEDIA_TYPE",
  );
  requireCondition(
    Number.isSafeInteger(descriptor.size)
      && Number(descriptor.size) > 0
      && Number(descriptor.size) <= 1_048_576,
    "PROOF_IMAGE_MANIFEST_DESCRIPTOR_SIZE",
  );

  const inspection = parseDockerImageInspection(input.localInspectionValue);
  return Object.freeze({
    iidfileImageId,
    configDigest,
    manifestDigest,
    manifestDescriptorDigest,
    manifestDescriptorMediaType: mediaType,
    manifestDescriptorSize: Number(descriptor.size),
    localStoreImageId: inspection.localStoreImageId,
    tagReference,
    repoDigestReferences: inspection.repoDigestReferences,
  });
}

export function parseDockerImageInspection(
  value: string,
): DockerImageIdentityInspection {
  requireCondition(
    Buffer.byteLength(value, "utf8") <= MAX_DOCKER_INSPECTION_JSON_BYTES,
    "PROOF_IMAGE_INSPECTION_JSON_TOO_LARGE",
  );
  const inspection = parseBoundedJson(value, "PROOF_IMAGE_LOCAL_INSPECTION");
  requireCondition(
    isUnknownArray(inspection) && inspection.length === 1,
    "PROOF_IMAGE_LOCAL_INSPECTION",
  );
  const inspectedImage: unknown = inspection[0];
  requireCondition(isRecord(inspectedImage), "PROOF_IMAGE_LOCAL_INSPECTION");
  const localStoreImageId = parseDockerIdentityValue(
    "LOCAL_STORE_IMAGE_ID",
    inspectedImage.Id,
    "PROOF_IMAGE_LOCAL_STORE_IMAGE_ID",
  );
  const repositoryReferenceBudget = { usedBytes: 0 };
  const repoTags = parseBoundedRepositoryInventory(
    inspectedImage.RepoTags,
    {
      maxCount: MAX_REPO_TAG_COUNT,
      maxBytes: MAX_REPO_TAG_BYTES,
      shapeReason: "PROOF_IMAGE_REPO_TAGS",
      inventoryTooLargeReason: "PROOF_IMAGE_REPO_TAG_INVENTORY_TOO_LARGE",
      referenceTooLongReason: "PROOF_IMAGE_REPO_TAG_TOO_LONG",
    },
    repositoryReferenceBudget,
  );
  const repoDigests = parseBoundedRepositoryInventory(
    inspectedImage.RepoDigests,
    {
      maxCount: MAX_REPO_DIGEST_COUNT,
      maxBytes: MAX_REPO_DIGEST_BYTES,
      shapeReason: "PROOF_IMAGE_REPO_DIGESTS",
      inventoryTooLargeReason:
        "PROOF_IMAGE_REPO_DIGEST_INVENTORY_TOO_LARGE",
      referenceTooLongReason: "PROOF_IMAGE_REPO_DIGEST_TOO_LONG",
    },
    repositoryReferenceBudget,
  );
  const repoDigestReferences = repoDigests.map(
    (value) => parseRepoDigestReference(value),
  );
  return Object.freeze({
    localStoreImageId,
    repoTags: Object.freeze(repoTags),
    repoDigestReferences: Object.freeze(repoDigestReferences),
  });
}

type RepositoryInventoryBounds = Readonly<{
  maxCount: number;
  maxBytes: number;
  shapeReason: string;
  inventoryTooLargeReason: string;
  referenceTooLongReason: string;
}>;

type RepositoryReferenceByteBudget = {
  usedBytes: number;
};

function parseBoundedRepositoryInventory(
  value: unknown,
  bounds: RepositoryInventoryBounds,
  budget: RepositoryReferenceByteBudget,
): string[] {
  if (value === undefined || value === null) return [];
  requireCondition(isUnknownArray(value), bounds.shapeReason);
  requireCondition(
    value.length <= bounds.maxCount,
    bounds.inventoryTooLargeReason,
  );
  const entries: string[] = [];
  for (const entry of value) {
    requireCondition(typeof entry === "string", bounds.shapeReason);
    const entryBytes = Buffer.byteLength(entry, "utf8");
    const nextTotalBytes = budget.usedBytes + entryBytes;
    requireCondition(
      nextTotalBytes <= MAX_TOTAL_REPOSITORY_REFERENCE_BYTES,
      "PROOF_IMAGE_REPOSITORY_REFERENCES_TOO_LARGE",
    );
    requireCondition(
      entryBytes <= bounds.maxBytes,
      bounds.referenceTooLongReason,
    );
    budget.usedBytes = nextTotalBytes;
    entries.push(entry);
  }
  return entries;
}

function parseDockerIdentityValue<
  TKind extends
    | "CONFIG_DIGEST"
    | "MANIFEST_DIGEST"
    | "MANIFEST_DESCRIPTOR_DIGEST"
    | "LOCAL_STORE_IMAGE_ID",
>(
  kind: TKind,
  value: unknown,
  reason: string,
): DockerIdentityValue<TKind> {
  requireCondition(isDockerDigest(value), reason);
  return Object.freeze({ kind, value });
}

function parseTagReference(value: string): TagReference {
  requireCondition(
    value.startsWith(PROOF_IMAGE_TAG_PREFIX)
      && /^[a-f0-9]{32}$/u.test(value.slice(PROOF_IMAGE_TAG_PREFIX.length)),
    "PROOF_IMAGE_TAG_REFERENCE",
  );
  return Object.freeze({ kind: "TAG_REFERENCE", value });
}

function parseRepoDigestReference(value: unknown): RepoDigestReference {
  requireCondition(
    typeof value === "string"
      && /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/u.test(value),
    "PROOF_IMAGE_REPO_DIGEST_REFERENCE",
  );
  return Object.freeze({ kind: "REPO_DIGEST_REFERENCE", value });
}

function repositoryFromTag(tag: string): string {
  const separator = tag.lastIndexOf(":");
  requireCondition(separator > 0, "PROOF_IMAGE_TAG_REFERENCE");
  return tag.slice(0, separator);
}

function parseBoundedJson(value: string, reason: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`IMAGE_VERIFICATION_FAILED:${reason}`);
  }
}

export function createProofImageTag(
  generateRunId: () => string = () => randomBytes(16).toString("hex"),
): string {
  const runId = generateRunId();
  requireCondition(/^[a-f0-9]{32}$/u.test(runId), "PROOF_IMAGE_RUN_ID");
  return `${PROOF_IMAGE_TAG_PREFIX}${runId}`;
}

export class ProofImageOwnership {
  readonly tag: string;
  readonly runId: string;
  private readonly executeDocker: ProofImageDockerExecutor;
  private readonly containerNames: string[] = [];
  private tagWasProvenAbsent = false;
  private buildSucceeded = false;
  private createdIdentity: ProofImageIdentity | null = null;
  private containerSequence = 0;

  constructor(tag: string, executeDocker: ProofImageDockerExecutor) {
    requireCondition(
      tag.startsWith(PROOF_IMAGE_TAG_PREFIX)
        && /^[a-f0-9]{32}$/u.test(tag.slice(PROOF_IMAGE_TAG_PREFIX.length)),
      "PROOF_IMAGE_TAG",
    );
    this.tag = tag;
    this.runId = tag.slice(PROOF_IMAGE_TAG_PREFIX.length);
    this.executeDocker = executeDocker;
  }

  get identity(): ProofImageIdentity | null {
    return this.createdIdentity;
  }

  assertTagAvailable(): void {
    const inspection = this.executeDocker(
      ["image", "inspect", "--format", "{{.Id}}", this.tag],
      30_000,
    );
    if (inspection.error || inspection.status === null) {
      throw new Error("IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_COLLISION_CHECK");
    }
    if (inspection.status === 0) {
      throw new Error("IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_TAG_COLLISION");
    }
    requireCondition(
      inspection.status === 1,
      "PROOF_IMAGE_COLLISION_CHECK_STATUS",
    );
    this.tagWasProvenAbsent = true;
  }

  recordSuccessfulBuild(): void {
    requireCondition(this.tagWasProvenAbsent, "PROOF_IMAGE_AVAILABILITY");
    this.buildSucceeded = true;
  }

  recordCreatedImageIdentity(
    iidFileValue: string,
    metadataFileValue: string,
  ): ProofImageIdentity {
    requireCondition(this.buildSucceeded, "PROOF_IMAGE_BUILD");
    const inspection = this.executeDocker(
      ["image", "inspect", this.tag],
      30_000,
    );
    requireCondition(
      !inspection.error && inspection.status === 0,
      "PROOF_IMAGE_TAG_RESOLUTION",
    );
    const identity = classifyProofImageIdentity({
      iidFileValue,
      metadataFileValue,
      localInspectionValue: inspection.stdout,
      tag: this.tag,
    });
    this.createdIdentity = identity;
    return identity;
  }

  nextContainerName(): string {
    this.containerSequence += 1;
    const name = `${PROOF_CONTAINER_NAME_PREFIX}${this.runId}-${this.containerSequence}`;
    this.containerNames.push(name);
    return name;
  }

  cleanup(): void {
    let failed = false;
    for (const name of [...this.containerNames].reverse()) {
      failed = !this.cleanupContainer(name) || failed;
    }
    if (this.buildSucceeded) {
      failed = !this.cleanupImageTag() || failed;
    }
    if (failed) {
      throw new Error("IMAGE_VERIFICATION_FAILED:LOCAL_PROOF_IMAGE_CLEANUP_FAILED");
    }
  }

  private cleanupContainer(name: string): boolean {
    const inspection = this.executeDocker(
      ["container", "inspect", "--format", "{{.State.Running}}", name],
      30_000,
    );
    if (inspection.error || inspection.status === null) return false;
    if (inspection.status === 1) return true;
    if (inspection.status !== 0) return false;
    return this.removeExistingContainer(
      name,
      inspection.stdout.trim() === "true",
    );
  }

  private removeExistingContainer(name: string, running: boolean): boolean {
    if (running) {
      const stopped = this.executeDocker(
        ["container", "stop", "--time", "1", name],
        30_000,
      );
      if (stopped.error || stopped.status !== 0) return false;
    }
    const removed = this.executeDocker(["container", "rm", name], 30_000);
    if (removed.error || removed.status !== 0) return false;
    const verified = this.executeDocker(
      ["container", "inspect", "--format", "{{.Id}}", name],
      30_000,
    );
    return !verified.error && verified.status === 1;
  }

  private cleanupImageTag(): boolean {
    const inspection = this.executeDocker(
      ["image", "inspect", "--format", "{{.Id}}", this.tag],
      30_000,
    );
    if (inspection.error || inspection.status === null) return false;
    if (inspection.status === 1) return true;
    if (inspection.status !== 0) return false;
    const removed = this.executeDocker(["image", "rm", this.tag], 120_000);
    if (removed.error || removed.status !== 0) return false;
    const verified = this.executeDocker(
      ["image", "inspect", "--format", "{{.Id}}", this.tag],
      30_000,
    );
    return !verified.error && verified.status === 1;
  }
}

export async function withProofImageLifecycle<T>(
  ownership: ProofImageOwnership,
  operation: (ownership: ProofImageOwnership) => Promise<T> | T,
  cleanupArtifacts: () => Promise<void> | void,
): Promise<Readonly<{ value: T; identity: ProofImageIdentity }>> {
  let value: T | undefined;
  let primaryError: unknown;
  try {
    ownership.assertTagAvailable();
    value = await operation(ownership);
    requireCondition(ownership.identity !== null, "PROOF_IMAGE_NOT_RECORDED");
  } catch (error) {
    primaryError = error;
  }

  let cleanupFailed = false;
  try {
    ownership.cleanup();
  } catch {
    cleanupFailed = true;
  }
  try {
    await cleanupArtifacts();
  } catch {
    cleanupFailed = true;
  }

  if (primaryError !== undefined && cleanupFailed) {
    throw new Error(
      "IMAGE_VERIFICATION_FAILED:PRIMARY_AND_LOCAL_PROOF_IMAGE_CLEANUP_FAILED",
    );
  }
  if (cleanupFailed) {
    throw new Error("IMAGE_VERIFICATION_FAILED:LOCAL_PROOF_IMAGE_CLEANUP_FAILED");
  }
  if (primaryError !== undefined) throw boundedPrimaryError(primaryError);
  requireCondition(value !== undefined, "PROOF_IMAGE_RESULT");
  requireCondition(ownership.identity !== null, "PROOF_IMAGE_IDENTITY");
  return Object.freeze({ value, identity: ownership.identity });
}

async function main(captureContract: boolean): Promise<Record<string, unknown>> {
  const context = await assembleRefundWorkerBuildContext();
  const proofDirectory = await mkdtemp(join(tmpdir(), "mira-refund-r2a-proof-"));
  const iidFile = join(proofDirectory, "image.iid");
  const metadataFile = join(proofDirectory, "image-metadata.json");
  const tag = createProofImageTag();
  const ownership = new ProofImageOwnership(tag, executeDockerCommand);
  const lifecycle = await withProofImageLifecycle(
    ownership,
    async (proof) => {
    const dockerfile = join(context.directory, "containers/refund-worker/Dockerfile");
    run("docker", [
      "buildx", "build",
      "--platform", PLATFORM,
      "--provenance=false",
      "--sbom=false",
      "--build-arg", `SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}`,
      "--load",
      "--iidfile", iidFile,
      "--metadata-file", metadataFile,
      "-t", proof.tag,
      "-f", dockerfile,
      context.directory,
    ], 900_000);
    proof.recordSuccessfulBuild();
    const identity = proof.recordCreatedImageIdentity(
      await readFile(iidFile, "utf8"),
      await readFile(metadataFile, "utf8"),
    );
    proveProxyChecksumMismatchFails(context.directory, dockerfile);

    const inspected = parseImageInspection(
      JSON.parse(capture("docker", ["image", "inspect", proof.tag])),
    );
    requireCondition(inspected !== null, "IMAGE_INSPECTION");
    requireCondition(inspected.os === "linux", "IMAGE_OS");
    requireCondition(inspected.architecture === "amd64", "IMAGE_ARCHITECTURE");
    requireCondition(inspected.user === "65532:65532", "IMAGE_USER");
    requireCondition(
      JSON.stringify(inspected.entrypoint) === JSON.stringify([
        "/usr/local/bin/node",
        "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs",
      ]),
      "IMAGE_ENTRYPOINT",
    );
    requireCondition(inspected.command.length === 0, "IMAGE_DEFAULT_COMMAND");

    const runtimeProof = verifyRuntimeClosure(
      proof,
      context.manifestEntries,
      context.migrationInventory,
    );
    const [runtimeInventory, baseInventory] = [
      captureImageNativeInventory(proof.tag, proof),
      captureImageNativeInventory(NODE_BASE, proof),
    ];
    const filesystem = inspectImageNativeInventories(runtimeInventory, baseInventory);
    enforceFilesystemSafety(filesystem);

    const contract = await readFrozenImageContract();
    requireCondition(
      JSON.stringify(contract.forbiddenRuntimeExecutables)
        === JSON.stringify(FORBIDDEN_EXECUTABLE_NAMES),
      "FORBIDDEN_EXECUTABLE_CONTRACT",
    );
    requireCondition(
      JSON.stringify(contract.forbiddenRuntimePathPrefixes)
        === JSON.stringify(FORBIDDEN_CONTENT_PREFIXES),
      "FORBIDDEN_CONTENT_PREFIX_CONTRACT",
    );
    if (!captureContract) {
      const current = await readCurrentEximbayImageAuthority();
      enforceCurrentSubject(current, context);
      enforceCurrentClosure(filesystem, current);
    }

    return Object.freeze({
      ok: true,
      image: proof.tag,
      proofImageStoreIdentityProfile: identity.imageStoreIdentityProfile,
      proofIidfileImageId: identity.iidfileImageId.value,
      proofConfigDigest: identity.configDigest.value,
      proofManifestDigest: identity.manifestDigest.value,
      proofManifestDescriptorDigest:
        identity.manifestDescriptorDigest.value,
      proofLocalStoreImageId: identity.localStoreImageId.value,
      proofRepoDigestReferences:
        identity.repoDigestReferences.map((reference) => reference.value),
      os: inspected.os,
      architecture: inspected.architecture,
      user: inspected.user,
      nodeVersion: runtimeProof.nodeVersion,
      proxyVersion: runtimeProof.proxyVersion,
      proxySha256: runtimeProof.proxySha256,
      migrationCount: runtimeProof.migrationCount,
      migrationDigest: runtimeProof.migrationDigest,
      contextManifestDigest: context.manifestDigest,
      contextFileCount: context.manifestEntries.length,
      repositoryGraphInputCount: context.repositoryGraphInputCount,
      packagedGraphInputCount: context.packagedGraphInputCount,
      metadataAuthority: IMAGE_NATIVE_AUTHORITY,
      regularFileCount: filesystem.regularFileCount,
      directoryCount: filesystem.directoryCount,
      symlinkCount: filesystem.symlinkCount,
      executableCount: filesystem.executableCount,
      unchangedFromPinnedBaseCount: filesystem.unchangedFromPinnedBaseCount,
      reviewedRemovalCount: filesystem.reviewedRemovalCount,
      removedPathManifestSha256: filesystem.removedPathManifestSha256,
      reviewedChangedEntryCount: filesystem.reviewedChangedEntryCount,
      changedMetadataContentManifestSha256:
        filesystem.changedMetadataContentManifestSha256,
      reviewedRuntimeAdditionCount: filesystem.reviewedRuntimeAdditionCount,
      addedMetadataContentManifestSha256:
        filesystem.addedMetadataContentManifestSha256,
      nonApplicationAdditions: filesystem.nonApplicationAdditions,
      applicationClosureCount: filesystem.applicationClosureCount,
      applicationMetadataManifestSha256:
        filesystem.applicationMetadataManifestSha256,
      applicationContentManifestSha256:
        filesystem.applicationContentManifestSha256,
      forbiddenExecutableCount: filesystem.forbiddenExecutableCount,
      forbiddenContentCount: filesystem.forbiddenContentCount,
      rootOwnershipViolationCount: filesystem.rootOwnershipViolationCount,
      workerWritableDirectoryPaths: filesystem.workerWritableDirectoryPaths,
      writeDeniedProbeCount: runtimeProof.writeDeniedProbeCount,
      writeAllowedProbeCount: runtimeProof.writeAllowedProbeCount,
      captureContract,
      localAuthority: "LOCAL_REPRODUCIBILITY_PROOF: NOT_RELEASE_AUTHORITY",
      releaseImageDigest: "ABSENT",
    });
    },
    async () => {
      await context.cleanup();
      await rm(proofDirectory, { recursive: true, force: true });
    },
  );
  return Object.freeze({
    ...lifecycle.value,
    proofImageStoreIdentityProfile:
      lifecycle.identity.imageStoreIdentityProfile,
    proofIidfileImageId: lifecycle.identity.iidfileImageId.value,
    proofConfigDigest: lifecycle.identity.configDigest.value,
    proofManifestDigest: lifecycle.identity.manifestDigest.value,
    proofManifestDescriptorDigest:
      lifecycle.identity.manifestDescriptorDigest.value,
    proofLocalStoreImageId: lifecycle.identity.localStoreImageId.value,
    proofRepoDigestReferences:
      lifecycle.identity.repoDigestReferences.map((reference) => reference.value),
    proofImageCleanup: "COMPLETE",
  });
}

function verifyRuntimeClosure(
  ownership: ProofImageOwnership,
  packagedEntries: readonly Readonly<{ path: string; sha256: string }>[],
  migrationInventory: RefundWorkerMigrationInventory,
) {
  const image = ownership.tag;
  const noArgument = captureContainerStatus(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none", image,
  ]);
  requireCondition(noArgument.status === 64, "NO_ARGUMENT_EXIT");
  requireCondition(noArgument.stdout === "", "NO_ARGUMENT_STDOUT");
  requireCondition(
    noArgument.stderr === '{"ok":false,"code":"INVALID_HOST_INPUT"}\n',
    "NO_ARGUMENT_STDERR",
  );

  const selfCheck = captureContainerStatus(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    image, "image-self-check",
  ]);
  requireCondition(
    selfCheck.status === 0 && selfCheck.stderr === "",
    "SELF_CHECK_EXIT",
  );
  const self = parseSelfCheck(JSON.parse(selfCheck.stdout));
  requireCondition(self !== null, "SELF_CHECK_SHAPE");
  requireCondition(self.code === "IMAGE_SELF_CHECK_READY", "SELF_CHECK_CODE");
  verifyRefundWorkerMigrationInventoryClosure(
    packagedEntries,
    self,
    migrationInventory,
  );
  requireCondition(self.nonRoot === true, "SELF_CHECK_NON_ROOT");

  const disabled = captureContainerStatus(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--env", "REFUND_EXECUTION_WORKER_ENABLED=",
    image, "worker-once",
  ]);
  requireCondition(disabled.status === 0 && disabled.stderr === "", "DISABLED_EXIT");
  requireCondition(
    jsonCode(JSON.parse(disabled.stdout)) === "FEATURE_DISABLED",
    "DISABLED_CODE",
  );

  const preflightParse = captureContainerStatus(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--entrypoint", "/usr/local/bin/node", image,
    "/app/src/lib/payment/refund/refund-sandbox-provider-free-preflight.mjs",
  ]);
  requireCondition(preflightParse.status === 78, "PREFLIGHT_PARSE_EXIT");
  requireCondition(preflightParse.stdout === "", "PREFLIGHT_PARSE_STDOUT");
  requireCondition(
    jsonCode(JSON.parse(preflightParse.stderr)) === "CONFIG_INVALID",
    "PREFLIGHT_PARSE_CODE",
  );

  const prismaImport = captureContainer(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--entrypoint", "/usr/local/bin/node", image,
    "-e",
    "import('@prisma/client').then((m)=>process.stdout.write(typeof m.PrismaClient==='function'?'PRISMA_IMPORT_OK':'PRISMA_IMPORT_INVALID'))",
  ]).trim();
  requireCondition(prismaImport === "PRISMA_IMPORT_OK", "PRISMA_IMPORT");

  const nodeVersion = captureContainer(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--entrypoint", "/usr/local/bin/node", image, "--version",
  ]).trim();
  requireCondition(nodeVersion === "v22.23.1", "NODE_VERSION");

  const proxyVersion = captureContainer(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--entrypoint", "/usr/local/bin/cloud-sql-proxy", image, "--version",
  ]).trim();
  requireCondition(
    proxyVersion === "cloud-sql-proxy version 2.22.0+container",
    "PROXY_VERSION",
  );

  const runtime = parseRuntimeInspection(JSON.parse(captureContainer(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--read-only",
    "--entrypoint", "/usr/local/bin/node", image,
    "-e", runtimeInspectionSource(),
  ])));
  requireCondition(runtime !== null, "RUNTIME_INSPECTION_SHAPE");
  requireCondition(runtime.proxySha256 === PROXY_SHA256, "PROXY_EXECUTABLE_SHA256");
  requireCondition(runtime.nodeOpenSsl.startsWith("3."), "NODE_OPENSSL");
  requireCondition(runtime.runtimeLibrariesPresent, "RUNTIME_LIBRARIES");
  requireCondition(runtime.nodeCaCertificateCount > 0, "RUNTIME_CA");

  const writeProbe = parseWriteProbe(JSON.parse(captureContainer(ownership, [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--entrypoint", "/usr/local/bin/node", image,
    "-e", writeProbeSource(),
  ])));
  requireCondition(writeProbe !== null, "WRITE_PROBE_SHAPE");
  requireCondition(writeProbe.deniedFailures.length === 0, "WRITE_DENIAL");
  requireCondition(writeProbe.allowedFailures.length === 0, "WRITE_ALLOWANCE");
  requireCondition(writeProbe.deniedCount === 9, "WRITE_DENIAL_COUNT");
  requireCondition(writeProbe.allowedCount === 2, "WRITE_ALLOWANCE_COUNT");

  return Object.freeze({
    nodeVersion,
    proxyVersion,
    proxySha256: runtime.proxySha256,
    migrationCount: self.migrationCount,
    migrationDigest: self.migrationDigest,
    writeDeniedProbeCount: writeProbe.deniedCount,
    writeAllowedProbeCount: writeProbe.allowedCount,
  });
}

export function verifyRefundWorkerMigrationInventoryClosure(
  packagedEntries: readonly Readonly<{ path: string; sha256: string }>[],
  selfCheck: Readonly<{ migrationCount: number; migrationDigest: string }>,
  migrationInventory: RefundWorkerMigrationInventory,
): void {
  const packagedMigrations = packagedEntries
    .filter((entry) => /^prisma\/migrations\/[^/]+\/migration\.sql$/u.test(entry.path))
    .map((entry) => Object.freeze({ path: entry.path, sha256: entry.sha256 }));
  const authoritativeMigrations = migrationInventory.entries.map((entry) => Object.freeze({
    path: entry.path,
    sha256: entry.sha256,
  }));
  requireCondition(
    JSON.stringify(packagedMigrations) === JSON.stringify(authoritativeMigrations),
    "PACKAGED_MIGRATION_INVENTORY",
  );
  requireCondition(
    selfCheck.migrationCount === migrationInventory.migrationCount,
    "SELF_CHECK_MIGRATION_COUNT",
  );
  requireCondition(
    selfCheck.migrationDigest === migrationInventory.migrationDigest,
    "SELF_CHECK_MIGRATION_DIGEST",
  );
}

function proveProxyChecksumMismatchFails(
  contextDirectory: string,
  dockerfile: string,
): void {
  const result = spawnSync("docker", [
    "buildx", "build",
    "--platform", PLATFORM,
    "--provenance=false",
    "--sbom=false",
    "--target", "proxy-verified",
    "--build-arg", `SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}`,
    "--build-arg", `PROXY_EXECUTABLE_SHA256=${"0".repeat(64)}`,
    "--output", "type=cacheonly",
    "-f", dockerfile,
    contextDirectory,
  ], {
    encoding: "utf8",
    env: strippedEnvironment(),
    timeout: 300_000,
  });
  requireCondition(result.status !== 0, "PROXY_CHECKSUM_NEGATIVE_BUILD");
}

export function captureImageNativeInventory(
  image: string,
  ownership?: ProofImageOwnership,
): ImageNativeInventory {
  const args = [
    "run", "--rm", "--platform", PLATFORM, "--network", "none",
    "--read-only", "--user", "0:0",
    "--entrypoint", "/usr/local/bin/node", image,
    "-e", imageNativeInventorySource(),
  ];
  const raw: unknown = JSON.parse(
    ownership ? captureContainer(ownership, args) : capture("docker", args),
  );
  const inventory = parseImageNativeInventory(raw);
  requireCondition(inventory !== null, "IMAGE_NATIVE_INVENTORY_SHAPE");
  return inventory;
}

export function inspectImageNativeInventories(
  runtimeValue: unknown,
  baseValue: unknown,
): FilesystemInspection {
  requireCondition(
    isRecord(runtimeValue) && runtimeValue.authority === IMAGE_NATIVE_AUTHORITY,
    "RUNTIME_METADATA_AUTHORITY",
  );
  requireCondition(
    isRecord(baseValue) && baseValue.authority === IMAGE_NATIVE_AUTHORITY,
    "BASE_METADATA_AUTHORITY",
  );
  const runtime = parseImageNativeInventory(runtimeValue);
  const base = parseImageNativeInventory(baseValue);
  requireCondition(runtime !== null, "RUNTIME_IMAGE_NATIVE_INVENTORY");
  requireCondition(base !== null, "BASE_IMAGE_NATIVE_INVENTORY");
  requireCondition(
    hasOnlyExactVirtualExclusions(runtime.virtualRuntimeExclusions),
    "RUNTIME_VIRTUAL_EXCLUSIONS",
  );
  requireCondition(
    hasOnlyExactVirtualExclusions(base.virtualRuntimeExclusions),
    "BASE_VIRTUAL_EXCLUSIONS",
  );

  const runtimeByPath = uniqueEntryMap(runtime.entries);
  const baseByPath = uniqueEntryMap(base.entries);
  const removals = base.entries
    .filter((entry) => !runtimeByPath.has(entry.path))
    .map((entry) => entry.path);
  const additions = runtime.entries
    .filter((entry) => !baseByPath.has(entry.path));
  const changed = runtime.entries.flatMap((entry) => {
    const baseEntry = baseByPath.get(entry.path);
    return baseEntry && !sameEntry(entry, baseEntry)
      ? [Object.freeze({
        path: entry.path,
        base: manifestEntry(baseEntry),
        runtime: manifestEntry(entry),
      })]
      : [];
  });
  const unchanged = runtime.entries.filter((entry) => {
    const baseEntry = baseByPath.get(entry.path);
    return baseEntry !== undefined && sameEntry(entry, baseEntry);
  });
  const application = runtime.entries
    .filter((entry) => entry.path === "/app" || entry.path.startsWith("/app/"));
  const nonApplicationAdditions = additions
    .filter((entry) => entry.path !== "/app" && !entry.path.startsWith("/app/"))
    .map(manifestEntry);
  const forbiddenExecutables = runtime.entries.filter(isForbiddenExecutable);
  const forbiddenContent = runtime.entries.filter(
    (entry) => isForbiddenContent(entry.path),
  );
  const ownershipViolations = ownershipViolationPaths(runtime.entries);
  const workerWritableDirectories = runtime.entries
    .filter((entry) => entry.type === "DIRECTORY" && workerCanWrite(entry))
    .map((entry) => entry.path);

  return Object.freeze({
    regularFileCount: runtime.counts.regularFiles,
    directoryCount: runtime.counts.directories,
    symlinkCount: runtime.counts.symlinks,
    executableCount: runtime.counts.executables,
    unchangedFromPinnedBaseCount: unchanged.length,
    reviewedRemovalCount: removals.length,
    removedPathManifestSha256: sha256Json(removals),
    reviewedChangedEntryCount: changed.length,
    changedMetadataContentManifestSha256: sha256Json(changed),
    reviewedRuntimeAdditionCount: additions.length,
    addedMetadataContentManifestSha256:
      sha256Json(additions.map(manifestEntry)),
    nonApplicationAdditions: Object.freeze(nonApplicationAdditions),
    applicationClosureCount: application.length,
    applicationMetadataManifestSha256:
      sha256Json(application.map(applicationMetadataEntry)),
    applicationContentManifestSha256:
      sha256Json(application.map(applicationContentEntry)),
    forbiddenExecutableCount: forbiddenExecutables.length,
    forbiddenExecutablePathSample:
      Object.freeze(forbiddenExecutables.slice(0, 20).map((entry) => entry.path)),
    forbiddenContentCount: forbiddenContent.length,
    forbiddenContentPathSample:
      Object.freeze(forbiddenContent.slice(0, 20).map((entry) => entry.path)),
    rootOwnershipViolationCount: ownershipViolations.length,
    rootOwnershipViolationPathSample: Object.freeze(ownershipViolations.slice(0, 20)),
    workerWritableDirectoryPaths: Object.freeze(workerWritableDirectories),
    virtualRuntimeExclusions: runtime.virtualRuntimeExclusions,
  });
}

function hasOnlyExactVirtualExclusions(paths: readonly string[]): boolean {
  if (new Set(paths).size !== paths.length) return false;
  if (JSON.stringify([...paths].sort()) !== JSON.stringify(paths)) return false;
  return paths.every((path) => EXACT_VIRTUAL_RUNTIME_PATHS.includes(path))
    && REQUIRED_VIRTUAL_RUNTIME_PATHS.every((path) => paths.includes(path));
}

function enforceFilesystemSafety(filesystem: FilesystemInspection): void {
  requireCondition(filesystem.forbiddenExecutableCount === 0, "FORBIDDEN_EXECUTABLE");
  requireCondition(filesystem.forbiddenContentCount === 0, "FORBIDDEN_CONTENT");
  requireCondition(filesystem.rootOwnershipViolationCount === 0, "ROOT_OWNERSHIP");
  requireCondition(
    JSON.stringify(filesystem.workerWritableDirectoryPaths)
      === JSON.stringify(RUNTIME_USER_WRITABLE_ROOTS),
    "WORKER_WRITABLE_DIRECTORY_SET",
  );
}

export function enforceFrozenClosure(
  filesystem: FilesystemInspection,
  contract: FrozenImageContract,
): void {
  const system = contract.systemClosure;
  requireCondition(
    filesystem.reviewedRemovalCount === system.removedEntryCount,
    "SYSTEM_REMOVAL_COUNT",
  );
  requireCondition(
    filesystem.removedPathManifestSha256 === system.removedPathManifestSha256,
    "SYSTEM_REMOVAL_MANIFEST",
  );
  requireCondition(
    filesystem.reviewedChangedEntryCount === system.changedEntryCount,
    "SYSTEM_CHANGED_COUNT",
  );
  requireCondition(
    filesystem.changedMetadataContentManifestSha256
      === system.changedMetadataContentManifestSha256,
    "SYSTEM_CHANGED_MANIFEST",
  );
  requireCondition(
    filesystem.reviewedRuntimeAdditionCount === system.addedEntryCount,
    "SYSTEM_ADDITION_COUNT",
  );
  requireCondition(
    filesystem.addedMetadataContentManifestSha256
      === system.addedMetadataContentManifestSha256,
    "SYSTEM_ADDITION_MANIFEST",
  );
  requireCondition(
    filesystem.applicationClosureCount === contract.applicationClosure.entryCount,
    "APPLICATION_CLOSURE_COUNT",
  );
  requireCondition(
    filesystem.applicationMetadataManifestSha256
      === contract.applicationClosure.metadataManifestSha256,
    "APPLICATION_METADATA_MANIFEST",
  );
  requireCondition(
    filesystem.applicationContentManifestSha256
      === contract.applicationClosure.contentManifestSha256,
    "APPLICATION_CONTENT_MANIFEST",
  );
}

export function enforceCurrentClosure(
  filesystem: FilesystemInspection,
  authority: CurrentEximbayImageAuthority,
): void {
  enforceFrozenClosure(filesystem, {
    proofImageInspectionBounds: DOCKER_INSPECTION_LIMITS,
    applicationClosure: authority.applicationClosure,
    systemClosure: authority.systemClosure,
    forbiddenRuntimeExecutables: FORBIDDEN_EXECUTABLE_NAMES,
    forbiddenRuntimePathPrefixes: FORBIDDEN_CONTENT_PREFIXES,
  });
  requireCondition(
    filesystem.reviewedRuntimeAdditionCount
      === filesystem.applicationClosureCount + authority.nonApplicationAdditionCount,
    "CURRENT_NON_APPLICATION_ADDITION_ACCOUNTING",
  );
  requireCondition(
    JSON.stringify(filesystem.nonApplicationAdditions)
      === JSON.stringify(authority.nonApplicationAdditions),
    "CURRENT_NON_APPLICATION_ADDITION_INVENTORY",
  );
}

function ownershipViolationPaths(entries: readonly RootEntry[]): string[] {
  const byPath = uniqueEntryMap(entries);
  const violations = new Set([
    ...criticalOwnershipViolations(byPath),
    ...applicationOwnershipViolations(entries),
    ...writableRootOwnershipViolations(byPath),
  ]);
  return [...violations].sort((left, right) => left.localeCompare(right));
}

function criticalOwnershipViolations(
  byPath: ReadonlyMap<string, RootEntry>,
): string[] {
  const violations = [];
  for (const path of [...ROOT_OWNED_READ_ONLY_ROOTS, ...CRITICAL_ROOT_OWNED_FILES]) {
    const entry = byPath.get(path);
    if (!entry || entry.uid !== 0 || entry.gid !== 0 || workerCanWrite(entry)) {
      violations.push(path);
    }
  }
  return violations;
}

function applicationOwnershipViolations(entries: readonly RootEntry[]): string[] {
  const violations = [];
  for (const entry of entries) {
    if ((entry.path === "/app" || entry.path.startsWith("/app/"))
      && (entry.uid !== 0 || entry.gid !== 0 || workerCanWrite(entry))) {
      violations.push(entry.path);
    }
  }
  return violations;
}

function writableRootOwnershipViolations(
  byPath: ReadonlyMap<string, RootEntry>,
): string[] {
  const violations = [];
  for (const path of RUNTIME_USER_WRITABLE_ROOTS) {
    const entry = byPath.get(path);
    if (!entry || entry.type !== "DIRECTORY"
      || entry.uid !== 65532 || entry.gid !== 65532 || entry.mode !== 0o700) {
      violations.push(path);
    }
  }
  return violations;
}

function workerCanWrite(entry: RootEntry): boolean {
  if (entry.type === "SYMLINK") return false;
  if (entry.uid === 65532) return (entry.mode & 0o200) !== 0;
  if (entry.gid === 65532) return (entry.mode & 0o020) !== 0;
  return (entry.mode & 0o002) !== 0;
}

function uniqueEntryMap(entries: readonly RootEntry[]): Map<string, RootEntry> {
  const map = new Map<string, RootEntry>();
  let previous: string | null = null;
  for (const entry of entries) {
    requireCondition(entry.path !== previous, "DUPLICATE_IMAGE_PATH");
    requireCondition(!map.has(entry.path), "UNSORTED_OR_DUPLICATE_IMAGE_PATH");
    map.set(entry.path, entry);
    previous = entry.path;
  }
  return map;
}

function sameEntry(left: RootEntry, right: RootEntry): boolean {
  return JSON.stringify(manifestEntry(left)) === JSON.stringify(manifestEntry(right));
}

function manifestEntry(entry: RootEntry) {
  return Object.freeze({
    path: entry.path,
    type: entry.type,
    mode: entry.mode,
    uid: entry.uid,
    gid: entry.gid,
    sha256: entry.sha256,
    symlinkTarget: entry.symlinkTarget,
  });
}

function applicationMetadataEntry(entry: RootEntry) {
  return Object.freeze({
    path: entry.path,
    type: entry.type,
    mode: entry.mode,
    uid: entry.uid,
    gid: entry.gid,
    symlinkTarget: entry.symlinkTarget,
  });
}

function applicationContentEntry(entry: RootEntry) {
  return Object.freeze({
    path: entry.path,
    type: entry.type,
    sha256: entry.sha256,
    symlinkTarget: entry.symlinkTarget,
  });
}

function isForbiddenExecutable(entry: RootEntry): boolean {
  if (entry.type === "DIRECTORY") return false;
  if (!entry.executable && entry.type !== "SYMLINK") return false;
  return FORBIDDEN_EXECUTABLE_NAMES.includes(basename(entry.path));
}

function isForbiddenContent(path: string): boolean {
  const lower = path.toLowerCase();
  return FORBIDDEN_CONTENT_PREFIXES.some((prefix) => (
    lower === prefix || lower.startsWith(`${prefix}/`)
  ))
    || lower.includes("/.git/")
    || lower.includes("/.terraform/")
    || lower.endsWith("/.env")
    || lower.endsWith(".tfstate")
    || lower.endsWith(".tfplan")
    || lower.includes("/__tests__/");
}

export async function readFrozenImageContract(): Promise<FrozenImageContract> {
  return verifyFrozenImageAuthorityBytes(await readFile(CONTRACT_PATH));
}

export function verifyFrozenImageAuthorityBytes(bytes: Uint8Array): FrozenImageContract {
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === FROZEN_PARENT_AUTHORITY_SHA256,
    "FROZEN_PARENT_AUTHORITY_SHA256",
  );
  const raw: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
  return parseFrozenImageContract(raw);
}

export function parseFrozenImageContract(raw: unknown): FrozenImageContract {
  requireCondition(isRecord(raw), "IMAGE_CONTRACT_SHAPE");
  const proofImageInspectionBounds = parseDockerInspectionLimits(
    raw.proofImageInspectionBounds,
  );
  requireCondition(isRecord(raw.applicationClosure), "APPLICATION_CONTRACT_SHAPE");
  requireCondition(isRecord(raw.systemClosure), "SYSTEM_CONTRACT_SHAPE");
  const application = raw.applicationClosure;
  const system = raw.systemClosure;
  requireCondition(isNonnegativeSafeInteger(application.entryCount), "APP_ENTRY_COUNT");
  requireCondition(isSha256(application.metadataManifestSha256), "APP_METADATA_DIGEST");
  requireCondition(isSha256(application.contentManifestSha256), "APP_CONTENT_DIGEST");
  requireCondition(isNonnegativeSafeInteger(system.removedEntryCount), "REMOVED_COUNT");
  requireCondition(isSha256(system.removedPathManifestSha256), "REMOVED_DIGEST");
  requireCondition(isNonnegativeSafeInteger(system.changedEntryCount), "CHANGED_COUNT");
  requireCondition(
    isSha256(system.changedMetadataContentManifestSha256),
    "CHANGED_DIGEST",
  );
  requireCondition(isNonnegativeSafeInteger(system.addedEntryCount), "ADDED_COUNT");
  requireCondition(
    isSha256(system.addedMetadataContentManifestSha256),
    "ADDED_DIGEST",
  );
  requireCondition(
    isStringArray(raw.forbiddenRuntimeExecutables),
    "FORBIDDEN_EXECUTABLE_LIST",
  );
  requireCondition(
    isStringArray(raw.forbiddenRuntimePathPrefixes),
    "FORBIDDEN_PREFIX_LIST",
  );
  requireCondition(
    new Set(raw.forbiddenRuntimeExecutables).size
      === raw.forbiddenRuntimeExecutables.length,
    "FORBIDDEN_EXECUTABLE_DUPLICATE",
  );
  return Object.freeze({
    proofImageInspectionBounds,
    applicationClosure: Object.freeze({
      entryCount: application.entryCount,
      metadataManifestSha256: application.metadataManifestSha256,
      contentManifestSha256: application.contentManifestSha256,
    }),
    systemClosure: Object.freeze({
      removedEntryCount: system.removedEntryCount,
      removedPathManifestSha256: system.removedPathManifestSha256,
      changedEntryCount: system.changedEntryCount,
      changedMetadataContentManifestSha256:
        system.changedMetadataContentManifestSha256,
      addedEntryCount: system.addedEntryCount,
      addedMetadataContentManifestSha256:
        system.addedMetadataContentManifestSha256,
    }),
    forbiddenRuntimeExecutables: Object.freeze([...raw.forbiddenRuntimeExecutables]),
    forbiddenRuntimePathPrefixes: Object.freeze([...raw.forbiddenRuntimePathPrefixes]),
  });
}

export async function readCurrentEximbayImageAuthority(
  path: string = CURRENT_AUTHORITY_PATH,
): Promise<CurrentEximbayImageAuthority> {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseCurrentEximbayImageAuthority(raw);
}

export function parseCurrentEximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  requireCondition(isRecord(raw), "CURRENT_IMAGE_AUTHORITY_SHAPE");
  requireCondition(hasExactKeys(raw, [
    "contractVersion", "parentAuthoritySha256", "baselineCommit", "buildContext",
    "entrypoints", "applicationClosure", "systemClosure",
    "nonApplicationAdditionCount", "nonApplicationAdditions",
  ]), "CURRENT_IMAGE_AUTHORITY_SHAPE");
  requireCondition(raw.contractVersion === "mira-refund-eximbay-canary-image-policy/v1",
    "CURRENT_IMAGE_AUTHORITY_VERSION");
  requireCondition(raw.parentAuthoritySha256 === FROZEN_PARENT_AUTHORITY_SHA256,
    "CURRENT_PARENT_AUTHORITY_BINDING");
  requireCondition(raw.baselineCommit === CURRENT_BASELINE_COMMIT,
    "CURRENT_BASELINE_COMMIT_BINDING");
  requireCondition(isRecord(raw.buildContext), "CURRENT_BUILD_CONTEXT_SHAPE");
  requireCondition(hasExactKeys(raw.buildContext, [
    "manifestSha256", "fileCount", "repositoryGraphInputCount", "packagedGraphInputCount",
  ]), "CURRENT_BUILD_CONTEXT_SHAPE");
  requireCondition(isSha256(raw.buildContext.manifestSha256), "CURRENT_CONTEXT_DIGEST");
  requireCondition(isNonnegativeSafeInteger(raw.buildContext.fileCount), "CURRENT_CONTEXT_COUNT");
  requireCondition(isNonnegativeSafeInteger(raw.buildContext.repositoryGraphInputCount),
    "CURRENT_REPOSITORY_GRAPH_COUNT");
  requireCondition(isNonnegativeSafeInteger(raw.buildContext.packagedGraphInputCount),
    "CURRENT_PACKAGED_GRAPH_COUNT");
  const entrypoints = parseCurrentEntrypoints(raw.entrypoints);
  requireCondition(isRecord(raw.applicationClosure), "CURRENT_APPLICATION_SHAPE");
  requireCondition(isRecord(raw.systemClosure), "CURRENT_SYSTEM_SHAPE");
  requireCondition(hasExactKeys(raw.applicationClosure, [
    "entryCount", "metadataManifestSha256", "contentManifestSha256",
  ]), "CURRENT_APPLICATION_SHAPE");
  requireCondition(hasExactKeys(raw.systemClosure, [
    "removedEntryCount", "removedPathManifestSha256", "changedEntryCount",
    "changedMetadataContentManifestSha256", "addedEntryCount",
    "addedMetadataContentManifestSha256",
  ]), "CURRENT_SYSTEM_SHAPE");
  const application = raw.applicationClosure;
  const system = raw.systemClosure;
  requireCondition(isNonnegativeSafeInteger(application.entryCount)
    && isSha256(application.metadataManifestSha256)
    && isSha256(application.contentManifestSha256), "CURRENT_APPLICATION_CLOSURE");
  requireCondition(isNonnegativeSafeInteger(system.removedEntryCount)
    && isSha256(system.removedPathManifestSha256)
    && isNonnegativeSafeInteger(system.changedEntryCount)
    && isSha256(system.changedMetadataContentManifestSha256)
    && isNonnegativeSafeInteger(system.addedEntryCount)
    && isSha256(system.addedMetadataContentManifestSha256), "CURRENT_SYSTEM_CLOSURE");
  requireCondition(raw.nonApplicationAdditionCount === 3,
    "CURRENT_NON_APPLICATION_ADDITION_COUNT");
  const nonApplicationAdditions = parseCurrentNonApplicationAdditions(
    raw.nonApplicationAdditions,
  );
  return Object.freeze({
    parentAuthoritySha256: raw.parentAuthoritySha256,
    baselineCommit: raw.baselineCommit,
    buildContext: Object.freeze({
      manifestSha256: raw.buildContext.manifestSha256,
      fileCount: raw.buildContext.fileCount,
      repositoryGraphInputCount: raw.buildContext.repositoryGraphInputCount,
      packagedGraphInputCount: raw.buildContext.packagedGraphInputCount,
    }),
    entrypoints,
    applicationClosure: Object.freeze({
      entryCount: application.entryCount,
      metadataManifestSha256: application.metadataManifestSha256,
      contentManifestSha256: application.contentManifestSha256,
    }),
    systemClosure: Object.freeze({
      removedEntryCount: system.removedEntryCount,
      removedPathManifestSha256: system.removedPathManifestSha256,
      changedEntryCount: system.changedEntryCount,
      changedMetadataContentManifestSha256: system.changedMetadataContentManifestSha256,
      addedEntryCount: system.addedEntryCount,
      addedMetadataContentManifestSha256: system.addedMetadataContentManifestSha256,
    }),
    nonApplicationAdditionCount: 3,
    nonApplicationAdditions,
  });
}

function parseCurrentNonApplicationAdditions(value: unknown): readonly RootManifestEntry[] {
  requireCondition(Array.isArray(value) && value.length === 3,
    "CURRENT_NON_APPLICATION_ADDITIONS_SHAPE");
  const entries: RootManifestEntry[] = [];
  for (const entry of value) {
    const parsed = parseRootManifestEntry(entry);
    requireCondition(parsed !== null, "CURRENT_NON_APPLICATION_ADDITIONS_SHAPE");
    entries.push(parsed);
  }
  requireCondition(entries.every((entry) => entry.path !== "/app"
    && !entry.path.startsWith("/app/")), "CURRENT_NON_APPLICATION_ADDITIONS_SCOPE");
  return Object.freeze(entries);
}

function parseRootManifestEntry(value: unknown): RootManifestEntry | null {
  if (!isRootManifestEntry(value)) return null;
  return Object.freeze({
    path: value.path,
    type: value.type,
    mode: value.mode,
    uid: value.uid,
    gid: value.gid,
    sha256: value.sha256,
    symlinkTarget: value.symlinkTarget,
  });
}

function isRootManifestEntry(value: unknown): value is RootManifestEntry {
  if (!isRecord(value) || !hasExactKeys(value, [
    "path", "type", "mode", "uid", "gid", "sha256", "symlinkTarget",
  ])) return false;
  return [
    typeof value.path === "string",
    isRootEntryType(value.type),
    isNonnegativeSafeInteger(value.mode),
    isNonnegativeSafeInteger(value.uid),
    isNonnegativeSafeInteger(value.gid),
    isNullableSha256(value.sha256),
    isNullableString(value.symlinkTarget),
  ].every(Boolean);
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function parseCurrentEntrypoints(
  value: unknown,
): readonly Readonly<{ source: string; runtimePath: string }>[] {
  requireCondition(Array.isArray(value) && value.length === 4,
    "CURRENT_ENTRYPOINTS_SHAPE");
  const entrypoints: Readonly<{ source: string; runtimePath: string }>[] = [];
  for (const entry of value) {
    requireCondition(isRecord(entry) && hasExactKeys(entry, ["source", "runtimePath"]),
      "CURRENT_ENTRYPOINTS_SHAPE");
    const source = entry.source;
    const runtimePath = entry.runtimePath;
    requireCondition(typeof source === "string" && typeof runtimePath === "string",
      "CURRENT_ENTRYPOINTS_SHAPE");
    entrypoints.push(Object.freeze({ source, runtimePath }));
  }
  return Object.freeze(entrypoints);
}

export function enforceCurrentSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
  }>,
): void {
  requireCondition(authority.parentAuthoritySha256 === FROZEN_PARENT_AUTHORITY_SHA256,
    "CURRENT_PARENT_AUTHORITY_BINDING");
  requireCondition(authority.baselineCommit === CURRENT_BASELINE_COMMIT,
    "CURRENT_BASELINE_COMMIT_BINDING");
  requireCondition(authority.buildContext.manifestSha256 === context.manifestDigest,
    "CURRENT_CONTEXT_MANIFEST_BINDING");
  requireCondition(authority.buildContext.fileCount === context.manifestEntries.length,
    "CURRENT_CONTEXT_FILE_COUNT_BINDING");
  requireCondition(authority.buildContext.repositoryGraphInputCount === context.repositoryGraphInputCount,
    "CURRENT_REPOSITORY_GRAPH_BINDING");
  requireCondition(authority.buildContext.packagedGraphInputCount === context.packagedGraphInputCount,
    "CURRENT_PACKAGED_GRAPH_BINDING");
  requireCondition(JSON.stringify(authority.entrypoints) === JSON.stringify(CURRENT_ENTRYPOINTS),
    "CURRENT_ENTRYPOINT_INVENTORY_BINDING");
}

function parseDockerInspectionLimits(
  value: unknown,
): typeof DOCKER_INSPECTION_LIMITS {
  requireCondition(isRecord(value), "PROOF_IMAGE_INSPECTION_BOUNDS_CONTRACT");
  const expectedEntries = Object.entries(DOCKER_INSPECTION_LIMITS);
  requireCondition(
    Object.keys(value).length === expectedEntries.length
      && expectedEntries.every(([key, expected]) => value[key] === expected),
    "PROOF_IMAGE_INSPECTION_BOUNDS_CONTRACT",
  );
  return DOCKER_INSPECTION_LIMITS;
}

function imageNativeInventorySource(): string {
  return `
    const fs = require("node:fs");
    const crypto = require("node:crypto");
    const pathApi = require("node:path");
    const authority = ${JSON.stringify(IMAGE_NATIVE_AUTHORITY)};
    const excluded = new Set(${JSON.stringify(EXACT_VIRTUAL_RUNTIME_PATHS)});
    const exclusions = [];
    const entries = [];
    const counts = { regularFiles: 0, directories: 0, symlinks: 0, executables: 0 };
    const describe = (path) => {
      const metadata = fs.lstatSync(path);
      const mode = metadata.mode & 0o7777;
      if (metadata.isSymbolicLink()) {
        counts.symlinks += 1;
        return {
          path, type: "SYMLINK", mode, uid: metadata.uid, gid: metadata.gid,
          executable: true, sha256: null, symlinkTarget: fs.readlinkSync(path)
        };
      }
      if (metadata.isDirectory()) {
        counts.directories += 1;
        return {
          path, type: "DIRECTORY", mode, uid: metadata.uid, gid: metadata.gid,
          executable: false, sha256: null, symlinkTarget: null
        };
      }
      if (metadata.isFile()) {
        counts.regularFiles += 1;
        const executable = (mode & 0o111) !== 0;
        counts.executables += Number(executable);
        return {
          path, type: "REGULAR_FILE", mode, uid: metadata.uid, gid: metadata.gid,
          executable,
          sha256: crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex"),
          symlinkTarget: null
        };
      }
      throw new Error("IMAGE_NATIVE_UNSUPPORTED_ENTRY");
    };
    entries.push(describe("/"));
    const pending = ["/"];
    while (pending.length > 0) {
      const directory = pending.pop();
      const names = fs.readdirSync(directory).sort();
      for (const name of names) {
        const path = pathApi.posix.join(directory, name);
        if (excluded.has(path)) {
          exclusions.push(path);
          continue;
        }
        const entry = describe(path);
        entries.push(entry);
        if (entry.type === "DIRECTORY") pending.push(path);
      }
    }
    entries.sort((left, right) => left.path.localeCompare(right.path));
    exclusions.sort((left, right) => left.localeCompare(right));
    process.stdout.write(JSON.stringify({
      authority, entries, virtualRuntimeExclusions: exclusions, counts
    }));
  `;
}

function runtimeInspectionSource(): string {
  return `
    const fs = require("node:fs");
    const crypto = require("node:crypto");
    const proxy = fs.readFileSync("/usr/local/bin/cloud-sql-proxy");
    const libraries = [
      "/lib/x86_64-linux-gnu/libc.so.6",
      "/lib/x86_64-linux-gnu/libz.so.1",
      "/lib/x86_64-linux-gnu/libgcc_s.so.1"
    ];
    process.stdout.write(JSON.stringify({
      proxySha256: crypto.createHash("sha256").update(proxy).digest("hex"),
      nodeOpenSsl: process.versions.openssl,
      runtimeLibrariesPresent: libraries.every((file) => fs.existsSync(file)),
      nodeCaCertificateCount: require("node:tls").rootCertificates.length
    }));
  `;
}

function writeProbeSource(): string {
  return `
    const fs = require("node:fs");
    const deniedFailures = [];
    const allowedFailures = [];
    const deniedCreates = [
      "/usr/.mira-refund-write-probe",
      "/usr/local/.mira-refund-write-probe",
      "/usr/local/bin/.mira-refund-write-probe",
      "/etc/.mira-refund-write-probe"
    ];
    const deniedModifications = [
      "/usr/local/bin/node",
      "/usr/local/bin/cloud-sql-proxy",
      "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs",
      "/app/node_modules/@prisma/client/package.json",
      "/app/prisma/migrations/20260609111830_init/migration.sql"
    ];
    const denied = (name, operation) => {
      try {
        operation();
        deniedFailures.push(name);
      } catch (error) {
        if (!error || !["EACCES", "EPERM", "EROFS"].includes(error.code)) throw error;
      }
    };
    for (const path of deniedCreates) {
      denied(path, () => fs.writeFileSync(path, "probe", { flag: "wx" }));
    }
    for (const path of deniedModifications) {
      denied(path, () => {
        const descriptor = fs.openSync(path, "r+");
        fs.closeSync(descriptor);
      });
    }
    for (const directory of ["/cloudsql", "/tmp/refund-worker"]) {
      const path = directory + "/.mira-refund-write-probe";
      try {
        fs.writeFileSync(path, "probe", { flag: "wx" });
        fs.unlinkSync(path);
      } catch (error) {
        allowedFailures.push(directory);
      }
    }
    process.stdout.write(JSON.stringify({
      deniedCount: deniedCreates.length + deniedModifications.length,
      allowedCount: 2,
      deniedFailures,
      allowedFailures
    }));
  `;
}

function captureContainerStatus(
  ownership: ProofImageOwnership,
  args: readonly string[],
) {
  return captureStatus(withOwnedContainerName(ownership, args));
}

function captureContainer(
  ownership: ProofImageOwnership,
  args: readonly string[],
): string {
  return capture("docker", withOwnedContainerName(ownership, args));
}

function withOwnedContainerName(
  ownership: ProofImageOwnership,
  args: readonly string[],
): readonly string[] {
  requireCondition(args[0] === "run", "PROOF_CONTAINER_COMMAND");
  return Object.freeze([
    "run",
    "--name",
    ownership.nextContainerName(),
    ...args.slice(1),
  ]);
}

function executeDockerCommand(
  args: readonly string[],
  timeoutMs: number,
): ProofImageDockerResult {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: strippedEnvironment(),
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return Object.freeze({
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error } : {}),
  });
}

function captureStatus(args: readonly string[]) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: strippedEnvironment(),
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function capture(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: strippedEnvironment(),
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`LOCAL_IMAGE_COMMAND_FAILED:${command}:${args[0] ?? "none"}`);
  }
  return result.stdout;
}

function run(command: string, args: readonly string[], timeout: number): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: strippedEnvironment(),
    timeout,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`LOCAL_IMAGE_COMMAND_FAILED:${command}:${args[0] ?? "none"}`);
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

function boundedPrimaryError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error("IMAGE_VERIFICATION_FAILED:UNEXPECTED");
  }
  if (/^(?:IMAGE_VERIFICATION_FAILED|LOCAL_IMAGE_COMMAND_FAILED):/u.test(
    error.message,
  )) {
    return new Error(error.message);
  }
  return new Error("IMAGE_VERIFICATION_FAILED:UNEXPECTED");
}

function requireCondition(condition: boolean, name: string): asserts condition {
  if (!condition) throw new Error(`IMAGE_VERIFICATION_FAILED:${name}`);
}

type ImageInspection = Readonly<{
  os: string;
  architecture: string;
  user: string;
  entrypoint: readonly unknown[];
  command: readonly unknown[];
}>;

function parseImageInspection(value: unknown): ImageInspection | null {
  if (!isUnknownArray(value) || value.length !== 1) return null;
  const image = value[0];
  if (!isRecord(image) || typeof image.Os !== "string"
    || typeof image.Architecture !== "string") return null;
  const config = parseImageConfig(image.Config);
  if (!config) return null;
  return Object.freeze({
    os: image.Os,
    architecture: image.Architecture,
    ...config,
  });
}

function parseImageConfig(
  value: unknown,
): Pick<ImageInspection, "user" | "entrypoint" | "command"> | null {
  if (!isRecord(value) || typeof value.User !== "string"
    || !isUnknownArray(value.Entrypoint)
    || value.Cmd !== undefined && !isUnknownArray(value.Cmd)) return null;
  return Object.freeze({
    user: value.User,
    entrypoint: Object.freeze([...value.Entrypoint]),
    command: Object.freeze(isUnknownArray(value.Cmd) ? [...value.Cmd] : []),
  });
}

type ImageSelfCheck = Readonly<{
  code: string;
  migrationCount: number;
  migrationDigest: string;
  nonRoot: boolean;
}>;

function parseSelfCheck(value: unknown): ImageSelfCheck | null {
  if (!isRecord(value) || value.ok !== true || typeof value.code !== "string"
    || !Number.isSafeInteger(value.migrationCount)
    || typeof value.migrationDigest !== "string"
    || typeof value.nonRoot !== "boolean") return null;
  return Object.freeze({
    code: value.code,
    migrationCount: Number(value.migrationCount),
    migrationDigest: value.migrationDigest,
    nonRoot: value.nonRoot,
  });
}

type RuntimeInspection = Readonly<{
  proxySha256: string;
  nodeOpenSsl: string;
  runtimeLibrariesPresent: boolean;
  nodeCaCertificateCount: number;
}>;

function parseRuntimeInspection(value: unknown): RuntimeInspection | null {
  if (!isRecord(value)
    || typeof value.proxySha256 !== "string"
    || typeof value.nodeOpenSsl !== "string"
    || typeof value.runtimeLibrariesPresent !== "boolean"
    || !isNonnegativeSafeInteger(value.nodeCaCertificateCount)) return null;
  return Object.freeze({
    proxySha256: value.proxySha256,
    nodeOpenSsl: value.nodeOpenSsl,
    runtimeLibrariesPresent: value.runtimeLibrariesPresent,
    nodeCaCertificateCount: value.nodeCaCertificateCount,
  });
}

type WriteProbe = Readonly<{
  deniedCount: number;
  allowedCount: number;
  deniedFailures: readonly string[];
  allowedFailures: readonly string[];
}>;

function parseWriteProbe(value: unknown): WriteProbe | null {
  if (!isRecord(value)
    || !isNonnegativeSafeInteger(value.deniedCount)
    || !isNonnegativeSafeInteger(value.allowedCount)
    || !isStringArray(value.deniedFailures)
    || !isStringArray(value.allowedFailures)) return null;
  return Object.freeze({
    deniedCount: value.deniedCount,
    allowedCount: value.allowedCount,
    deniedFailures: Object.freeze([...value.deniedFailures]),
    allowedFailures: Object.freeze([...value.allowedFailures]),
  });
}

function parseImageNativeInventory(value: unknown): ImageNativeInventory | null {
  if (!isRecord(value)
    || value.authority !== IMAGE_NATIVE_AUTHORITY
    || !isUnknownArray(value.entries)
    || !isStringArray(value.virtualRuntimeExclusions)
    || !isRecord(value.counts)) return null;
  const entries = value.entries.map(parseRootEntry);
  if (entries.some((entry) => entry === null)) return null;
  const counts = value.counts;
  if (!isInventoryCounts(counts)) return null;
  return Object.freeze({
    authority: IMAGE_NATIVE_AUTHORITY,
    entries: Object.freeze(entries.filter((entry) => entry !== null)),
    virtualRuntimeExclusions: Object.freeze([...value.virtualRuntimeExclusions]),
    counts: Object.freeze({
      regularFiles: counts.regularFiles,
      directories: counts.directories,
      symlinks: counts.symlinks,
      executables: counts.executables,
    }),
  });
}

function parseRootEntry(value: unknown): RootEntry | null {
  if (!isRootEntryRecord(value)) return null;
  return Object.freeze({
    path: value.path,
    type: value.type,
    mode: value.mode,
    uid: value.uid,
    gid: value.gid,
    executable: value.executable,
    sha256: value.sha256,
    symlinkTarget: value.symlinkTarget,
  });
}

function isInventoryCounts(value: Readonly<Record<string, unknown>>): value is
Readonly<Record<string, unknown>> & Readonly<{
  regularFiles: number;
  directories: number;
  symlinks: number;
  executables: number;
}> {
  return isNonnegativeSafeInteger(value.regularFiles)
    && isNonnegativeSafeInteger(value.directories)
    && isNonnegativeSafeInteger(value.symlinks)
    && isNonnegativeSafeInteger(value.executables);
}

function isRootEntryRecord(value: unknown): value is
Readonly<Record<string, unknown>> & RootEntry {
  if (!isRecord(value)
    || typeof value.path !== "string" || !value.path.startsWith("/")
    || !isRootEntryType(value.type)
    || !isNonnegativeSafeInteger(value.mode)
    || !isNonnegativeSafeInteger(value.uid)
    || !isNonnegativeSafeInteger(value.gid)
    || typeof value.executable !== "boolean") return false;
  return isNullableSha256(value.sha256)
    && isNullableString(value.symlinkTarget);
}

function isNullableSha256(value: unknown): value is string | null {
  return value === null || isSha256(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRootEntryType(
  value: unknown,
): value is RootEntry["type"] {
  return value === "DIRECTORY" || value === "REGULAR_FILE" || value === "SYMLINK";
}

function jsonCode(value: unknown): string | null {
  return isRecord(value) && typeof value.code === "string" ? value.code : null;
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isDockerDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const captureContract = process.argv.length === 3
    && process.argv[2] === "--capture-contract";
  if (process.argv.length > 2 && !captureContract) {
    throw new Error("IMAGE_VERIFIER_ARGUMENT_INVALID");
  }
  try {
    process.stdout.write(`${JSON.stringify(await main(captureContract))}\n`);
  } catch (error) {
    const bounded = boundedPrimaryError(error);
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: bounded.message,
    })}\n`);
    process.exitCode = 1;
  }
}
