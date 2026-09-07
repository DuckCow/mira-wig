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
const V1_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json",
);
const V2_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v2.json",
);
const V3_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v3.json",
);
const V4_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v4.json",
);
const V5_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v5.json",
);
const V6_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v6.json",
);
const V7_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v7.json",
);
const V8_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v8.json",
);
const V9_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json",
);
const V10_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v10.json",
);
const V11_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v11.json",
);
const V12_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v12.json",
);
const CURRENT_AUTHORITY_PATH = resolve(
  import.meta.dirname,
  "../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v13.json",
);
const V1_AUTHORITY_SHA256 =
  "5ffc8c8af5ba5892296e15d78932dc61ce883aeaac6861bb9bb006a4b790e876";
const V2_AUTHORITY_SHA256 =
  "82cfa63b1c58bf6c289722ba5a56460a1bd1cefb672f8c2fbb8d26b453fbf287";
const V3_AUTHORITY_SHA256 =
  "9094297f20d5c2db8e12088d5bb7769da690d9fec29f9309426ff6e6ade56062";
const V4_AUTHORITY_SHA256 =
  "e9ffcb71011465099280e199d94b1156ef40b7ea1b90b3a10cef573aba291408";
const V5_AUTHORITY_SHA256 =
  "ce703401c5b17cd799a8e6ffb01c9a1337351ddfe180744345e6a551b9eeb398";
const V6_AUTHORITY_SHA256 =
  "8cb641f5f945ce392d19c7b410824f356e205704c0e90f275821d412b2d5979d";
const V7_AUTHORITY_SHA256 =
  "6c54d36686b9fbbc41daf1d5023a8ec857b0afec34122c2c71d455b5485f5af8";
const V8_AUTHORITY_SHA256 =
  "edd02390a033d26d239ce1f0bf13e19d983228e2a80aaaea665afb6bdffbfe5a";
const V9_AUTHORITY_SHA256 =
  "ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf";
const V10_AUTHORITY_SHA256 =
  "5139f86b0cfa8321dd14caf8e5083a765ddccc33e82c5dbf03844c3e0106a851";
const V11_AUTHORITY_SHA256 =
  "80c15e7f247991e466ae3b04f736be8b8e96ccc9aec9a161a9df57d8733a0d54";
const V12_AUTHORITY_SHA256 =
  "cc313693936f0928558778b856196ffc2cb1ed9c6323c8ffb15e501542cdf200";
const V1_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v1";
const V2_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v2";
const V3_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v3";
const V4_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v4";
const V5_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v5";
const V6_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v6";
const V7_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v7";
const V8_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v8";
const V9_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v9";
const V10_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v10";
const V11_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v11";
const V12_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v12";
const CURRENT_CONTRACT_VERSION = "mira-refund-eximbay-canary-image-policy/v13";
const V1_BASELINE_COMMIT = "518513e0990b6f3e2f0958125cbfa1118d423988";
const V2_BASELINE_COMMIT = "e5758c2ce812beae6306becad48a2ebc10f2cf4b";
const V3_BASELINE_COMMIT = "7958fb0b228266d502f5e55a14929e8d5510e913";
const V4_BASELINE_COMMIT = "733dcab3bf58d49ec69929a5db33e259e94fe970";
const V5_BASELINE_COMMIT = "820feba705b195d775a071cac0cb6b5c7ab7c377";
const V6_BASELINE_COMMIT = "22d0194c0a8bb4709b97056d68db21cabc65c24e";
const V7_BASELINE_COMMIT = "a39ec21275fba6fa1dc2e89aa9450ad0e430a490";
const V8_BASELINE_COMMIT = "5ff10b135efdc4e8efcc0599c9f74a738be7cc35";
const V9_BASELINE_COMMIT = "6f7398e5bae6909e5d2bb52c9ef0717277d97df4";
const V10_BASELINE_COMMIT = "6e1aaa32b66876252dcce40296970ea23d592d64";
const V11_BASELINE_COMMIT = "8a9bc9e6b45814829cdda3e69b69dae887fee2b0";
const V12_BASELINE_COMMIT = "9e38d3c5bbfe96bd0331fefbe7afc39919ba379c";
const CURRENT_BASELINE_COMMIT = "1f6bdaab3c7a0ffd45c2037943855661ecd8d109";
const V3_SOURCE_TREE = "edcf50357c49521febd194502c167872a2dead67";
const V4_SOURCE_TREE = "5cdacc1c1c32c163b7675f8fe9453b91e7c15f6d";
const V5_SOURCE_TREE = "d5fde2249103d263b1dab1b126027c419d18f1aa";
const V6_SOURCE_TREE = "e334b5ef6fe337d72aad4af5def14882f70ee6bd";
const V7_SOURCE_TREE = "db72f700ea7dda4f0ac7029c6ff0d03830ca6ae1";
const V8_SOURCE_TREE = "1ff00a67da9bb12d0499c3b2ad716b538d375c7a";
const V9_SOURCE_TREE = "51dabe922b2033fbdb0c9f54277646eca49f5648";
const V10_SOURCE_TREE = "97ea29321bef86e9b2f38abceef5f0b86a7795df";
const V11_SOURCE_TREE = "7ca22822e8c4352c5f7d01f06f41ae7695cbd5d1";
const V12_SOURCE_TREE = "574be89843fdebf1df09aaa60bc6773b9db2a4e5";
const CURRENT_SOURCE_TREE = "ea6f4403ab0aa96d1442c2c121e252d2b9f60209";
const V3_SUPERVISOR_SOURCE = Object.freeze({
  path: "src/lib/payment/refund/refund-worker-container-supervisor.ts",
  sha256: "0d9fd396e5afb2d48d087472aa5f4a1d9dfcd4fe0353347e9c7c42e347ae277a",
});
const V6_SUPERVISOR_SOURCE = Object.freeze({
  path: "src/lib/payment/refund/refund-worker-container-supervisor.ts",
  sha256: "68d443ac70fb8de1863287d320626c3558ac4b92cfb8ab9cf735a3555b540711",
});
const V4_SUPERVISOR_SOURCE = V6_SUPERVISOR_SOURCE;
const V5_SUPERVISOR_SOURCE = V6_SUPERVISOR_SOURCE;
const V7_SUPERVISOR_SOURCE = V6_SUPERVISOR_SOURCE;
const V8_SUPERVISOR_SOURCE = V6_SUPERVISOR_SOURCE;
const V9_SUPERVISOR_SOURCE = V6_SUPERVISOR_SOURCE;
const V10_SUPERVISOR_SOURCE = V6_SUPERVISOR_SOURCE;
const V11_SUPERVISOR_SOURCE = V6_SUPERVISOR_SOURCE;
const V12_SUPERVISOR_SOURCE = Object.freeze({
  path: "src/lib/payment/refund/refund-worker-container-supervisor.ts",
  sha256: "f31ad5019ce4823e40a2d2589599e20d9fe5b9a2e6b126f6d56975064efaba15",
});
const CURRENT_SUPERVISOR_SOURCE = V12_SUPERVISOR_SOURCE;
const V1_ENTRYPOINTS = Object.freeze([
  Object.freeze({ source: "containers/refund-worker/entrypoint.ts", runtimePath: "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs" }),
  Object.freeze({ source: "scripts/eximbay-refund-canary.ts", runtimePath: "/app/src/lib/payment/refund/eximbay-refund-canary.mjs" }),
  Object.freeze({ source: "scripts/refund-execution-worker.ts", runtimePath: "/app/src/lib/payment/refund/refund-execution-worker.mjs" }),
  Object.freeze({ source: "scripts/refund-sandbox-provider-free-preflight.ts", runtimePath: "/app/src/lib/payment/refund/refund-sandbox-provider-free-preflight.mjs" }),
]);
const V2_ENTRYPOINTS = Object.freeze([
  ...V1_ENTRYPOINTS,
  Object.freeze({ source: "scripts/eximbay-contacted-reconciliation.ts", runtimePath: "/app/src/lib/payment/refund/eximbay-contacted-reconciliation.mjs" }),
]);
const V3_ENTRYPOINTS = V2_ENTRYPOINTS;
const V4_ENTRYPOINTS = V3_ENTRYPOINTS;
const V5_ENTRYPOINTS = V4_ENTRYPOINTS;
const V6_ENTRYPOINTS = V5_ENTRYPOINTS;
const V7_ENTRYPOINTS = V6_ENTRYPOINTS;
const V8_ENTRYPOINTS = V7_ENTRYPOINTS;
const V9_ENTRYPOINTS = V8_ENTRYPOINTS;
const V10_ENTRYPOINTS = V9_ENTRYPOINTS;
const V11_ENTRYPOINTS = V10_ENTRYPOINTS;
const V12_ENTRYPOINTS = V11_ENTRYPOINTS;
const CURRENT_ENTRYPOINTS = V12_ENTRYPOINTS;
const V3_COMMAND_ALLOWLIST = Object.freeze([
  "worker-check",
  "worker-health",
  "worker-once",
  "sandbox-preflight",
  "image-self-check",
  "eximbay-canary-once",
  "eximbay-contacted-reconciliation-once",
]);
const V4_COMMAND_ALLOWLIST = V3_COMMAND_ALLOWLIST;
const V5_COMMAND_ALLOWLIST = V4_COMMAND_ALLOWLIST;
const V6_COMMAND_ALLOWLIST = V5_COMMAND_ALLOWLIST;
const V7_COMMAND_ALLOWLIST = V6_COMMAND_ALLOWLIST;
const V8_COMMAND_ALLOWLIST = V7_COMMAND_ALLOWLIST;
const V9_COMMAND_ALLOWLIST = V8_COMMAND_ALLOWLIST;
const V10_COMMAND_ALLOWLIST = V9_COMMAND_ALLOWLIST;
const V11_COMMAND_ALLOWLIST = V10_COMMAND_ALLOWLIST;
const V12_COMMAND_ALLOWLIST = V11_COMMAND_ALLOWLIST;
const CURRENT_COMMAND_ALLOWLIST = V12_COMMAND_ALLOWLIST;
type ContactedTargetIdentity = Readonly<{
  runId: string;
  checkoutSessionId: string;
}>;

const V10_CONTACTED_TARGET_CHAIN = Object.freeze([
  Object.freeze({
    runId: "4c5c9b039f18037c6f3356c903df1372",
    checkoutSessionId: "cmtk62h80000001s626b90f9y",
  }),
  Object.freeze({
    runId: "89682c544f42d4debb260f5e3186087a",
    checkoutSessionId: "cmtjsiiqw000001s6uimkjhj5",
  }),
  Object.freeze({
    runId: "da7783b013d20713d6db207c7657b559",
    checkoutSessionId: "cmtjnvso1000001s60xfg0tyu",
  }),
  Object.freeze({
    runId: "a764f61f4e4ba799ab16b318a676db65",
    checkoutSessionId: "cmthg2mzu000001s6iuvx7u5x",
  }),
]);
const V11_CONTACTED_TARGET_CHAIN = Object.freeze([
  Object.freeze({
    runId: "e03b436e666b4b188ec65c0ee4139790",
    checkoutSessionId: "cmtktx8rx000001s6lfbjivo1",
  }),
  ...V10_CONTACTED_TARGET_CHAIN,
]);
const V12_CONTACTED_TARGET_CHAIN = V11_CONTACTED_TARGET_CHAIN;
const CURRENT_CONTACTED_TARGET_CHAIN = Object.freeze([
  Object.freeze({
    runId: "1f93662ed1b45856aceac782029111fd",
    checkoutSessionId: "cmtqwntmf000001s6ol01azw8",
  }),
  ...V12_CONTACTED_TARGET_CHAIN,
]);
const CA_BUNDLE_PATH = "/etc/ssl/certs/ca-certificates.crt";
const SYSTEM_CA_TRUST = Object.freeze({
  sourceStage: "PINNED_CLOUD_SQL_PROXY_IMAGE",
  sourcePath: CA_BUNDLE_PATH,
  runtimePath: CA_BUNDLE_PATH,
  runtimeUser: "65532:65532",
  requiredType: "REGULAR_FILE",
  requiredNonempty: true,
  requiredReadable: true,
  requiredOwner: "0:0",
  sslCertFileOverride: "NONE",
  sslCertDirOverride: "NONE",
});

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
  CA_BUNDLE_PATH,
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

export type HistoricalEximbayImageAuthority = Readonly<{
  parentAuthoritySha256: string;
  baselineCommit: string;
  buildContext: Readonly<{
    manifestSha256: string;
    fileCount: number;
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
  }>;
  entrypoints: readonly Readonly<{ source: string; runtimePath: string }>[];
  systemCaTrust: typeof SYSTEM_CA_TRUST;
  applicationClosure: FrozenImageContract["applicationClosure"];
  systemClosure: FrozenImageContract["systemClosure"];
  nonApplicationAdditionCount: 6;
  nonApplicationAdditions: readonly RootManifestEntry[];
}>;

export type CurrentEximbayImageAuthority = HistoricalEximbayImageAuthority & Readonly<{
  sourceTree: string;
  supervisorSource: Readonly<{ path: string; sha256: string }>;
  buildContext: HistoricalEximbayImageAuthority["buildContext"] & Readonly<{
    entrypointCount: number;
    migrationCount: number;
    migrationDigest: string;
  }>;
  artifact: Readonly<{
    manifestDigest: string;
    manifestSize: number;
    configDigest: string;
    platform: "linux/amd64";
    imageSize: number;
    layerCount: number;
    diffIds: readonly string[];
  }>;
  imageConfiguration: Readonly<{
    user: "65532:65532";
    workdir: "/app";
    entrypoint: readonly string[];
    command: readonly string[];
    exposedPorts: readonly string[];
    environmentNames: readonly string[];
    labels: Readonly<Record<string, string>>;
  }>;
  commandAllowlist: readonly string[];
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

    const rawInspection: unknown = JSON.parse(
      capture("docker", ["image", "inspect", proof.tag]),
    );
    const inspected = enforceCurrentImageConfiguration(rawInspection);

    const runtimeProof = verifyRuntimeClosure(
      proof.tag,
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
      enforceCurrentArtifact(current, rawInspection);
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
      caBundle: runtimeProof.caBundle,
      nodeCaCertificateCount: runtimeProof.nodeCaCertificateCount,
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

export async function verifyExistingRefundWorkerImage(
  image: string,
): Promise<Record<string, unknown>> {
  requireCondition(
    image.length > 0
      && image.length <= 512
      && !image.startsWith("-")
      && /^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/u.test(image),
    "EXISTING_IMAGE_REFERENCE",
  );
  const context = await assembleRefundWorkerBuildContext();
  try {
    const rawInspection: unknown = JSON.parse(
      capture("docker", ["image", "inspect", image]),
    );
    const inspected = enforceCurrentImageConfiguration(rawInspection);
    const runtimeProof = verifyRuntimeClosure(
      image,
      undefined,
      context.manifestEntries,
      context.migrationInventory,
    );
    const [runtimeInventory, baseInventory] = [
      captureImageNativeInventory(image),
      captureImageNativeInventory(NODE_BASE),
    ];
    const filesystem = inspectImageNativeInventories(
      runtimeInventory,
      baseInventory,
    );
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
    const current = await readCurrentEximbayImageAuthority();
    enforceCurrentSubject(current, context);
    enforceCurrentArtifact(current, rawInspection);
    enforceCurrentClosure(filesystem, current);

    return Object.freeze({
      ok: true,
      image,
      os: inspected.os,
      architecture: inspected.architecture,
      user: inspected.user,
      nodeVersion: runtimeProof.nodeVersion,
      proxyVersion: runtimeProof.proxyVersion,
      proxySha256: runtimeProof.proxySha256,
      caBundle: runtimeProof.caBundle,
      migrationCount: runtimeProof.migrationCount,
      migrationDigest: runtimeProof.migrationDigest,
      contextManifestDigest: context.manifestDigest,
      contextFileCount: context.manifestEntries.length,
      repositoryGraphInputCount: context.repositoryGraphInputCount,
      packagedGraphInputCount: context.packagedGraphInputCount,
      applicationClosureCount: filesystem.applicationClosureCount,
      applicationMetadataManifestSha256:
        filesystem.applicationMetadataManifestSha256,
      applicationContentManifestSha256:
        filesystem.applicationContentManifestSha256,
      reviewedRemovalCount: filesystem.reviewedRemovalCount,
      removedPathManifestSha256: filesystem.removedPathManifestSha256,
      reviewedChangedEntryCount: filesystem.reviewedChangedEntryCount,
      changedMetadataContentManifestSha256:
        filesystem.changedMetadataContentManifestSha256,
      reviewedRuntimeAdditionCount: filesystem.reviewedRuntimeAdditionCount,
      addedMetadataContentManifestSha256:
        filesystem.addedMetadataContentManifestSha256,
      nonApplicationAdditions: filesystem.nonApplicationAdditions,
      forbiddenExecutableCount: filesystem.forbiddenExecutableCount,
      forbiddenContentCount: filesystem.forbiddenContentCount,
      rootOwnershipViolationCount: filesystem.rootOwnershipViolationCount,
      workerWritableDirectoryPaths: filesystem.workerWritableDirectoryPaths,
      writeDeniedProbeCount: runtimeProof.writeDeniedProbeCount,
      writeAllowedProbeCount: runtimeProof.writeAllowedProbeCount,
      currentImagePolicy: CURRENT_CONTRACT_VERSION,
      dockerBuildInvocations: 0,
    });
  } finally {
    await context.cleanup();
  }
}

function verifyRuntimeClosure(
  image: string,
  ownership: ProofImageOwnership | undefined,
  packagedEntries: readonly Readonly<{ path: string; sha256: string }>[],
  migrationInventory: RefundWorkerMigrationInventory,
) {
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
  requireCondition(runtime.caBundle.path === CA_BUNDLE_PATH, "RUNTIME_GO_CA_PATH");
  requireCondition(runtime.caBundle.fileUid === 0 && runtime.caBundle.fileGid === 0,
    "RUNTIME_GO_CA_OWNER");
  requireCondition(runtime.caBundle.runtimeUid === 65532
    && runtime.caBundle.runtimeGid === 65532, "RUNTIME_GO_CA_READER");
  requireCondition(runtime.caBundle.regularFile === true, "RUNTIME_GO_CA_TYPE");
  requireCondition(runtime.caBundle.readable === true, "RUNTIME_GO_CA_READABLE");
  requireCondition(runtime.caBundle.size > 0, "RUNTIME_GO_CA_NONEMPTY");
  requireCondition(isSha256(runtime.caBundle.sha256), "RUNTIME_GO_CA_SHA256");
  requireCondition(runtime.caBundle.sslCertFile === null
    && runtime.caBundle.sslCertDir === null, "RUNTIME_GO_CA_OVERRIDE");

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
    caBundle: runtime.caBundle,
    nodeCaCertificateCount: runtime.nodeCaCertificateCount,
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

export function enforceFilesystemSafety(filesystem: FilesystemInspection): void {
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
  authority: HistoricalEximbayImageAuthority,
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

export async function readCurrentEximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV12EximbayImageAuthority();
  const raw: unknown = JSON.parse(await readFile(CURRENT_AUTHORITY_PATH, "utf8"));
  return parseCurrentEximbayImageAuthority(raw);
}

export async function readV12EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV11EximbayImageAuthority();
  const bytes = await readFile(V12_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V12_AUTHORITY_SHA256,
    "V12_IMAGE_AUTHORITY_SHA256",
  );
  return parseV12EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV11EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV10EximbayImageAuthority();
  const bytes = await readFile(V11_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V11_AUTHORITY_SHA256,
    "V11_IMAGE_AUTHORITY_SHA256",
  );
  return parseV11EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV10EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV9EximbayImageAuthority();
  const bytes = await readFile(V10_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V10_AUTHORITY_SHA256,
    "V10_IMAGE_AUTHORITY_SHA256",
  );
  return parseV10EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV9EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV8EximbayImageAuthority();
  const bytes = await readFile(V9_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V9_AUTHORITY_SHA256,
    "V9_IMAGE_AUTHORITY_SHA256",
  );
  return parseV9EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV8EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV7EximbayImageAuthority();
  const bytes = await readFile(V8_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V8_AUTHORITY_SHA256,
    "V8_IMAGE_AUTHORITY_SHA256",
  );
  return parseV8EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV7EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV6EximbayImageAuthority();
  const bytes = await readFile(V7_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V7_AUTHORITY_SHA256,
    "V7_IMAGE_AUTHORITY_SHA256",
  );
  return parseV7EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV6EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV5EximbayImageAuthority();
  const bytes = await readFile(V6_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V6_AUTHORITY_SHA256,
    "V6_IMAGE_AUTHORITY_SHA256",
  );
  return parseV6EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV5EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV4EximbayImageAuthority();
  const bytes = await readFile(V5_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V5_AUTHORITY_SHA256,
    "V5_IMAGE_AUTHORITY_SHA256",
  );
  return parseV5EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV4EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV3EximbayImageAuthority();
  const bytes = await readFile(V4_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V4_AUTHORITY_SHA256,
    "V4_IMAGE_AUTHORITY_SHA256",
  );
  return parseV4EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV3EximbayImageAuthority():
Promise<CurrentEximbayImageAuthority> {
  await readV2EximbayImageAuthority();
  const bytes = await readFile(V3_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V3_AUTHORITY_SHA256,
    "V3_IMAGE_AUTHORITY_SHA256",
  );
  return parseV3EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV2EximbayImageAuthority():
Promise<HistoricalEximbayImageAuthority> {
  await readV1EximbayImageAuthority();
  const bytes = await readFile(V2_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V2_AUTHORITY_SHA256,
    "V2_IMAGE_AUTHORITY_SHA256",
  );
  return parseV2EximbayImageAuthority(JSON.parse(bytes.toString("utf8")));
}

export async function readV1EximbayImageAuthority():
Promise<HistoricalEximbayImageAuthority> {
  const bytes = await readFile(V1_AUTHORITY_PATH);
  requireCondition(
    createHash("sha256").update(bytes).digest("hex") === V1_AUTHORITY_SHA256,
    "V1_IMAGE_AUTHORITY_SHA256",
  );
  return parseV1EximbayImageAuthority(
    JSON.parse(bytes.toString("utf8")),
  );
}

export function parseCurrentEximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: CURRENT_CONTRACT_VERSION,
    parentAuthoritySha256: V12_AUTHORITY_SHA256,
    baselineCommit: CURRENT_BASELINE_COMMIT,
    entrypoints: CURRENT_ENTRYPOINTS,
  }, CURRENT_SOURCE_TREE, CURRENT_SUPERVISOR_SOURCE, CURRENT_COMMAND_ALLOWLIST,
  ["filesystemAuthority", "canaryExecution", "contactedReconciliation"], true,
  CURRENT_CONTACTED_TARGET_CHAIN);
}

export function parseV12EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V12_CONTRACT_VERSION,
    parentAuthoritySha256: V11_AUTHORITY_SHA256,
    baselineCommit: V12_BASELINE_COMMIT,
    entrypoints: V12_ENTRYPOINTS,
  }, V12_SOURCE_TREE, V12_SUPERVISOR_SOURCE, V12_COMMAND_ALLOWLIST,
  ["filesystemAuthority", "canaryExecution", "contactedReconciliation"], true,
  V12_CONTACTED_TARGET_CHAIN);
}

export function parseV11EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V11_CONTRACT_VERSION,
    parentAuthoritySha256: V10_AUTHORITY_SHA256,
    baselineCommit: V11_BASELINE_COMMIT,
    entrypoints: V11_ENTRYPOINTS,
  }, V11_SOURCE_TREE, V11_SUPERVISOR_SOURCE, V11_COMMAND_ALLOWLIST,
  ["filesystemAuthority", "canaryExecution", "contactedReconciliation"], true,
  V11_CONTACTED_TARGET_CHAIN);
}

export function parseV10EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V10_CONTRACT_VERSION,
    parentAuthoritySha256: V9_AUTHORITY_SHA256,
    baselineCommit: V10_BASELINE_COMMIT,
    entrypoints: V10_ENTRYPOINTS,
  }, V10_SOURCE_TREE, V10_SUPERVISOR_SOURCE, V10_COMMAND_ALLOWLIST,
  ["filesystemAuthority", "canaryExecution", "contactedReconciliation"], true,
  V10_CONTACTED_TARGET_CHAIN);
}

export function parseV9EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V9_CONTRACT_VERSION,
    parentAuthoritySha256: V8_AUTHORITY_SHA256,
    baselineCommit: V9_BASELINE_COMMIT,
    entrypoints: V9_ENTRYPOINTS,
  }, V9_SOURCE_TREE, V9_SUPERVISOR_SOURCE, V9_COMMAND_ALLOWLIST,
  ["filesystemAuthority", "canaryExecution"], true);
}

export function parseV8EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V8_CONTRACT_VERSION,
    parentAuthoritySha256: V7_AUTHORITY_SHA256,
    baselineCommit: V8_BASELINE_COMMIT,
    entrypoints: V8_ENTRYPOINTS,
  }, V8_SOURCE_TREE, V8_SUPERVISOR_SOURCE, V8_COMMAND_ALLOWLIST);
}

export function parseV7EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V7_CONTRACT_VERSION,
    parentAuthoritySha256: V6_AUTHORITY_SHA256,
    baselineCommit: V7_BASELINE_COMMIT,
    entrypoints: V7_ENTRYPOINTS,
  }, V7_SOURCE_TREE, V7_SUPERVISOR_SOURCE, V7_COMMAND_ALLOWLIST);
}

export function parseV6EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V6_CONTRACT_VERSION,
    parentAuthoritySha256: V5_AUTHORITY_SHA256,
    baselineCommit: V6_BASELINE_COMMIT,
    entrypoints: V6_ENTRYPOINTS,
  }, V6_SOURCE_TREE, V6_SUPERVISOR_SOURCE, V6_COMMAND_ALLOWLIST);
}

export function parseV5EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V5_CONTRACT_VERSION,
    parentAuthoritySha256: V4_AUTHORITY_SHA256,
    baselineCommit: V5_BASELINE_COMMIT,
    entrypoints: V5_ENTRYPOINTS,
  }, V5_SOURCE_TREE, V5_SUPERVISOR_SOURCE, V5_COMMAND_ALLOWLIST);
}

export function parseV4EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V4_CONTRACT_VERSION,
    parentAuthoritySha256: V3_AUTHORITY_SHA256,
    baselineCommit: V4_BASELINE_COMMIT,
    entrypoints: V4_ENTRYPOINTS,
  }, V4_SOURCE_TREE, V4_SUPERVISOR_SOURCE, V4_COMMAND_ALLOWLIST);
}

export function parseV3EximbayImageAuthority(
  raw: unknown,
): CurrentEximbayImageAuthority {
  return parseSuccessorEximbayImageAuthority(raw, {
    contractVersion: V3_CONTRACT_VERSION,
    parentAuthoritySha256: V2_AUTHORITY_SHA256,
    baselineCommit: V3_BASELINE_COMMIT,
    entrypoints: V3_ENTRYPOINTS,
  }, V3_SOURCE_TREE, V3_SUPERVISOR_SOURCE, V3_COMMAND_ALLOWLIST);
}

function parseSuccessorEximbayImageAuthority(
  raw: unknown,
  expected: EximbayImageAuthorityIdentity,
  sourceTree: string,
  supervisorSource: CurrentEximbayImageAuthority["supervisorSource"],
  commandAllowlist: readonly string[],
  extensionKeys: readonly string[] = [],
  orderedLayers = false,
  contactedTargetChain: readonly ContactedTargetIdentity[] =
    CURRENT_CONTACTED_TARGET_CHAIN,
): CurrentEximbayImageAuthority {
  requireCondition(isRecord(raw) && hasExactKeys(raw, [
    "contractVersion", "parentAuthoritySha256", "baselineCommit", "sourceTree",
    "supervisorSource", "buildContext", "artifact", "imageConfiguration",
    "commandAllowlist", "entrypoints", "systemCaTrust", "applicationClosure",
    "systemClosure", "nonApplicationAdditionCount", "nonApplicationAdditions",
    ...extensionKeys,
  ]), "CURRENT_IMAGE_AUTHORITY_SHAPE");
  validateSuccessorAuthorityExtensions(raw, extensionKeys, contactedTargetChain);
  requireCondition(raw.sourceTree === sourceTree, "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(raw.supervisorSource) === JSON.stringify(supervisorSource),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  const successorContext = parseSuccessorBuildContext(raw.buildContext);
  const base = parseEximbayImageAuthority({
    contractVersion: raw.contractVersion,
    parentAuthoritySha256: raw.parentAuthoritySha256,
    baselineCommit: raw.baselineCommit,
    buildContext: {
      manifestSha256: successorContext.manifestSha256,
      fileCount: successorContext.fileCount,
      repositoryGraphInputCount: successorContext.repositoryGraphInputCount,
      packagedGraphInputCount: successorContext.packagedGraphInputCount,
    },
    entrypoints: raw.entrypoints,
    systemCaTrust: raw.systemCaTrust,
    applicationClosure: raw.applicationClosure,
    systemClosure: raw.systemClosure,
    nonApplicationAdditionCount: raw.nonApplicationAdditionCount,
    nonApplicationAdditions: raw.nonApplicationAdditions,
  }, expected);
  requireCondition(
    JSON.stringify(raw.commandAllowlist) === JSON.stringify(commandAllowlist),
    "CURRENT_COMMAND_ALLOWLIST_BINDING",
  );
  return Object.freeze({
    ...base,
    sourceTree,
    supervisorSource,
    buildContext: successorContext,
    artifact: parseSuccessorArtifactAuthority(raw.artifact, orderedLayers),
    imageConfiguration: parseSuccessorImageConfiguration(raw.imageConfiguration),
    commandAllowlist: Object.freeze([...commandAllowlist]),
  });
}

function validateSuccessorAuthorityExtensions(
  raw: Readonly<Record<string, unknown>>,
  extensionKeys: readonly string[],
  contactedTargetChain: readonly ContactedTargetIdentity[],
): void {
  const extensions = new Set(extensionKeys);
  if (extensions.has("filesystemAuthority")) {
    requireCondition(
      raw.filesystemAuthority === "OFFLINE_DOCKER_IMAGE_SAVE_VERIFIED_LAYERS",
      "CURRENT_FILESYSTEM_AUTHORITY",
    );
  }
  if (extensions.has("canaryExecution")) {
    validateCanaryExecutionAuthority(raw.canaryExecution);
  }
  if (extensions.has("contactedReconciliation")) {
    validateContactedReconciliationAuthority(
      raw.contactedReconciliation,
      contactedTargetChain,
    );
  }
}

function requireExtensionRecord(
  value: unknown,
  keys: readonly string[],
  code: string,
): Readonly<Record<string, unknown>> {
  requireCondition(isRecord(value), code);
  requireCondition(hasExactKeys(value, keys), code);
  return value;
}

function requireExtensionValue(
  actual: unknown,
  expected: unknown,
  code: string,
): void {
  requireCondition(actual === expected, code);
}

function validateCanaryExecutionAuthority(value: unknown): void {
  const canary = requireExtensionRecord(value, [
    "command", "predecessorCanaryPolicySha256", "mode", "targetFreshnessMaxAgeMs",
    "preRefundRetrieve", "refundRequest", "postRefundRetrieve", "recoveryRetrieve",
    "secondRefundRequest", "automaticRetry", "uncertainOutcome", "sourceFiles",
    "packagedCanarySha256", "packagedSupervisorSha256",
  ], "CURRENT_CANARY_EXECUTION_SHAPE");
  requireExtensionValue(canary.command, "eximbay-canary-once", "CURRENT_CANARY_EXECUTION_BINDING");
  requireExtensionValue(canary.predecessorCanaryPolicySha256, V1_AUTHORITY_SHA256,
    "CURRENT_CANARY_EXECUTION_BINDING");
  requireExtensionValue(canary.mode, "SANDBOX", "CURRENT_CANARY_EXECUTION_BINDING");
  requireExtensionValue(canary.targetFreshnessMaxAgeMs, 1_800_000,
    "CURRENT_CANARY_EXECUTION_BINDING");
  requireExtensionValue(canary.preRefundRetrieve, 1, "CURRENT_CANARY_EXECUTION_CAPS");
  requireExtensionValue(canary.refundRequest, 1, "CURRENT_CANARY_EXECUTION_CAPS");
  requireExtensionValue(canary.postRefundRetrieve, 0, "CURRENT_CANARY_EXECUTION_CAPS");
  requireExtensionValue(canary.recoveryRetrieve, 0, "CURRENT_CANARY_EXECUTION_CAPS");
  requireExtensionValue(canary.secondRefundRequest, 0, "CURRENT_CANARY_EXECUTION_CAPS");
  requireExtensionValue(canary.automaticRetry, 0, "CURRENT_CANARY_EXECUTION_CAPS");
  requireExtensionValue(canary.uncertainOutcome,
    "STOP_SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED", "CURRENT_CANARY_EXECUTION_BINDING");
  requireCondition(Array.isArray(canary.sourceFiles), "CURRENT_CANARY_EXECUTION_SOURCES");
  requireCondition(canary.sourceFiles.length === 4, "CURRENT_CANARY_EXECUTION_SOURCES");
  for (const source of canary.sourceFiles) {
    const sourceRecord = requireExtensionRecord(source, ["path", "sha256"],
      "CURRENT_CANARY_EXECUTION_SOURCES");
    requireCondition(typeof sourceRecord.path === "string", "CURRENT_CANARY_EXECUTION_SOURCES");
    requireCondition(isSha256(sourceRecord.sha256), "CURRENT_CANARY_EXECUTION_SOURCES");
  }
  requireCondition(isSha256(canary.packagedCanarySha256), "CURRENT_CANARY_EXECUTION_PACKAGED");
  requireCondition(isSha256(canary.packagedSupervisorSha256), "CURRENT_CANARY_EXECUTION_PACKAGED");
}

function validateContactedReconciliationAuthority(
  value: unknown,
  targetChain: readonly ContactedTargetIdentity[],
): void {
  const contacted = requireExtensionRecord(value, [
    "command", "mode", "target", "paymentBinding", "providerOrderIdBinding",
    "arbitraryTargetAuthority", "previousTargetCurrent", "eligiblePaymentCardinality",
    "providerEffectCaps", "recoverySemantics", "runtime", "sourceFiles",
    "packagedContactedSha256",
  ], "CURRENT_CONTACTED_RECONCILIATION_SHAPE");
  requireExtensionValue(contacted.command, "eximbay-contacted-reconciliation-once",
    "CURRENT_CONTACTED_RECONCILIATION_BINDING");
  requireExtensionValue(contacted.mode, "SANDBOX", "CURRENT_CONTACTED_RECONCILIATION_BINDING");
  validateContactedTargetAuthority(contacted.target, targetChain);
  requireExtensionValue(contacted.paymentBinding, "APPLICATION_DERIVED",
    "CURRENT_CONTACTED_RECONCILIATION_BINDING");
  requireExtensionValue(contacted.providerOrderIdBinding, "APPLICATION_DERIVED",
    "CURRENT_CONTACTED_RECONCILIATION_BINDING");
  requireExtensionValue(contacted.arbitraryTargetAuthority, "ABSENT",
    "CURRENT_CONTACTED_RECONCILIATION_BINDING");
  requireExtensionValue(contacted.previousTargetCurrent, "NO",
    "CURRENT_CONTACTED_RECONCILIATION_BINDING");
  requireExtensionValue(contacted.eligiblePaymentCardinality, "EXACTLY_ONE",
    "CURRENT_CONTACTED_RECONCILIATION_BINDING");
  const caps = requireExtensionRecord(contacted.providerEffectCaps, [
      "maxProviderRetrieveAttemptsPerExecution", "automaticProviderRetry",
      "cloudRunTaskRetry",
  ], "CURRENT_CONTACTED_RECONCILIATION_CAPS");
  requireExtensionValue(caps.maxProviderRetrieveAttemptsPerExecution, 1,
    "CURRENT_CONTACTED_RECONCILIATION_CAPS");
  requireExtensionValue(caps.automaticProviderRetry, 0, "CURRENT_CONTACTED_RECONCILIATION_CAPS");
  requireExtensionValue(caps.cloudRunTaskRetry, 0, "CURRENT_CONTACTED_RECONCILIATION_CAPS");
  const semantics = requireExtensionRecord(contacted.recoverySemantics, [
    "attemptLifecycle", "remediationStatus", "providerOrderId", "providerPaymentKey",
    "financialSucceededAt", "blockingEndedAt", "order", "q004ReplayProtection",
    "singleActiveBlocker", "expiredAlreadyContacted", "expiredBeforeFreshContact",
  ], "CURRENT_CONTACTED_RECONCILIATION_SEMANTICS");
  const semanticValues: readonly [string, unknown][] = [
    ["attemptLifecycle", "CONTACTED"], ["remediationStatus", "NONE"],
    ["providerOrderId", "REQUIRED"], ["providerPaymentKey", "ABSENT"],
    ["financialSucceededAt", "NULL"], ["blockingEndedAt", "NULL"],
    ["order", "ABSENT"], ["q004ReplayProtection", "REQUIRED"],
    ["singleActiveBlocker", "REQUIRED"], ["expiredAlreadyContacted", "RECOVERABLE"],
    ["expiredBeforeFreshContact", "NOT_USABLE"],
  ];
  for (const [field, expected] of semanticValues) {
    requireExtensionValue(semantics[field], expected, "CURRENT_CONTACTED_RECONCILIATION_SEMANTICS");
  }
  const runtime = requireExtensionRecord(contacted.runtime, [
    "default", "taskCount", "parallelism", "maxRetries", "timeoutSeconds",
    "automaticExecution",
  ], "CURRENT_CONTACTED_RECONCILIATION_RUNTIME");
  requireExtensionValue(runtime.default, "OFF", "CURRENT_CONTACTED_RECONCILIATION_RUNTIME");
  requireExtensionValue(runtime.taskCount, 1, "CURRENT_CONTACTED_RECONCILIATION_RUNTIME");
  requireExtensionValue(runtime.parallelism, 1, "CURRENT_CONTACTED_RECONCILIATION_RUNTIME");
  requireExtensionValue(runtime.maxRetries, 0, "CURRENT_CONTACTED_RECONCILIATION_RUNTIME");
  requireExtensionValue(runtime.timeoutSeconds, 180, "CURRENT_CONTACTED_RECONCILIATION_RUNTIME");
  requireExtensionValue(runtime.automaticExecution, "NONE", "CURRENT_CONTACTED_RECONCILIATION_RUNTIME");
  requireCondition(Array.isArray(contacted.sourceFiles), "CURRENT_CONTACTED_RECONCILIATION_SOURCES");
  requireCondition(contacted.sourceFiles.length === 4, "CURRENT_CONTACTED_RECONCILIATION_SOURCES");
  for (const source of contacted.sourceFiles) {
    const sourceRecord = requireExtensionRecord(source, ["path", "sha256"],
      "CURRENT_CONTACTED_RECONCILIATION_SOURCES");
    requireCondition(typeof sourceRecord.path === "string", "CURRENT_CONTACTED_RECONCILIATION_SOURCES");
    requireCondition(isSha256(sourceRecord.sha256), "CURRENT_CONTACTED_RECONCILIATION_SOURCES");
  }
  requireCondition(isSha256(contacted.packagedContactedSha256),
    "CURRENT_CONTACTED_RECONCILIATION_PACKAGED");
}

function validateContactedTargetAuthority(
  value: unknown,
  targetChain: readonly ContactedTargetIdentity[],
): void {
  const target = requireExtensionRecord(value, [
    "runId", "checkoutSessionId", "paymentId", "providerOrderId",
    "authenticatedUserId", "operatorTargetInputs", "predecessor",
  ], "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  const [current, ...historical] = targetChain;
  requireCondition(current !== undefined, "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  requireExtensionValue(target.runId, current.runId,
    "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  requireExtensionValue(target.checkoutSessionId, current.checkoutSessionId,
    "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  requireExtensionValue(target.paymentId, "DERIVED_BY_APPLICATION",
    "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  requireExtensionValue(target.providerOrderId, "DERIVED_BY_APPLICATION",
    "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  requireExtensionValue(target.authenticatedUserId, "DERIVED_BY_APPLICATION",
    "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  requireExtensionValue(target.operatorTargetInputs, 0, "CURRENT_CONTACTED_RECONCILIATION_TARGET");
  let node: unknown = target.predecessor;
  for (const [index, expected] of historical.entries()) {
    const isLast = index === historical.length - 1;
    const record = requireExtensionRecord(node, isLast
      ? ["runId", "checkoutSessionId", "status"]
      : ["runId", "checkoutSessionId", "status", "predecessor"],
    "CURRENT_CONTACTED_RECONCILIATION_TARGET");
    requireExtensionValue(record.runId, expected.runId,
      "CURRENT_CONTACTED_RECONCILIATION_TARGET");
    requireExtensionValue(record.checkoutSessionId, expected.checkoutSessionId,
      "CURRENT_CONTACTED_RECONCILIATION_TARGET");
    requireExtensionValue(record.status, "SUPERSEDED_HISTORICAL_ONLY",
      "CURRENT_CONTACTED_RECONCILIATION_TARGET");
    if (!isLast) node = record.predecessor;
  }
}

export function parseV2EximbayImageAuthority(
  raw: unknown,
): HistoricalEximbayImageAuthority {
  return parseEximbayImageAuthority(raw, {
    contractVersion: V2_CONTRACT_VERSION,
    parentAuthoritySha256: V1_AUTHORITY_SHA256,
    baselineCommit: V2_BASELINE_COMMIT,
    entrypoints: V2_ENTRYPOINTS,
  });
}

export function parseV1EximbayImageAuthority(
  raw: unknown,
): HistoricalEximbayImageAuthority {
  return parseEximbayImageAuthority(raw, {
    contractVersion: V1_CONTRACT_VERSION,
    parentAuthoritySha256: FROZEN_PARENT_AUTHORITY_SHA256,
    baselineCommit: V1_BASELINE_COMMIT,
    entrypoints: V1_ENTRYPOINTS,
  });
}

type EximbayImageAuthorityIdentity = Readonly<{
  contractVersion: string;
  parentAuthoritySha256: string;
  baselineCommit: string;
  entrypoints: readonly Readonly<{ source: string; runtimePath: string }>[];
}>;

const CURRENT_IMAGE_LABELS = Object.freeze({
  "mira.refund.contract": "mira-refund-worker-runtime-image-connection/v1",
  "mira.refund.release-authority": "absent",
  "org.opencontainers.image.created": "1784764800",
  "org.opencontainers.image.title": "mira-refund-worker",
  "org.opencontainers.image.version": "local-reproducibility-proof",
});
const CURRENT_ENVIRONMENT_NAMES = Object.freeze([
  "PATH", "NODE_VERSION", "YARN_VERSION", "NODE_ENV",
]);
const CURRENT_IMAGE_ENTRYPOINT = Object.freeze([
  "/usr/local/bin/node",
  "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs",
]);

function parseSuccessorBuildContext(value: unknown):
CurrentEximbayImageAuthority["buildContext"] {
  requireCondition(isRecord(value) && hasExactKeys(value, [
    "manifestSha256", "fileCount", "repositoryGraphInputCount",
    "packagedGraphInputCount", "entrypointCount", "migrationCount",
    "migrationDigest",
  ]), "CURRENT_BUILD_CONTEXT_SHAPE");
  requireCondition(isSha256(value.manifestSha256), "CURRENT_CONTEXT_DIGEST");
  const fileCount = requireNonnegativeSafeInteger(
    value.fileCount, "CURRENT_CONTEXT_COUNT",
  );
  const repositoryGraphInputCount = requireNonnegativeSafeInteger(
    value.repositoryGraphInputCount, "CURRENT_CONTEXT_COUNT",
  );
  const packagedGraphInputCount = requireNonnegativeSafeInteger(
    value.packagedGraphInputCount, "CURRENT_CONTEXT_COUNT",
  );
  const entrypointCount = requireNonnegativeSafeInteger(
    value.entrypointCount, "CURRENT_CONTEXT_COUNT",
  );
  const migrationCount = requireNonnegativeSafeInteger(
    value.migrationCount, "CURRENT_CONTEXT_COUNT",
  );
  requireCondition(isSha256(value.migrationDigest), "CURRENT_MIGRATION_DIGEST");
  return Object.freeze({
    manifestSha256: value.manifestSha256,
    fileCount,
    repositoryGraphInputCount,
    packagedGraphInputCount,
    entrypointCount,
    migrationCount,
    migrationDigest: value.migrationDigest,
  });
}

function parseSuccessorArtifactAuthority(value: unknown, orderedLayers: boolean):
CurrentEximbayImageAuthority["artifact"] {
  requireCondition(isRecord(value), "CURRENT_ARTIFACT_SHAPE");
  const artifactKeys = [
    "manifestDigest", "manifestSize", "configDigest", "platform",
    "imageSize", "layerCount", "diffIds",
  ];
  const keysWithOrderedLayers = [...artifactKeys, "orderedLayers"];
  requireCondition(orderedLayers
    ? hasExactKeys(value, keysWithOrderedLayers)
    : hasExactKeys(value, artifactKeys), "CURRENT_ARTIFACT_SHAPE");
  requireCondition(isDockerDigest(value.manifestDigest), "CURRENT_MANIFEST_DIGEST");
  requireCondition(isDockerDigest(value.configDigest), "CURRENT_CONFIG_DIGEST");
  requireCondition(value.platform === PLATFORM, "CURRENT_ARTIFACT_PLATFORM");
  const manifestSize = requireNonnegativeSafeInteger(
    value.manifestSize, "CURRENT_ARTIFACT_COUNT",
  );
  const imageSize = requireNonnegativeSafeInteger(
    value.imageSize, "CURRENT_ARTIFACT_COUNT",
  );
  const layerCount = requireNonnegativeSafeInteger(
    value.layerCount, "CURRENT_ARTIFACT_COUNT",
  );
  requireCondition(Array.isArray(value.diffIds)
    && value.diffIds.length === layerCount
    && value.diffIds.every(isDockerDigest), "CURRENT_ARTIFACT_DIFF_IDS");
  if (orderedLayers) {
    requireCondition(Array.isArray(value.orderedLayers)
      && value.orderedLayers.length === layerCount,
    "CURRENT_ARTIFACT_ORDERED_LAYERS");
    for (const [index, layer] of value.orderedLayers.entries()) {
      requireCondition(isRecord(layer) && hasExactKeys(layer, [
        "mediaType", "digest", "size", "diffId",
      ]), "CURRENT_ARTIFACT_ORDERED_LAYERS");
      requireCondition(layer.mediaType === "application/vnd.docker.image.rootfs.diff.tar.gzip",
        "CURRENT_ARTIFACT_ORDERED_LAYERS");
      requireCondition(isDockerDigest(layer.digest)
        && isNonnegativeSafeInteger(layer.size)
        && isDockerDigest(layer.diffId), "CURRENT_ARTIFACT_ORDERED_LAYERS");
      requireCondition(layer.diffId === value.diffIds[index],
        "CURRENT_ARTIFACT_ORDERED_LAYERS");
    }
  }
  return Object.freeze({
    manifestDigest: value.manifestDigest,
    manifestSize,
    configDigest: value.configDigest,
    platform: PLATFORM,
    imageSize,
    layerCount,
    diffIds: Object.freeze([...value.diffIds]),
  });
}

function parseSuccessorImageConfiguration(value: unknown):
CurrentEximbayImageAuthority["imageConfiguration"] {
  requireCondition(isRecord(value) && hasExactKeys(value, [
    "user", "workdir", "entrypoint", "command", "exposedPorts",
    "environmentNames", "labels",
  ]), "CURRENT_IMAGE_CONFIGURATION_SHAPE");
  requireCondition(value.user === "65532:65532" && value.workdir === "/app",
    "CURRENT_IMAGE_CONFIGURATION_IDENTITY");
  requireCondition(JSON.stringify(value.entrypoint) === JSON.stringify(CURRENT_IMAGE_ENTRYPOINT)
    && JSON.stringify(value.command) === "[]"
    && JSON.stringify(value.exposedPorts) === "[]",
  "CURRENT_IMAGE_CONFIGURATION_COMMAND");
  requireCondition(
    JSON.stringify(value.environmentNames) === JSON.stringify(CURRENT_ENVIRONMENT_NAMES),
    "CURRENT_IMAGE_CONFIGURATION_ENVIRONMENT",
  );
  requireCondition(
    JSON.stringify(value.labels) === JSON.stringify(CURRENT_IMAGE_LABELS),
    "CURRENT_IMAGE_CONFIGURATION_LABELS",
  );
  return Object.freeze({
    user: "65532:65532",
    workdir: "/app",
    entrypoint: CURRENT_IMAGE_ENTRYPOINT,
    command: Object.freeze([]),
    exposedPorts: Object.freeze([]),
    environmentNames: CURRENT_ENVIRONMENT_NAMES,
    labels: CURRENT_IMAGE_LABELS,
  });
}

function parseEximbayImageAuthority(
  raw: unknown,
  expected: EximbayImageAuthorityIdentity,
): HistoricalEximbayImageAuthority {
  requireCondition(isRecord(raw), "CURRENT_IMAGE_AUTHORITY_SHAPE");
  requireCondition(hasExactKeys(raw, [
    "contractVersion", "parentAuthoritySha256", "baselineCommit", "buildContext",
    "entrypoints", "systemCaTrust", "applicationClosure", "systemClosure",
    "nonApplicationAdditionCount", "nonApplicationAdditions",
  ]), "CURRENT_IMAGE_AUTHORITY_SHAPE");
  requireCondition(raw.contractVersion === expected.contractVersion,
    "CURRENT_IMAGE_AUTHORITY_VERSION");
  requireCondition(raw.parentAuthoritySha256 === expected.parentAuthoritySha256,
    "CURRENT_PARENT_AUTHORITY_BINDING");
  requireCondition(raw.baselineCommit === expected.baselineCommit,
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
  const entrypoints = parseCurrentEntrypoints(
    raw.entrypoints,
    expected.entrypoints.length,
  );
  requireCondition(
    JSON.stringify(raw.systemCaTrust) === JSON.stringify(SYSTEM_CA_TRUST),
    "CURRENT_SYSTEM_CA_TRUST",
  );
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
  requireCondition(raw.nonApplicationAdditionCount === 6,
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
    systemCaTrust: SYSTEM_CA_TRUST,
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
    nonApplicationAdditionCount: 6,
    nonApplicationAdditions,
  });
}

function parseCurrentNonApplicationAdditions(value: unknown): readonly RootManifestEntry[] {
  requireCondition(Array.isArray(value) && value.length === 6,
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
  expectedCount: number,
): readonly Readonly<{ source: string; runtimePath: string }>[] {
  requireCondition(Array.isArray(value) && value.length === expectedCount,
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
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: CURRENT_CONTRACT_VERSION,
    parentAuthoritySha256: V12_AUTHORITY_SHA256,
    baselineCommit: CURRENT_BASELINE_COMMIT,
    entrypoints: CURRENT_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === CURRENT_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(CURRENT_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV12EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V12_CONTRACT_VERSION,
    parentAuthoritySha256: V11_AUTHORITY_SHA256,
    baselineCommit: V12_BASELINE_COMMIT,
    entrypoints: V12_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V12_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V12_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV11EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V11_CONTRACT_VERSION,
    parentAuthoritySha256: V10_AUTHORITY_SHA256,
    baselineCommit: V11_BASELINE_COMMIT,
    entrypoints: V11_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V11_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V11_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV10EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V10_CONTRACT_VERSION,
    parentAuthoritySha256: V9_AUTHORITY_SHA256,
    baselineCommit: V10_BASELINE_COMMIT,
    entrypoints: V10_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V10_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V10_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV9EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V9_CONTRACT_VERSION,
    parentAuthoritySha256: V8_AUTHORITY_SHA256,
    baselineCommit: V9_BASELINE_COMMIT,
    entrypoints: V9_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V9_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V9_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV8EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V8_CONTRACT_VERSION,
    parentAuthoritySha256: V7_AUTHORITY_SHA256,
    baselineCommit: V8_BASELINE_COMMIT,
    entrypoints: V8_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V8_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V8_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV7EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V7_CONTRACT_VERSION,
    parentAuthoritySha256: V6_AUTHORITY_SHA256,
    baselineCommit: V7_BASELINE_COMMIT,
    entrypoints: V7_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V7_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V7_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV6EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V6_CONTRACT_VERSION,
    parentAuthoritySha256: V5_AUTHORITY_SHA256,
    baselineCommit: V6_BASELINE_COMMIT,
    entrypoints: V6_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V6_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V6_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV5EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V5_CONTRACT_VERSION,
    parentAuthoritySha256: V4_AUTHORITY_SHA256,
    baselineCommit: V5_BASELINE_COMMIT,
    entrypoints: V5_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V5_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V5_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV4EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V4_CONTRACT_VERSION,
    parentAuthoritySha256: V3_AUTHORITY_SHA256,
    baselineCommit: V4_BASELINE_COMMIT,
    entrypoints: V4_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V4_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V4_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV3EximbayImageSubject(
  authority: CurrentEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
    entrypointCount: number;
    migrationInventory: Readonly<{
      migrationCount: number;
      migrationDigest: string;
    }>;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V3_CONTRACT_VERSION,
    parentAuthoritySha256: V2_AUTHORITY_SHA256,
    baselineCommit: V3_BASELINE_COMMIT,
    entrypoints: V3_ENTRYPOINTS,
  });
  requireCondition(authority.sourceTree === V3_SOURCE_TREE,
    "CURRENT_SOURCE_TREE_BINDING");
  requireCondition(
    JSON.stringify(authority.supervisorSource) === JSON.stringify(V3_SUPERVISOR_SOURCE),
    "CURRENT_SUPERVISOR_SOURCE_BINDING",
  );
  requireCondition(authority.buildContext.entrypointCount === context.entrypointCount,
    "CURRENT_ENTRYPOINT_COUNT_BINDING");
  requireCondition(
    authority.buildContext.migrationCount === context.migrationInventory.migrationCount,
    "CURRENT_MIGRATION_COUNT_BINDING",
  );
  requireCondition(
    authority.buildContext.migrationDigest === context.migrationInventory.migrationDigest,
    "CURRENT_MIGRATION_DIGEST_BINDING",
  );
}

export function enforceV2EximbayImageSubject(
  authority: HistoricalEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V2_CONTRACT_VERSION,
    parentAuthoritySha256: V1_AUTHORITY_SHA256,
    baselineCommit: V2_BASELINE_COMMIT,
    entrypoints: V2_ENTRYPOINTS,
  });
}

export function enforceV1EximbayImageSubject(
  authority: HistoricalEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
  }>,
): void {
  enforceEximbayImageSubject(authority, context, {
    contractVersion: V1_CONTRACT_VERSION,
    parentAuthoritySha256: FROZEN_PARENT_AUTHORITY_SHA256,
    baselineCommit: V1_BASELINE_COMMIT,
    entrypoints: V1_ENTRYPOINTS,
  });
}

function enforceEximbayImageSubject(
  authority: HistoricalEximbayImageAuthority,
  context: Readonly<{
    manifestDigest: string;
    manifestEntries: readonly unknown[];
    repositoryGraphInputCount: number;
    packagedGraphInputCount: number;
  }>,
  expected: EximbayImageAuthorityIdentity,
): void {
  requireCondition(authority.parentAuthoritySha256 === expected.parentAuthoritySha256,
    "CURRENT_PARENT_AUTHORITY_BINDING");
  requireCondition(authority.baselineCommit === expected.baselineCommit,
    "CURRENT_BASELINE_COMMIT_BINDING");
  requireCondition(
    JSON.stringify(authority.systemCaTrust) === JSON.stringify(SYSTEM_CA_TRUST),
    "CURRENT_SYSTEM_CA_TRUST",
  );
  requireCondition(authority.buildContext.manifestSha256 === context.manifestDigest,
    "CURRENT_CONTEXT_MANIFEST_BINDING");
  requireCondition(authority.buildContext.fileCount === context.manifestEntries.length,
    "CURRENT_CONTEXT_FILE_COUNT_BINDING");
  requireCondition(authority.buildContext.repositoryGraphInputCount === context.repositoryGraphInputCount,
    "CURRENT_REPOSITORY_GRAPH_BINDING");
  requireCondition(authority.buildContext.packagedGraphInputCount === context.packagedGraphInputCount,
    "CURRENT_PACKAGED_GRAPH_BINDING");
  requireCondition(JSON.stringify(authority.entrypoints) === JSON.stringify(expected.entrypoints),
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
    const caBundlePath = ${JSON.stringify(CA_BUNDLE_PATH)};
    fs.accessSync(caBundlePath, fs.constants.R_OK);
    const caBundleStat = fs.statSync(caBundlePath);
    const caBundle = fs.readFileSync(caBundlePath);
    const libraries = [
      "/lib/x86_64-linux-gnu/libc.so.6",
      "/lib/x86_64-linux-gnu/libz.so.1",
      "/lib/x86_64-linux-gnu/libgcc_s.so.1"
    ];
    process.stdout.write(JSON.stringify({
      proxySha256: crypto.createHash("sha256").update(proxy).digest("hex"),
      nodeOpenSsl: process.versions.openssl,
      runtimeLibrariesPresent: libraries.every((file) => fs.existsSync(file)),
      caBundle: {
        path: caBundlePath,
        fileUid: caBundleStat.uid,
        fileGid: caBundleStat.gid,
        mode: caBundleStat.mode & 0o7777,
        runtimeUid: process.getuid(),
        runtimeGid: process.getgid(),
        regularFile: caBundleStat.isFile(),
        readable: true,
        size: caBundle.byteLength,
        sha256: crypto.createHash("sha256").update(caBundle).digest("hex"),
        sslCertFile: process.env.SSL_CERT_FILE ?? null,
        sslCertDir: process.env.SSL_CERT_DIR ?? null
      },
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
  ownership: ProofImageOwnership | undefined,
  args: readonly string[],
) {
  return captureStatus(ownership ? withOwnedContainerName(ownership, args) : args);
}

function captureContainer(
  ownership: ProofImageOwnership | undefined,
  args: readonly string[],
): string {
  return capture("docker", ownership ? withOwnedContainerName(ownership, args) : args);
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
  workdir: string;
  entrypoint: readonly unknown[];
  command: readonly unknown[];
  exposedPorts: readonly string[];
  environmentNames: readonly string[];
  labels: Readonly<Record<string, string>>;
}>;

export function enforceCurrentArtifact(
  authority: CurrentEximbayImageAuthority,
  value: unknown,
): void {
  requireCondition(isUnknownArray(value) && value.length === 1,
    "CURRENT_ARTIFACT_INSPECTION");
  const image = value[0];
  requireCondition(isRecord(image) && isRecord(image.Descriptor)
    && isRecord(image.Descriptor.annotations) && isRecord(image.RootFS),
  "CURRENT_ARTIFACT_INSPECTION");
  const artifact = authority.artifact;
  requireCondition(image.Id === artifact.manifestDigest
    && image.Descriptor.digest === artifact.manifestDigest,
  "CURRENT_MANIFEST_BINDING");
  requireCondition(image.Descriptor.size === artifact.manifestSize,
    "CURRENT_MANIFEST_SIZE_BINDING");
  requireCondition(
    image.Descriptor.annotations["config.digest"] === artifact.configDigest,
    "CURRENT_CONFIG_BINDING",
  );
  requireCondition(image.Os === "linux" && image.Architecture === "amd64"
    && artifact.platform === PLATFORM, "CURRENT_ARTIFACT_PLATFORM_BINDING");
  requireCondition(image.Size === artifact.imageSize, "CURRENT_IMAGE_SIZE_BINDING");
  requireCondition(Array.isArray(image.RootFS.Layers)
    && image.RootFS.Layers.length === artifact.layerCount
    && JSON.stringify(image.RootFS.Layers) === JSON.stringify(artifact.diffIds),
  "CURRENT_LAYER_BINDING");
}

export function enforceCurrentImageConfiguration(
  value: unknown,
): ImageInspection {
  const inspected = parseImageInspection(value);
  requireCondition(inspected !== null, "IMAGE_INSPECTION");
  requireCondition(inspected.os === "linux", "IMAGE_OS");
  requireCondition(inspected.architecture === "amd64", "IMAGE_ARCHITECTURE");
  requireCondition(inspected.user === "65532:65532", "IMAGE_USER");
  requireCondition(inspected.workdir === "/app", "IMAGE_WORKDIR");
  requireCondition(JSON.stringify(inspected.entrypoint)
    === JSON.stringify(CURRENT_IMAGE_ENTRYPOINT), "IMAGE_ENTRYPOINT");
  requireCondition(inspected.command.length === 0, "IMAGE_DEFAULT_COMMAND");
  requireCondition(inspected.exposedPorts.length === 0, "IMAGE_EXPOSED_PORTS");
  requireCondition(JSON.stringify(inspected.environmentNames)
    === JSON.stringify(CURRENT_ENVIRONMENT_NAMES), "IMAGE_ENVIRONMENT_NAMES");
  requireCondition(JSON.stringify(inspected.labels) === JSON.stringify(CURRENT_IMAGE_LABELS),
    "IMAGE_LABELS");
  return inspected;
}

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
): Omit<ImageInspection, "os" | "architecture"> | null {
  if (!isRecord(value)) return null;
  if (typeof value.User !== "string" || typeof value.WorkingDir !== "string") return null;
  if (!isUnknownArray(value.Entrypoint)) return null;
  const command = optionalUnknownArray(value.Cmd);
  if (!command) return null;
  if (!isStringArray(value.Env)) return null;
  const exposedPorts = optionalRecordKeys(value.ExposedPorts);
  if (!exposedPorts) return null;
  const labels = stringRecord(value.Labels);
  if (!labels) return null;
  return Object.freeze({
    user: value.User,
    workdir: value.WorkingDir,
    entrypoint: Object.freeze([...value.Entrypoint]),
    command,
    exposedPorts,
    environmentNames: Object.freeze(value.Env.map((entry) => entry.split("=", 1)[0] ?? "")),
    labels,
  });
}

function optionalUnknownArray(value: unknown): readonly unknown[] | null {
  if (value === undefined || value === null) return Object.freeze([]);
  return isUnknownArray(value) ? Object.freeze([...value]) : null;
}

function optionalRecordKeys(value: unknown): readonly string[] | null {
  if (value === undefined || value === null) return Object.freeze([]);
  return isRecord(value) ? Object.freeze(Object.keys(value).sort()) : null;
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === "string")) {
    return null;
  }
  return Object.freeze(Object.fromEntries(entries));
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

type RuntimeCaBundleInspection = Readonly<{
  path: string;
  fileUid: number;
  fileGid: number;
  mode: number;
  runtimeUid: number;
  runtimeGid: number;
  regularFile: boolean;
  readable: boolean;
  size: number;
  sha256: string;
  sslCertFile: string | null;
  sslCertDir: string | null;
}>;

type RuntimeInspection = Readonly<{
  proxySha256: string;
  nodeOpenSsl: string;
  runtimeLibrariesPresent: boolean;
  caBundle: RuntimeCaBundleInspection;
  nodeCaCertificateCount: number;
}>;

function isRuntimeCaBundleInspection(
  value: Record<string, unknown>,
): value is Record<string, unknown> & RuntimeCaBundleInspection {
  return [
    typeof value.path === "string",
    isNonnegativeSafeInteger(value.fileUid),
    isNonnegativeSafeInteger(value.fileGid),
    isNonnegativeSafeInteger(value.mode),
    isNonnegativeSafeInteger(value.runtimeUid),
    isNonnegativeSafeInteger(value.runtimeGid),
    typeof value.regularFile === "boolean",
    typeof value.readable === "boolean",
    isNonnegativeSafeInteger(value.size),
    typeof value.sha256 === "string",
    isNullableString(value.sslCertFile),
    isNullableString(value.sslCertDir),
  ].every(Boolean);
}

function parseRuntimeInspection(value: unknown): RuntimeInspection | null {
  if (!isRecord(value)
    || typeof value.proxySha256 !== "string"
    || typeof value.nodeOpenSsl !== "string"
    || typeof value.runtimeLibrariesPresent !== "boolean"
    || !isRecord(value.caBundle)
    || !isRuntimeCaBundleInspection(value.caBundle)
    || !isNonnegativeSafeInteger(value.nodeCaCertificateCount)) return null;
  const caBundle = value.caBundle;
  return Object.freeze({
    proxySha256: value.proxySha256,
    nodeOpenSsl: value.nodeOpenSsl,
    runtimeLibrariesPresent: value.runtimeLibrariesPresent,
    caBundle: Object.freeze({
      path: caBundle.path,
      fileUid: caBundle.fileUid,
      fileGid: caBundle.fileGid,
      mode: caBundle.mode,
      runtimeUid: caBundle.runtimeUid,
      runtimeGid: caBundle.runtimeGid,
      regularFile: caBundle.regularFile,
      readable: caBundle.readable,
      size: caBundle.size,
      sha256: caBundle.sha256,
      sslCertFile: caBundle.sslCertFile,
      sslCertDir: caBundle.sslCertDir,
    }),
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

function requireNonnegativeSafeInteger(value: unknown, code: string): number {
  requireCondition(isNonnegativeSafeInteger(value), code);
  return value;
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
  const verifyExistingImage = process.argv.length === 4
    && process.argv[2] === "--verify-existing-image"
    && process.argv[3] !== undefined;
  if (process.argv.length > 2 && !captureContract && !verifyExistingImage) {
    throw new Error("IMAGE_VERIFIER_ARGUMENT_INVALID");
  }
  try {
    const result = verifyExistingImage
      ? await verifyExistingRefundWorkerImage(process.argv[3] ?? "")
      : await main(captureContract);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const bounded = boundedPrimaryError(error);
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: bounded.message,
    })}\n`);
    process.exitCode = 1;
  }
}
