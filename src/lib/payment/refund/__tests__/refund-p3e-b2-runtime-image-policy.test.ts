import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json";
import {
  DOCKER_INSPECTION_LIMITS,
  FORBIDDEN_CONTENT_PREFIXES,
  FORBIDDEN_EXECUTABLE_NAMES,
  ProofImageOwnership,
  SUPPORTED_IMAGE_STORE_IDENTITY_PROFILES,
  classifyProofImageIdentity,
  createProofImageTag,
  enforceFrozenClosure,
  inspectImageNativeInventories,
  parseDockerImageInspection,
  withProofImageLifecycle,
  type FilesystemInspection,
  type FrozenImageContract,
  type ImageNativeInventory,
  type ProofImageDockerExecutor,
  type RootEntry,
} from "../../../../../scripts/verify-refund-worker-image.mjs";
import { walkRefundP3eRealFiles } from "./refund-p3e-real-filesystem-inventory";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const DOCKERFILE = join(ROOT, "containers/refund-worker/Dockerfile");
const SUPERVISOR = join(
  ROOT,
  "src/lib/payment/refund/refund-worker-container-supervisor.ts",
);
const R2A_DOCUMENT = join(
  ROOT,
  "docs/payment_policy/refund_worker_p3e_b2_runtime_image_connection_v1.md",
);

const EXPECTED_R2A_FILES = Object.freeze([
  ".dockerignore",
  "containers/refund-worker/Dockerfile",
  "containers/refund-worker/README.md",
  "containers/refund-worker/entrypoint.ts",
  "docs/payment_policy/refund_worker_p3e_b2_foundation_authority_v1.md",
  "docs/payment_policy/refund_worker_p3e_b2_runtime_image_connection_v1.md",
  "infra/refund-sandbox/p3e-b2/README.md",
  "infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json",
  "infra/refund-sandbox/p3e-b2/runtime-deferred/README.md",
  "package-lock.json",
  "package.json",
  "scripts/build-refund-worker-bundles.mts",
  "scripts/verify-refund-worker-image.mts",
  "scripts/verify-refund-worker-reproducibility.mts",
  "src/lib/payment/refund/__tests__/refund-p3e-b2-foundation-authority-policy.test.ts",
  "src/lib/payment/refund/__tests__/refund-p3e-b2-runtime-image-policy.test.ts",
  "src/lib/payment/refund/__tests__/refund-p3e-real-filesystem-inventory.ts",
  "src/lib/payment/refund/__tests__/refund-sandbox-provider-free-preflight-environment.test.ts",
  "src/lib/payment/refund/__tests__/refund-worker-container-supervisor.test.ts",
  "src/lib/payment/refund/refund-sandbox-provider-free-preflight-environment.ts",
  "src/lib/payment/refund/refund-worker-container-supervisor.ts",
]);

const EXPECTED_FORBIDDEN_EXECUTABLES = Object.freeze([
  "apt", "apt-cache", "apt-cdrom", "apt-compat", "apt-config",
  "apt-daily-upgrade.timer", "apt-daily.timer", "apt-get", "apt-helper",
  "apt-key", "apt-mark", "aptitude", "ar", "as", "bash", "c++", "c89",
  "c99", "cc", "corepack", "cpp", "curl", "dash", "deb-systemd-helper",
  "deb-systemd-invoke", "dpkg", "dpkg-db-backup", "dpkg-db-backup.timer",
  "dpkg-deb", "dpkg-divert", "dpkg-fsys-usrunmess",
  "dpkg-maintscript-helper", "dpkg-preconfigure", "dpkg-query",
  "dpkg-realpath", "dpkg-reconfigure", "dpkg-split", "dpkg-statoverride",
  "dpkg-trigger", "esbuild", "g++", "gcc", "ld", "make", "nm", "npm",
  "npx", "objcopy", "objdump", "pnpm", "pnpx", "ranlib", "rbash", "sh",
  "strip", "tsc", "tsx", "update-alternatives", "wget", "yarn", "yarnpkg",
]);

const EXPECTED_FORBIDDEN_PREFIXES = Object.freeze([
  "/app/node_modules/esbuild",
  "/app/node_modules/tsx",
  "/app/node_modules/typescript",
  "/opt/yarn",
  "/usr/local/lib/node_modules/corepack",
  "/usr/local/lib/node_modules/npm",
]);

describe("P3E-B2-R2A runtime image and private socket policy", () => {
  it("freezes the exact R2A inventory within the P3E-B2 supersession", () => {
    const r2a = discoverR2aFiles();
    expect(EXPECTED_R2A_FILES).toHaveLength(21);
    expect(new Set(EXPECTED_R2A_FILES).size).toBe(21);
    expect(r2a).toEqual(EXPECTED_R2A_FILES);
    expect(contract.inventory).toEqual({
      r2aChangedPathCount: 21,
      trackedModificationCount: 8,
      untrackedAdditionCount: 13,
    });
    expect(EXPECTED_R2A_FILES).not.toContain("eslint.config.mjs");
    for (const path of r2a) {
      expect(lstatSync(join(ROOT, path)).isSymbolicLink()).toBe(false);
      expect(lstatSync(join(ROOT, path)).isFile()).toBe(true);
    }

    const completeInfra = repositoryRelativeFiles(INFRA);
    expect(completeInfra).toHaveLength(86);
    expect(completeInfra.filter(
      (path) => path ===
        "infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json",
    )).toHaveLength(1);
  });

  it("pins exact Linux AMD64 Node and proxy platform manifests without mutable tags", () => {
    const dockerfile = readFileSync(DOCKERFILE, "utf8");
    expect(contract.platform).toEqual({
      os: "linux",
      architecture: "amd64",
      cloudRunEnvironment: "SECOND_GENERATION",
    });
    expect(contract.node).toMatchObject({
      version: "22.23.1",
      suite: "bookworm-slim",
      linuxAmd64ManifestDigest:
        "sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27",
    });
    expect(contract.cloudSqlAuthProxy).toMatchObject({
      version: "2.22.0",
      linuxAmd64ManifestDigest:
        "sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861",
      embeddedExecutableSha256:
        "12f2c210ef4a60c4284888edbd34c4c9868a2cba5ce26a665ad875aaf980b6fb",
    });
    expect(dockerfile).toContain(
      "node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27",
    );
    expect(dockerfile).toContain(
      "cloud-sql-proxy@sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861",
    );
    expect(dockerfile).not.toMatch(/:(?:latest|22|bookworm-slim)(?:\s|$)/u);
  });

  it("assembles the exact temporary context twice and rejects repository-root authority", () => {
    const ignore = readFileSync(join(ROOT, ".dockerignore"), "utf8");
    const contextBuilder = readFileSync(
      join(ROOT, "scripts/build-refund-worker-bundles.mts"),
      "utf8",
    );
    const imageVerifier = readFileSync(
      join(ROOT, "scripts/verify-refund-worker-image.mts"),
      "utf8",
    );
    const reproducibility = readFileSync(
      join(ROOT, "scripts/verify-refund-worker-reproducibility.mts"),
      "utf8",
    );
    const proof = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/build-refund-worker-bundles.mts", "--verify-context"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          HOME: process.env.HOME,
        },
        timeout: 30_000,
      },
    );
    expect(proof.status).toBe(0);
    expect(proof.stderr).toBe("");
    const observed: unknown = JSON.parse(proof.stdout);
    expect(observed).toMatchObject({
      ok: true,
      manifestDigest: contract.buildContext.expectedManifestSha256,
      fileCount: contract.buildContext.expectedFileCount,
      repositoryGraphInputCount: contract.buildContext.repositoryGraphInputCount,
      packagedGraphInputCount: contract.buildContext.packagedGraphInputCount,
      entrypointCount: 3,
      temporaryContextsRemoved: true,
    });
    expect(isRecordWithStringArray(observed, "paths")).toBe(true);
    if (!isRecordWithStringArray(observed, "paths")) return;
    for (const forbidden of [
      "src/app/", "__tests__/", ".test.", ".spec.", "acceptance",
      ".terraform", ".env", ".git", ".next", "tfstate", "tfplan",
    ]) {
      expect(observed.paths.some((path) => path.includes(forbidden))).toBe(false);
    }
    expect(ignore.trimEnd().endsWith("**")).toBe(true);
    expect(ignore).not.toMatch(/^!/mu);
    expect(contextBuilder).toContain("mkdtemp(join(tmpdir()");
    expect(contextBuilder).toContain("entry.isSymbolicLink()");
    expect(imageVerifier).toContain("context.directory");
    expect(reproducibility).toContain("context.directory");
    expect(imageVerifier).not.toContain('"-f", DOCKERFILE,\n  "."');
    expect(reproducibility).not.toContain('"-f", "containers/refund-worker/Dockerfile",\n    "."');
  });

  it("generates distinct valid collision-resistant proof-image tags", () => {
    const first = createProofImageTag();
    const second = createProofImageTag();
    expect(first).toMatch(
      /^mira-refund-worker:r2a-local-proof-[a-f0-9]{32}$/u,
    );
    expect(second).toMatch(
      /^mira-refund-worker:r2a-local-proof-[a-f0-9]{32}$/u,
    );
    expect(second).not.toBe(first);
  });

  it("parses one valid containerd inspection payload from unknown JSON", () => {
    const parsed = parseDockerImageInspection(JSON.stringify([{
      Id: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      RepoTags: ["mira-refund-worker:r2a-local-proof-test"],
      RepoDigests: [
        `mira-refund-worker@${SYNTHETIC_PROOF_MANIFEST_DIGEST}`,
      ],
    }]));

    expect(parsed).toEqual({
      localStoreImageId: {
        kind: "LOCAL_STORE_IMAGE_ID",
        value: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      },
      repoTags: ["mira-refund-worker:r2a-local-proof-test"],
      repoDigestReferences: [{
        kind: "REPO_DIGEST_REFERENCE",
        value: `mira-refund-worker@${SYNTHETIC_PROOF_MANIFEST_DIGEST}`,
      }],
    });
  });

  it.each([
    ["top-level non-array", JSON.stringify({ Id: SYNTHETIC_PROOF_MANIFEST_DIGEST })],
    ["empty array", JSON.stringify([])],
    ["multiple entries", JSON.stringify([
      { Id: SYNTHETIC_PROOF_MANIFEST_DIGEST },
      { Id: SYNTHETIC_PROOF_MANIFEST_DIGEST },
    ])],
    ["non-object entry", JSON.stringify(["not-an-inspection"])],
    ["missing Id", JSON.stringify([{ RepoDigests: [] }])],
    ["malformed Id", JSON.stringify([{ Id: "sha256:not-a-digest", RepoDigests: [] }])],
    ["malformed RepoTags", JSON.stringify([{
      Id: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      RepoTags: [1],
      RepoDigests: [],
    }])],
    ["malformed RepoDigests shape", JSON.stringify([{
      Id: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      RepoDigests: "not-an-array",
    }])],
    ["malformed RepoDigests entry", JSON.stringify([{
      Id: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      RepoDigests: ["not-a-repository-digest"],
    }])],
  ])("rejects bounded malformed inspection: %s", (_name, payload) => {
    expect(() => parseDockerImageInspection(payload)).toThrow(
      /^IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_/u,
    );
  });

  it("admits empty, null, and absent local repository inventories", () => {
    for (const payload of [
      [{ Id: SYNTHETIC_PROOF_MANIFEST_DIGEST, RepoTags: [], RepoDigests: [] }],
      [{ Id: SYNTHETIC_PROOF_MANIFEST_DIGEST, RepoTags: null, RepoDigests: null }],
      [{ Id: SYNTHETIC_PROOF_MANIFEST_DIGEST }],
    ]) {
      const parsed = parseDockerImageInspection(JSON.stringify(payload));
      expect(parsed.repoTags).toEqual([]);
      expect(parsed.repoDigestReferences).toEqual([]);
    }
  });

  it("never exposes malformed raw inspection input in its bounded error", () => {
    const secret = "TEST_RAW_DOCKER_INSPECTION_SECRET";
    let observed: unknown;
    try {
      parseDockerImageInspection(`{"${secret}":true}`);
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(Error);
    if (!(observed instanceof Error)) return;
    expect(observed.message).toBe(
      "IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_LOCAL_INSPECTION",
    );
    expect(observed.message).not.toContain(secret);
  });

  it("admits valid inspection JSON at the exact raw UTF-8 byte limit", () => {
    const payload = inspectionJsonWithExactByteLength(
      DOCKER_INSPECTION_LIMITS.inspectionJsonMaxBytes,
    );
    expect(Buffer.byteLength(payload, "utf8")).toBe(
      DOCKER_INSPECTION_LIMITS.inspectionJsonMaxBytes,
    );
    expect(parseDockerImageInspection(payload).localStoreImageId.value).toBe(
      SYNTHETIC_PROOF_MANIFEST_DIGEST,
    );
  });

  it("rejects oversized raw bytes before attempting JSON parsing", () => {
    const secret = "TEST_OVERSIZED_INSPECTION_SECRET";
    const payload = `${secret}${"x".repeat(
      DOCKER_INSPECTION_LIMITS.inspectionJsonMaxBytes,
    )}`;
    expect(Buffer.byteLength(payload, "utf8")).toBeGreaterThan(
      DOCKER_INSPECTION_LIMITS.inspectionJsonMaxBytes,
    );
    let observed: unknown;
    try {
      parseDockerImageInspection(payload);
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(Error);
    if (!(observed instanceof Error)) return;
    expect(observed.message).toBe(
      "IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_INSPECTION_JSON_TOO_LARGE",
    );
    expect(observed.message).not.toContain(secret);
  });

  it("admits RepoTags at the exact cardinality limit", () => {
    const repoTags = Array.from(
      { length: DOCKER_INSPECTION_LIMITS.repoTagMaxCount },
      (_, index) => `mira-refund-worker:r2a-${index}`,
    );
    const parsed = parseDockerImageInspection(inspectionJson({ repoTags }));
    expect(parsed.repoTags).toEqual(repoTags);
  });

  it("rejects RepoTags above the cardinality limit before entry validation", () => {
    const repoTags = Array.from(
      { length: DOCKER_INSPECTION_LIMITS.repoTagMaxCount + 1 },
      () => 1,
    );
    expect(() => parseDockerImageInspection(inspectionJson({ repoTags })))
      .toThrow(
        "IMAGE_VERIFICATION_FAILED:"
          + "PROOF_IMAGE_REPO_TAG_INVENTORY_TOO_LARGE",
      );
  });

  it("admits RepoDigests at the exact cardinality limit", () => {
    const repoDigests = Array.from(
      { length: DOCKER_INSPECTION_LIMITS.repoDigestMaxCount },
      (_, index) => `mira-refund-worker-${index}@${SYNTHETIC_PROOF_MANIFEST_DIGEST}`,
    );
    const parsed = parseDockerImageInspection(
      inspectionJson({ repoDigests }),
    );
    expect(parsed.repoDigestReferences.map((entry) => entry.value)).toEqual(
      repoDigests,
    );
  });

  it("rejects RepoDigests above the cardinality limit before entry validation", () => {
    const repoDigests = Array.from(
      { length: DOCKER_INSPECTION_LIMITS.repoDigestMaxCount + 1 },
      () => 1,
    );
    expect(() => parseDockerImageInspection(inspectionJson({ repoDigests })))
      .toThrow(
        "IMAGE_VERIFICATION_FAILED:"
          + "PROOF_IMAGE_REPO_DIGEST_INVENTORY_TOO_LARGE",
      );
  });

  it("bounds each RepoTag by UTF-8 bytes without disclosing it", () => {
    const admitted = "é".repeat(DOCKER_INSPECTION_LIMITS.repoTagMaxBytes / 2);
    expect(Buffer.byteLength(admitted, "utf8")).toBe(
      DOCKER_INSPECTION_LIMITS.repoTagMaxBytes,
    );
    expect(parseDockerImageInspection(
      inspectionJson({ repoTags: [admitted] }),
    ).repoTags).toEqual([admitted]);

    const secret = "TEST_OVERLONG_REPO_TAG_SECRET";
    const rejected = `${secret}${"é".repeat(
      DOCKER_INSPECTION_LIMITS.repoTagMaxBytes / 2,
    )}`;
    expect(rejected.length).toBeLessThan(
      DOCKER_INSPECTION_LIMITS.repoTagMaxBytes,
    );
    let observed: unknown;
    try {
      parseDockerImageInspection(inspectionJson({ repoTags: [rejected] }));
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(Error);
    if (!(observed instanceof Error)) return;
    expect(observed.message).toBe(
      "IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_REPO_TAG_TOO_LONG",
    );
    expect(observed.message).not.toContain(secret);
  });

  it("rejects an over-limit syntactically valid RepoDigest before syntax work", () => {
    const repoDigest = repoDigestWithExactByteLength(
      DOCKER_INSPECTION_LIMITS.repoDigestMaxBytes + 1,
    );
    expect(() => parseDockerImageInspection(
      inspectionJson({ repoDigests: [repoDigest] }),
    )).toThrow(
      "IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_REPO_DIGEST_TOO_LONG",
    );
  });

  it("rejects the prior million-byte valid RepoDigest at the raw boundary", () => {
    const repoDigest = repoDigestWithExactByteLength(1_000_072);
    const payload = inspectionJson({ repoDigests: [repoDigest] });
    expect(Buffer.byteLength(payload, "utf8")).toBeGreaterThan(
      DOCKER_INSPECTION_LIMITS.inspectionJsonMaxBytes,
    );
    expect(() => parseDockerImageInspection(payload)).toThrow(
      "IMAGE_VERIFICATION_FAILED:PROOF_IMAGE_INSPECTION_JSON_TOO_LARGE",
    );
  });

  it("admits the exact aggregate boundary and rejects one byte above it", () => {
    const repoTags = Array.from(
      { length: DOCKER_INSPECTION_LIMITS.repoTagMaxCount },
      () => "t".repeat(DOCKER_INSPECTION_LIMITS.repoTagMaxBytes),
    );
    const maxRepoDigest = repoDigestWithExactByteLength(
      DOCKER_INSPECTION_LIMITS.repoDigestMaxBytes,
    );
    const repoDigests = Array.from(
      { length: DOCKER_INSPECTION_LIMITS.repoDigestMaxCount },
      () => maxRepoDigest,
    );
    const admitted = parseDockerImageInspection(
      inspectionJson({ repoTags, repoDigests }),
    );
    expect(admitted.repoTags).toHaveLength(
      DOCKER_INSPECTION_LIMITS.repoTagMaxCount,
    );
    expect(admitted.repoDigestReferences).toHaveLength(
      DOCKER_INSPECTION_LIMITS.repoDigestMaxCount,
    );

    const oneByteOver = [
      ...repoDigests.slice(0, -1),
      repoDigestWithExactByteLength(
        DOCKER_INSPECTION_LIMITS.repoDigestMaxBytes + 1,
      ),
    ];
    expect(() => parseDockerImageInspection(
      inspectionJson({ repoTags, repoDigests: oneByteOver }),
    )).toThrow(
      "IMAGE_VERIFICATION_FAILED:"
        + "PROOF_IMAGE_REPOSITORY_REFERENCES_TOO_LARGE",
    );
  });

  it("accepts the explicit Docker Desktop containerd manifest-ID profile", () => {
    const tag = createProofImageTag(() => "1".repeat(32));
    const identity = classifyProofImageIdentity(
      syntheticProofIdentityInput(tag),
    );

    expect(identity).toEqual({
      iidfileImageId: {
        kind: "LOCAL_STORE_IMAGE_ID",
        value: SYNTHETIC_PROOF_CONFIG_DIGEST,
      },
      configDigest: {
        kind: "CONFIG_DIGEST",
        value: SYNTHETIC_PROOF_CONFIG_DIGEST,
      },
      manifestDigest: {
        kind: "MANIFEST_DIGEST",
        value: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      },
      manifestDescriptorDigest: {
        kind: "MANIFEST_DESCRIPTOR_DIGEST",
        value: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      },
      manifestDescriptorMediaType:
        "application/vnd.docker.distribution.manifest.v2+json",
      manifestDescriptorSize: 498,
      localStoreImageId: {
        kind: "LOCAL_STORE_IMAGE_ID",
        value: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      },
      tagReference: {
        kind: "TAG_REFERENCE",
        value: tag,
      },
      repoDigestReferences: [{
        kind: "REPO_DIGEST_REFERENCE",
        value: `mira-refund-worker@${SYNTHETIC_PROOF_MANIFEST_DIGEST}`,
      }],
      imageStoreIdentityProfile:
        "DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID",
    });
    expect(identity.configDigest.value).not.toBe(identity.manifestDigest.value);
  });

  it.each([
    {
      name: "iidfile/config mismatch",
      options: { iidfile: SYNTHETIC_PROOF_OTHER_DIGEST },
    },
    {
      name: "manifest/descriptor mismatch",
      options: { descriptor: SYNTHETIC_PROOF_OTHER_DIGEST },
    },
    {
      name: "local store ID/manifest mismatch",
      options: { localStoreImageId: SYNTHETIC_PROOF_OTHER_DIGEST },
    },
    {
      name: "config equal to manifest",
      options: {
        iidfile: SYNTHETIC_PROOF_MANIFEST_DIGEST,
        config: SYNTHETIC_PROOF_MANIFEST_DIGEST,
      },
    },
    {
      name: "RepoDigest references another manifest",
      options: {
        repoDigests: [
          `mira-refund-worker@${SYNTHETIC_PROOF_OTHER_DIGEST}`,
        ],
      },
    },
    {
      name: "config and manifest fields swapped",
      options: {
        config: SYNTHETIC_PROOF_MANIFEST_DIGEST,
        manifest: SYNTHETIC_PROOF_CONFIG_DIGEST,
        descriptor: SYNTHETIC_PROOF_CONFIG_DIGEST,
      },
    },
    {
      name: "unsupported equality relationship",
      options: {
        localStoreImageId: SYNTHETIC_PROOF_CONFIG_DIGEST,
      },
    },
  ])("fails closed for $name", ({ options }) => {
    const tag = createProofImageTag(() => "2".repeat(32));
    expect(() => classifyProofImageIdentity(
      syntheticProofIdentityInput(tag, options),
    )).toThrow("LOCAL_IMAGE_STORE_IDENTITY_PROFILE_UNSUPPORTED");
  });

  it("accepts an empty RepoDigests array for the containerd profile", () => {
    const tag = createProofImageTag(() => "3".repeat(32));
    const identity = classifyProofImageIdentity(
      syntheticProofIdentityInput(tag, { repoDigests: [] }),
    );

    expect(identity.repoDigestReferences).toEqual([]);
    expect(identity.imageStoreIdentityProfile).toBe(
      "DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID",
    );
  });

  it("fails closed when more than one identity profile matches", () => {
    const tag = createProofImageTag(() => "4".repeat(32));
    const profile = SUPPORTED_IMAGE_STORE_IDENTITY_PROFILES[0];
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    expect(() => classifyProofImageIdentity(
      syntheticProofIdentityInput(tag),
      [profile, profile],
    )).toThrow("LOCAL_IMAGE_STORE_IDENTITY_PROFILE_UNSUPPORTED");
  });

  it("rejects a pre-existing proof-image tag before admitting a build", async () => {
    const tag = createProofImageTag(() => "a".repeat(32));
    const fake = createFakeProofDocker();
    installSyntheticProofImage(fake.tags, tag);
    const ownership = new ProofImageOwnership(tag, fake.execute);
    let operationCount = 0;
    let artifactCleanupCount = 0;

    await expect(withProofImageLifecycle(
      ownership,
      () => {
        operationCount += 1;
        return "MUST_NOT_RUN";
      },
      () => {
        artifactCleanupCount += 1;
      },
    )).rejects.toThrow("PROOF_IMAGE_TAG_COLLISION");

    expect(operationCount).toBe(0);
    expect(artifactCleanupCount).toBe(1);
    expect(fake.tags.has(tag)).toBe(true);
    expect(fake.commands).not.toContainEqual(["image", "rm", tag]);
  });

  it("removes the exact invocation-owned tag and container after success", async () => {
    const tag = createProofImageTag(() => "b".repeat(32));
    const fake = createFakeProofDocker();
    const ownership = new ProofImageOwnership(tag, fake.execute);
    let artifactCleanupCount = 0;

    const result = await withProofImageLifecycle(
      ownership,
      (proof) => {
        installSyntheticProofImage(fake.tags, proof.tag);
        proof.recordSuccessfulBuild();
        proof.recordCreatedImageIdentity(
          `${SYNTHETIC_PROOF_CONFIG_DIGEST}\n`,
          syntheticProofMetadata(),
        );
        fake.containers.set(proof.nextContainerName(), false);
        return "VERIFIED";
      },
      () => {
        artifactCleanupCount += 1;
      },
    );

    expect(result.value).toBe("VERIFIED");
    expect(result.identity.imageStoreIdentityProfile).toBe(
      "DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID",
    );
    expect(result.identity.localStoreImageId.value).toBe(
      SYNTHETIC_PROOF_MANIFEST_DIGEST,
    );
    expect(artifactCleanupCount).toBe(1);
    expect(fake.tags.has(tag)).toBe(false);
    expect(fake.containers.size).toBe(0);
    expect(fake.commands).toContainEqual(["image", "rm", tag]);
    expect(fake.commands).not.toContainEqual([
      "image", "rm", SYNTHETIC_PROOF_MANIFEST_DIGEST,
    ]);
  });

  it("removes the exact invocation-owned state after a post-build failure", async () => {
    const tag = createProofImageTag(() => "c".repeat(32));
    const fake = createFakeProofDocker();
    const ownership = new ProofImageOwnership(tag, fake.execute);
    let artifactCleanupCount = 0;

    await expect(withProofImageLifecycle(
      ownership,
      (proof) => {
        installSyntheticProofImage(fake.tags, proof.tag);
        proof.recordSuccessfulBuild();
        proof.recordCreatedImageIdentity(
          SYNTHETIC_PROOF_CONFIG_DIGEST,
          syntheticProofMetadata(),
        );
        fake.containers.set(proof.nextContainerName(), true);
        throw new Error("TEST_POST_BUILD_FAILURE_SECRET");
      },
      () => {
        artifactCleanupCount += 1;
      },
    )).rejects.toThrow("IMAGE_VERIFICATION_FAILED:UNEXPECTED");

    expect(artifactCleanupCount).toBe(1);
    expect(fake.tags.has(tag)).toBe(false);
    expect(fake.containers.size).toBe(0);
    expect(fake.commands.some(
      (command) => command[0] === "container" && command[1] === "stop",
    )).toBe(true);
    expect(fake.commands).toContainEqual(["image", "rm", tag]);
  });

  it("prevents success when exact proof-image cleanup fails", async () => {
    const tag = createProofImageTag(() => "d".repeat(32));
    const fake = createFakeProofDocker({ failImageRemoval: true });
    const ownership = new ProofImageOwnership(tag, fake.execute);
    let artifactCleanupCount = 0;

    await expect(withProofImageLifecycle(
      ownership,
      (proof) => {
        installSyntheticProofImage(fake.tags, proof.tag);
        proof.recordSuccessfulBuild();
        proof.recordCreatedImageIdentity(
          SYNTHETIC_PROOF_CONFIG_DIGEST,
          syntheticProofMetadata(),
        );
        return "MUST_NOT_SUCCEED";
      },
      () => {
        artifactCleanupCount += 1;
      },
    )).rejects.toThrow("LOCAL_PROOF_IMAGE_CLEANUP_FAILED");

    expect(artifactCleanupCount).toBe(1);
    expect(fake.tags.has(tag)).toBe(true);
  });

  it("uses no raw-ID deletion, broad prune, force removal, or unrelated target", async () => {
    const tag = createProofImageTag(() => "e".repeat(32));
    const fake = createFakeProofDocker();
    const ownership = new ProofImageOwnership(tag, fake.execute);

    await withProofImageLifecycle(
      ownership,
      (proof) => {
        installSyntheticProofImage(fake.tags, proof.tag);
        proof.recordSuccessfulBuild();
        proof.recordCreatedImageIdentity(
          SYNTHETIC_PROOF_CONFIG_DIGEST,
          syntheticProofMetadata(),
        );
        return "VERIFIED";
      },
      () => undefined,
    );

    const removals = fake.commands.filter(
      (command) => command[0] === "image" && command[1] === "rm",
    );
    expect(removals).toEqual([["image", "rm", tag]]);
    expect(fake.commands.flat()).not.toContain("--force");
    expect(fake.commands.flat()).not.toContain("prune");
    expect(fake.commands.flat()).not.toContain(
      SYNTHETIC_PROOF_MANIFEST_DIGEST,
    );
  });

  it("freezes collision-safe proof-image cleanup across contract and documentation", () => {
    const documentation = readFileSync(R2A_DOCUMENT, "utf8");
    const containerReadme = readFileSync(
      join(ROOT, "containers/refund-worker/README.md"),
      "utf8",
    );
    expect(contract.proofImageLifecycle).toEqual({
      proofImageTagStrategy: "COLLISION_SAFE_PER_INVOCATION",
      preexistingTagPolicy: "FAIL_WITHOUT_OVERWRITE",
      cleanupTarget: "EXACT_INVOCATION_TAG_ONLY",
      cleanupOnOrderlySuccessAndFailure: "REQUIRED",
      removeByRawImageId: "FORBIDDEN",
      broadDockerPrune: "FORBIDDEN",
      cleanupFailurePreventsSuccess: true,
    });
    expect(contract.proofImageIdentity).toEqual({
      localImageStoreIdentityProfile:
        "DOCKER_DESKTOP_CONTAINERD_MANIFEST_ID",
      configAuthority: "IIDFILE_EQUALS_CONTAINERIMAGE_CONFIG_DIGEST",
      manifestAuthority:
        "CONTAINERIMAGE_DIGEST_EQUALS_DESCRIPTOR_DIGEST",
      localStoreBinding: "LOCAL_IMAGE_ID_EQUALS_MANIFEST_DIGEST",
      configManifestEquality: "FORBIDDEN",
      tagOwnership:
        "UNIQUE_ABSENT_BEFORE_BUILD_PLUS_EXACT_PROFILE_MATCH",
      unknownProfilePolicy: "FAIL_CLOSED",
    });
    for (const text of [documentation, containerReadme]) {
      const normalized = text.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("collision-safe");
      expect(normalized).toContain("raw image id");
      expect(normalized).toContain("cleanup failure");
      expect(normalized).toContain(
        "docker_desktop_containerd_manifest_id".toLowerCase(),
      );
      expect(normalized).toContain("fail closed");
    }
  });

  it("freezes one inspection-bound authority across production, contract, and docs", () => {
    const documentation = readFileSync(R2A_DOCUMENT, "utf8");
    const containerReadme = readFileSync(
      join(ROOT, "containers/refund-worker/README.md"),
      "utf8",
    );
    const serializedLimits = JSON.stringify(
      DOCKER_INSPECTION_LIMITS,
      null,
      2,
    );

    expect(contract.proofImageInspectionBounds).toEqual(
      DOCKER_INSPECTION_LIMITS,
    );
    for (const text of [documentation, containerReadme]) {
      expect(text).toContain(serializedLimits);
      expect(text).toContain("UTF-8 bytes");
    }
  });

  it("removes package managers, mutation tools, compilers, and shells from runtime", () => {
    const dockerfile = readFileSync(DOCKERFILE, "utf8");
    const documentation = readFileSync(R2A_DOCUMENT, "utf8");
    expect(dockerfile).toContain("USER 65532:65532");
    expect(dockerfile).toContain("CMD []");
    expect(dockerfile).toContain(
      "rm -f /bin/sh /bin/dash /bin/bash /usr/bin/sh /usr/bin/dash /usr/bin/bash",
    );
    expect(dockerfile).toContain("rm -f /usr/local/bin/npm /usr/local/bin/npx");
    expect(dockerfile).toContain("/usr/local/lib/node_modules/corepack");
    expect(dockerfile).toContain("/opt/yarn*");
    expect(dockerfile).toContain("rm -rf /usr/lib/apt /usr/lib/dpkg");
    expect(dockerfile).not.toMatch(/(?:GOOGLE_APPLICATION_CREDENTIALS|TOSS_SECRET_KEY|password=)/u);
    expect(new Set(EXPECTED_FORBIDDEN_EXECUTABLES).size).toBe(61);
    expect([...EXPECTED_FORBIDDEN_EXECUTABLES].sort()).toEqual(
      EXPECTED_FORBIDDEN_EXECUTABLES,
    );
    expect(contract.forbiddenRuntimeExecutables).toEqual(
      EXPECTED_FORBIDDEN_EXECUTABLES,
    );
    expect(FORBIDDEN_EXECUTABLE_NAMES).toEqual(EXPECTED_FORBIDDEN_EXECUTABLES);
    expect(contract.forbiddenRuntimePathPrefixes).toEqual(
      EXPECTED_FORBIDDEN_PREFIXES,
    );
    expect(FORBIDDEN_CONTENT_PREFIXES).toEqual(EXPECTED_FORBIDDEN_PREFIXES);
    expect(documentation).toContain(JSON.stringify(EXPECTED_FORBIDDEN_EXECUTABLES));
    expect(documentation).toContain(JSON.stringify(EXPECTED_FORBIDDEN_PREFIXES));
  });

  it("uses image-native metadata and rejects host-extraction ownership authority", () => {
    const source = readFileSync(
      join(ROOT, "scripts/verify-refund-worker-image.mts"),
      "utf8",
    );
    expect(contract.filesystemInspection).toMatchObject({
      ownershipAuthority: "IMAGE_NATIVE_NOT_HOST_EXTRACTION",
      baseComparison: "BIDIRECTIONAL",
      hostExtractionUidGidAccepted: false,
    });
    expect(source).toContain('const IMAGE_NATIVE_AUTHORITY = "IMAGE_NATIVE_CONTAINER_LSTAT"');
    expect(source).toContain('"--network", "none"');
    expect(source).toContain('"--read-only", "--user", "0:0"');
    expect(source).toContain("fs.lstatSync(path)");
    expect(source).not.toContain("--no-same-owner");
    expect(source).not.toContain("inspectExportedRootFilesystem");
    expect(source).not.toContain("--inspect-root-fixture");
  });

  it("keeps metadata hashes independent of host UID, GID, extraction, and umask", () => {
    const base = syntheticBaseInventory();
    const runtime = syntheticRuntimeInventory();
    const originalUmask = process.umask();
    try {
      process.umask(0o077);
      const restrictive = inspectImageNativeInventories(runtime, base);
      process.umask(0o002);
      const permissive = inspectImageNativeInventories(runtime, base);
      expect(permissive).toEqual(restrictive);
      expect(permissive.applicationMetadataManifestSha256).toMatch(/^[a-f0-9]{64}$/u);
    } finally {
      process.umask(originalUmask);
    }
    const hostExtraction = syntheticRuntimeInventory({
      "/app": { uid: 501, gid: 20 },
      "/app/synthetic-bundle.mjs": { uid: 501, gid: 20 },
    }, "HOST_EXTRACTED_LSTAT");
    expect(() => inspectImageNativeInventories(hostExtraction, base)).toThrow(
      "RUNTIME_METADATA_AUTHORITY",
    );
  });

  it("classifies base removals, runtime additions, and retained metadata changes bidirectionally", () => {
    const base = syntheticBaseInventory();
    const runtime = syntheticRuntimeInventory();
    const observed = inspectImageNativeInventories(runtime, base);
    expect(observed.reviewedRemovalCount).toBe(1);
    expect(observed.reviewedRuntimeAdditionCount).toBe(5);
    expect(observed.reviewedChangedEntryCount).toBe(1);

    const restoredBasePath = syntheticRuntimeInventory({
      "/usr/lib/synthetic-removed": {
        type: "REGULAR_FILE",
        mode: 0o644,
        uid: 0,
        gid: 0,
        sha256: "1".repeat(64),
      },
    });
    const removalChanged = inspectImageNativeInventories(restoredBasePath, base);
    expect(removalChanged.reviewedRemovalCount).toBe(0);
    expect(removalChanged.removedPathManifestSha256).not.toBe(
      observed.removedPathManifestSha256,
    );

    const unexpectedAddition = syntheticRuntimeInventory({
      "/srv/unapproved-daemon": {
        type: "REGULAR_FILE",
        mode: 0o755,
        uid: 0,
        gid: 0,
        sha256: "2".repeat(64),
      },
    });
    const additionChanged = inspectImageNativeInventories(unexpectedAddition, base);
    expect(additionChanged.reviewedRuntimeAdditionCount).toBe(
      observed.reviewedRuntimeAdditionCount + 1,
    );
    expect(additionChanged.addedMetadataContentManifestSha256).not.toBe(
      observed.addedMetadataContentManifestSha256,
    );

  });

  it("rejects an otherwise-identical UID-only image-native mutation", () => {
    const base = syntheticBaseInventory();
    const baselineRuntime = syntheticRuntimeInventory();
    const baselineEntry = runtimeEntryAt(baselineRuntime, "/usr/lib");
    const baseline = inspectImageNativeInventories(baselineRuntime, base);
    const frozen = frozenClosureFrom(baseline);
    expect(() => enforceFrozenClosure(baseline, frozen)).not.toThrow();

    const mutatedRuntime = syntheticRuntimeInventory({
      "/usr/lib": { uid: 1 },
    });
    const mutatedEntry = runtimeEntryAt(mutatedRuntime, "/usr/lib");
    const mutated = inspectImageNativeInventories(mutatedRuntime, base);
    expect(baselineEntry.uid).toBe(0);
    expect(mutatedEntry.uid).toBe(1);
    expect(baselineEntry.gid).toBe(0);
    expect(mutatedEntry.gid).toBe(0);
    expectOnlyEntryFieldChanged(baselineEntry, mutatedEntry, "uid");
    expect(mutated.changedMetadataContentManifestSha256).not.toBe(
      baseline.changedMetadataContentManifestSha256,
    );
    expect(() => enforceFrozenClosure(mutated, frozen)).toThrow(
      "SYSTEM_CHANGED_COUNT",
    );
  });

  it("rejects an otherwise-identical same-path type-only image-native mutation", () => {
    const base = syntheticBaseInventory();
    const baselineRuntime = syntheticRuntimeInventory();
    const baselineEntry = runtimeEntryAt(baselineRuntime, "/usr/lib");
    const baseline = inspectImageNativeInventories(baselineRuntime, base);
    const frozen = frozenClosureFrom(baseline);
    expect(() => enforceFrozenClosure(baseline, frozen)).not.toThrow();

    const mutatedEntry: RootEntry = Object.freeze({
      ...baselineEntry,
      type: "REGULAR_FILE",
    });
    const mutatedRuntime = replaceRuntimeEntry(
      baselineRuntime,
      "/usr/lib",
      mutatedEntry,
    );
    const mutated = inspectImageNativeInventories(mutatedRuntime, base);
    expect(baselineEntry.type).toBe("DIRECTORY");
    expect(mutatedEntry.type).toBe("REGULAR_FILE");
    expectOnlyEntryFieldChanged(baselineEntry, mutatedEntry, "type");
    expect(mutated.changedMetadataContentManifestSha256).not.toBe(
      baseline.changedMetadataContentManifestSha256,
    );
    expect(() => enforceFrozenClosure(mutated, frozen)).toThrow(
      "SYSTEM_CHANGED_COUNT",
    );
  });

  it("rejects an otherwise-identical GID-only image-native mutation", () => {
    const base = syntheticBaseInventory();
    const baselineRuntime = syntheticRuntimeInventory();
    const baseline = inspectImageNativeInventories(baselineRuntime, base);
    const frozen = frozenClosureFrom(baseline);
    expect(() => enforceFrozenClosure(baseline, frozen)).not.toThrow();

    const mutatedRuntime = syntheticRuntimeInventory({
      "/usr/lib": { gid: 1 },
    });
    const mutated = inspectImageNativeInventories(mutatedRuntime, base);
    expectOnlyEntryFieldChanged(
      runtimeEntryAt(baselineRuntime, "/usr/lib"),
      runtimeEntryAt(mutatedRuntime, "/usr/lib"),
      "gid",
    );
    expect(mutated.changedMetadataContentManifestSha256).not.toBe(
      baseline.changedMetadataContentManifestSha256,
    );
    expect(() => enforceFrozenClosure(mutated, frozen)).toThrow(
      "SYSTEM_CHANGED_COUNT",
    );
  });

  it("rejects an otherwise-identical mode-only image-native mutation", () => {
    const base = syntheticBaseInventory();
    const baselineRuntime = syntheticRuntimeInventory();
    const baseline = inspectImageNativeInventories(baselineRuntime, base);
    const frozen = frozenClosureFrom(baseline);
    expect(() => enforceFrozenClosure(baseline, frozen)).not.toThrow();

    const mutatedRuntime = syntheticRuntimeInventory({
      "/usr/lib": { mode: 0o555 },
    });
    const mutated = inspectImageNativeInventories(mutatedRuntime, base);
    expectOnlyEntryFieldChanged(
      runtimeEntryAt(baselineRuntime, "/usr/lib"),
      runtimeEntryAt(mutatedRuntime, "/usr/lib"),
      "mode",
    );
    expect(mutated.changedMetadataContentManifestSha256).not.toBe(
      baseline.changedMetadataContentManifestSha256,
    );
    expect(() => enforceFrozenClosure(mutated, frozen)).toThrow(
      "SYSTEM_CHANGED_COUNT",
    );
  });

  it("rejects an otherwise-identical symlink-target-only image-native mutation", () => {
    const base = syntheticBaseInventory();
    const baselineRuntime = syntheticRuntimeInventory();
    const baseline = inspectImageNativeInventories(baselineRuntime, base);
    const frozen = frozenClosureFrom(baseline);
    expect(() => enforceFrozenClosure(baseline, frozen)).not.toThrow();

    const mutatedRuntime = syntheticRuntimeInventory({
      "/usr/local/bin/node-link": {
        symlinkTarget: "/usr/local/bin/cloud-sql-proxy",
      },
    });
    const mutated = inspectImageNativeInventories(mutatedRuntime, base);
    expectOnlyEntryFieldChanged(
      runtimeEntryAt(baselineRuntime, "/usr/local/bin/node-link"),
      runtimeEntryAt(mutatedRuntime, "/usr/local/bin/node-link"),
      "symlinkTarget",
    );
    expect(mutated.changedMetadataContentManifestSha256).not.toBe(
      baseline.changedMetadataContentManifestSha256,
    );
    expect(() => enforceFrozenClosure(mutated, frozen)).toThrow(
      "SYSTEM_CHANGED_COUNT",
    );
  });

  it("rejects an otherwise-identical same-path content-SHA-only mutation", () => {
    const base = syntheticBaseInventory();
    const baselineRuntime = syntheticRuntimeInventory();
    const baseline = inspectImageNativeInventories(baselineRuntime, base);
    const frozen = frozenClosureFrom(baseline);
    expect(() => enforceFrozenClosure(baseline, frozen)).not.toThrow();

    const mutatedRuntime = syntheticRuntimeInventory({
      "/app/synthetic-bundle.mjs": { sha256: "8".repeat(64) },
    });
    const mutated = inspectImageNativeInventories(mutatedRuntime, base);
    expectOnlyEntryFieldChanged(
      runtimeEntryAt(baselineRuntime, "/app/synthetic-bundle.mjs"),
      runtimeEntryAt(mutatedRuntime, "/app/synthetic-bundle.mjs"),
      "sha256",
    );
    expect(mutated.applicationMetadataManifestSha256).toBe(
      baseline.applicationMetadataManifestSha256,
    );
    expect(mutated.applicationContentManifestSha256).not.toBe(
      baseline.applicationContentManifestSha256,
    );
    expect(() => enforceFrozenClosure(mutated, frozen)).toThrow(
      "SYSTEM_ADDITION_MANIFEST",
    );
    expect(() => enforceFrozenClosure(
      mutated,
      frozenClosureFrom(mutated, {
        contentManifestSha256: baseline.applicationContentManifestSha256,
      }),
    )).toThrow("APPLICATION_CONTENT_MANIFEST");
  });

  it("finds executable files and symlink aliases from the exact forbidden key set", () => {
    const base = syntheticBaseInventory();
    const runtime = syntheticRuntimeInventory({
      "/srv/tools/npm": {
        type: "REGULAR_FILE",
        mode: 0o755,
        uid: 0,
        gid: 0,
        sha256: "3".repeat(64),
      },
      "/srv/tools/sh": {
        type: "SYMLINK",
        mode: 0o777,
        uid: 0,
        gid: 0,
        symlinkTarget: "/missing/dash",
      },
    });
    const result = inspectImageNativeInventories(runtime, base);
    expect(result.forbiddenExecutableCount).toBe(2);
    expect(result.forbiddenExecutablePathSample).toEqual([
      "/srv/tools/npm",
      "/srv/tools/sh",
    ]);
  });

  it("freezes complete-root and exact application closure authority", () => {
    expect(contract.filesystemInspection).toEqual({
      ownershipAuthority: "IMAGE_NATIVE_NOT_HOST_EXTRACTION",
      scope: "COMPLETE_ROOT_FILESYSTEM",
      applicationRoot: "/app",
      systemClosureAuthority:
        "PINNED_BASE_PLUS_EXACT_REVIEWED_DELTAS",
      baseComparison: "BIDIRECTIONAL",
      hostExtractionUidGidAccepted: false,
      unexpectedEntryPolicy: "FAIL_CLOSED",
      symlinkPolicy: "INSPECT_LSTAT_BEFORE_TARGET",
      forbiddenContentCountScope: "COMPLETE_ROOT_FILESYSTEM",
      virtualRuntimeMountContents: "EXCLUDED_FROM_IMAGE_LAYER_INVENTORY",
    });
    expect(contract.applicationClosure.authority).toBe(
      "EXACT_IMAGE_NATIVE_METADATA_AND_CONTENT_MANIFEST",
    );
    expect(contract.applicationClosure).toEqual({
      authority: "EXACT_IMAGE_NATIVE_METADATA_AND_CONTENT_MANIFEST",
      entryCount: 172,
      metadataManifestSha256:
        "eec172e4f230c8e3508bbbaca9b07ccbea22f3462c63208bd5b955afad2bb6c8",
      contentManifestSha256:
        "4106d370ff1aa41f03f498619046951e32ff4981018d3f872a78560a2885def4",
    });
    expect(contract.systemClosure).toMatchObject({
      classificationVersion: "PINNED_NODE_BASE_DELTA_V1",
      removedEntryCount: 2620,
      removedPathManifestSha256:
        "fcbac8b41543fafd754b035b3c8a3dc93e605f3f7cd1d050b31640b6d87a7bab",
      changedEntryCount: 3,
      changedMetadataContentManifestSha256:
        "d9ea3c2e8982ba4189f03173dfeb4f914d1350d4715e77daede4f96d639f33da",
      addedEntryCount: 175,
      addedMetadataContentManifestSha256:
        "e7af7552b4079387ef2d4de8c754c089c9289b196301d48ffdb80372e9a3dd49",
    });
    expect(contract.systemClosure.removalCategories).toEqual([
      {
        code: "APT_DPKG_EXECUTABLE_METADATA_AND_SCHEDULER_SURFACE",
        entryCount: 73,
      },
      {
        code: "NODE_PACKAGE_MANAGER_PACKAGE_CACHE_AND_SHIM_SURFACE",
        entryCount: 2542,
      },
      { code: "INTERACTIVE_SHELL_SURFACE", entryCount: 4 },
      { code: "PACKAGE_SIGNATURE_VERIFIER_SURFACE", entryCount: 1 },
    ]);
    expect(contract.systemClosure.additionCategories).toEqual([
      { code: "EXACT_APPLICATION_CLOSURE", entryCount: 172 },
      { code: "RUNTIME_USER_WRITABLE_DIRECTORIES", entryCount: 2 },
      { code: "VERIFIED_CLOUD_SQL_PROXY_EXECUTABLE", entryCount: 1 },
    ]);
  });

  it("freezes exact commands, no default work, task constraints, and socket binding", () => {
    const source = readFileSync(SUPERVISOR, "utf8");
    expect(contract.commands).toEqual([
      "image-self-check",
      "sandbox-preflight",
      "worker-check",
      "worker-health",
      "worker-once",
    ]);
    expect(contract.defaultCommand).toBe("NONE_FAIL_CLOSED");
    expect(contract.cloudRunTask).toMatchObject({
      taskCount: 1,
      taskIndex: 0,
      taskAttempt: 0,
      callerSuppliedOwnerLabels: "FORBIDDEN",
    });
    expect(contract.connection).toMatchObject({
      networkMode: "DIRECT_VPC_EGRESS",
      egressMode: "PRIVATE_RANGES_ONLY",
      socketRoot: "/cloudsql",
      region: "asia-northeast3",
      instanceConnectionNameEnvironmentKey:
        "REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME",
      committedSubnetCidr: "10.74.0.0/24",
      directVpcMinimumSubnetPrefix: 26,
    });
    expect(source).toContain("parseCanonicalRefundCloudSqlDatabaseUrl");
    expect(source).toContain("database.instanceConnectionName !== instance");
  });

  it("freezes the exact proxy vector and rejects every mutable authority channel", () => {
    const source = readFileSync(SUPERVISOR, "utf8");
    expect(contract.proxyInvocation.arguments).toEqual([
      "--private-ip",
      "--unix-socket=/cloudsql",
      "--health-check",
      "--http-address=127.0.0.1",
      "--http-port=9801",
      "--exit-zero-on-sigterm",
      "<exact-instance-connection-name>",
    ]);
    for (const argument of contract.proxyInvocation.arguments.slice(0, -1)) {
      expect(source).toContain(`"${argument}"`);
    }
    expect(contract.proxyInvocation.environmentOverridePolicy).toBe("REJECT_NONBLANK");
    expect(source).toContain('key.startsWith("CSQL_PROXY_")');
    expect(source).not.toMatch(
      /"--(?:credentials-file|token|gcloud-auth|impersonate-service-account|auto-iam-authn|address=0\.0\.0\.0)"/u,
    );
  });

  it("checks the pinned proxy executable inside the Docker build", () => {
    const dockerfile = readFileSync(DOCKERFILE, "utf8");
    const expected =
      "12f2c210ef4a60c4284888edbd34c4c9868a2cba5ce26a665ad875aaf980b6fb";
    expect(dockerfile.match(new RegExp(expected, "gu"))).toHaveLength(1);
    expect(dockerfile).toContain(`ARG PROXY_EXECUTABLE_SHA256=${expected}`);
    expect(dockerfile).toContain("sha256sum --check --strict -");
    expect(dockerfile).toContain("AS proxy-verified");
    expect(dockerfile).toContain(
      "COPY --link --from=proxy-verified /verified/cloud-sql-proxy",
    );
    expect(dockerfile).not.toContain("--chown=65532:65532");
    expect(dockerfile).not.toMatch(
      /RUN\s+(?:curl|wget)|https?:\/\/[^\s]*cloud-sql-proxy/iu,
    );
    expect(readFileSync(
      join(ROOT, "scripts/verify-refund-worker-image.mts"),
      "utf8",
    )).toContain("PROXY_CHECKSUM_NEGATIVE_BUILD");
  });

  it("freezes root-owned code and exactly two worker-writable directories", () => {
    const dockerfile = readFileSync(DOCKERFILE, "utf8");
    const verifier = readFileSync(
      join(ROOT, "scripts/verify-refund-worker-image.mts"),
      "utf8",
    );
    expect(contract.runtimeOwnership).toEqual({
      defaultUser: "65532:65532",
      rootOwnedReadOnlyRoots: [
        "/", "/app", "/etc", "/usr", "/usr/local", "/usr/local/bin",
      ],
      runtimeUserWritableRoots: ["/cloudsql", "/tmp/refund-worker"],
      otherWritableRootPolicy: "FORBIDDEN",
    });
    expect(dockerfile).toContain("chown -R 0:0 /app");
    expect(dockerfile).toContain("chmod -R u=rwX,go=rX /app");
    expect(dockerfile).toContain(
      "chown 65532:65532 /cloudsql /tmp/refund-worker",
    );
    expect(dockerfile).toContain(
      "chmod 0700 /cloudsql /tmp/refund-worker",
    );
    expect(dockerfile).toContain("/tmp /var/tmp /run/lock");
    for (const path of [
      "/usr/.mira-refund-write-probe",
      "/usr/local/.mira-refund-write-probe",
      "/usr/local/bin/.mira-refund-write-probe",
      "/usr/local/bin/node",
      "/usr/local/bin/cloud-sql-proxy",
      "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs",
      "/app/node_modules/@prisma/client/package.json",
      "/app/prisma/migrations/20260609111830_init/migration.sql",
      "/etc/.mira-refund-write-probe",
      "/cloudsql",
      "/tmp/refund-worker",
    ]) {
      expect(verifier).toContain(path);
    }
  });

  it("freezes the Direct VPC allowance and truthful forced-termination boundary", () => {
    const source = readFileSync(SUPERVISOR, "utf8");
    const documentation = readFileSync(R2A_DOCUMENT, "utf8");
    expect(contract.proxyReadiness).toEqual({
      timeoutMs: 120000,
      pollIntervalMs: 250,
      authority: "ENGINEERING_ALLOWANCE_NOT_CLOUD_EVIDENCE",
      directVpcColdStartMayExceedOneMinute: true,
      workerDatabaseConnectivityCheckFollowsReadiness: true,
    });
    expect(contract.termination).toEqual({
      proxyGracefulShutdownMs: 2000,
      proxyForcedShutdownMs: 1000,
      platformForcedTerminationMayPreventFinalResult: true,
      missingFinalResultClassification: "STOP_AND_RECONCILE_POSSIBLE_CONTACT",
      guaranteedWorkerDrainBeforePlatformKill: false,
    });
    expect(contract.cloudRunTask).toMatchObject({
      futureTaskTimeoutConstraint:
        "GREATER_THAN_PROXY_STARTUP_PLUS_ADMITTED_WORKER_EXECUTION_PLUS_SHUTDOWN",
      futureTaskTimeoutExactValue: "DEFERRED_TO_P3E_B2_R2B",
      deployableWithoutDerivedTimeoutProof: false,
    });
    expect(source).toContain("PROXY_READINESS_TIMEOUT_MS = 120_000");
    expect(source).toContain("PROXY_READINESS_POLL_INTERVAL_MS = 250");
    expect(source).toContain('key.startsWith("PG")');
    expect(documentation).toContain("one minute or more");
    expect(documentation).toContain("STOP_AND_RECONCILE_POSSIBLE_CONTACT");
    expect(documentation).toContain("not invent that exact timeout");
    expect(documentation).not.toContain(
      "polls the loopback `/readiness` endpoint every 100 ms",
    );
  });

  it("freezes the two-build OCI identity algorithm and local-only authority", () => {
    const reproducibility = readFileSync(
      join(ROOT, "scripts/verify-refund-worker-reproducibility.mts"),
      "utf8",
    );
    expect(contract.reproducibility).toMatchObject({
      platform: "linux/amd64",
      rootLockfile: "package-lock.json",
      sourceDateEpoch: 1784764800,
      builds: 2,
      cachePolicy: "INDEPENDENT_NO_CACHE",
      output: "OCI_LAYOUT",
      provenanceDuringByteComparison: false,
      sbomDuringByteComparison: false,
      temporaryArtifactPolicy: "DELETE_AFTER_CAPTURE",
    });
    expect(reproducibility).toContain('"--no-cache"');
    expect(reproducibility).toContain("rewrite-timestamp=true");
    expect(reproducibility).toContain("indexJsonSha256");
    expect(reproducibility).toContain("indexSelectedManifestDescriptorDigest");
    expect(reproducibility).toContain("childManifestRawSha256");
    expect(reproducibility).toContain("configRawSha256");
    expect(reproducibility).toContain("layerDescriptors");
    expect(reproducibility).not.toContain(
      "manifestDigest: indexManifest.digest",
    );
    expect(reproducibility).toContain("recursive: true");
    expect(contract.localProof).toEqual({
      authority: "LOCAL_REPRODUCIBILITY_PROOF: NOT_RELEASE_AUTHORITY",
      releaseImageDigest: "ABSENT",
      syntheticRevision: "p3e-b2-r2a-local-proof-v1",
      sourceDateEpoch: 1784764800,
    });
  });

  it("keeps schema, migrations, and the R2A subinventory byte-authoritative", () => {
    expect(sha256(readFileSync(join(ROOT, "prisma/schema.prisma")))).toBe(
      "a9936e59dfd5f19492112fa120ec889e3feb06bdc09d7c36a1fa63f58f6506ad",
    );
    expect(migrationRuntimeDigest()).toBe(
      "fdf53976401e7267090057b98ef6e73acb8d2befc4d13f81639e816c972adb61",
    );
    const terraform = repositoryRelativeFiles(INFRA)
      .filter((path) => !path.startsWith(
        "infra/refund-sandbox/p3e-b2/runtime/",
      ))
      .filter((path) => path.endsWith(".tf"))
      .map((path) => readFileSync(join(ROOT, path), "utf8"))
      .join("\n");
    expect(terraform).not.toMatch(
      /google_cloud_run_v2_job|google_service_account|google_secret_manager_secret_version/u,
    );
    expect(terraform).not.toMatch(
      /google_(?:project|service_account)_iam_(?:member|binding|policy)/u,
    );
  });

  it("keeps machine status, R1B supersession, and documentation consistent", () => {
    const documentation = readFileSync(R2A_DOCUMENT, "utf8");
    const foundation = readFileSync(
      join(ROOT, "docs/payment_policy/refund_worker_p3e_b2_foundation_authority_v1.md"),
      "utf8",
    );
    for (const [key, value] of Object.entries(contract.status)) {
      expect(documentation).toContain(`${key}: ${value}`);
    }
    expect(documentation).toContain("P3E-B2-R2B1");
    expect(documentation).toContain("does not publish the image");
    expect(documentation).toContain(
      "LOCAL_REPRODUCIBILITY_PROOF: NOT_RELEASE_AUTHORITY",
    );
    expect(documentation).toContain("RELEASE_IMAGE_DIGEST: ABSENT");
    expect(contract.status.REFUND_WORKER_IMAGE_LOCAL_REPRODUCIBILITY).toBe(
      "PROVIDER_FREE_PROOF_COMPLETE_NOT_RELEASE_AUTHORITY",
    );
    expect(documentation).not.toContain("PROVIDER_FREE_PROOF_REQUIRED");
    expect(foundation).toContain(
      "P3E-B2-R2B1 now defines, but does not provision, runtime",
    );
    expect(foundation).toContain(
      "exact database secret-version reference admission",
    );
    expect(foundation).not.toContain(
      "smallest candidate next package is P3E-B2-R2A",
    );
    expect(documentation).not.toMatch(/IMAGE_(?:PUSHED|PUBLISHED): TRUE/u);
  });
});

function discoverR2aFiles(): readonly string[] {
  const candidates = new Set<string>([
    ".dockerignore", "package.json", "package-lock.json",
    "docs/payment_policy/refund_worker_p3e_b2_foundation_authority_v1.md",
    "infra/refund-sandbox/p3e-b2/README.md",
    "infra/refund-sandbox/p3e-b2/runtime-deferred/README.md",
    "src/lib/payment/refund/refund-sandbox-provider-free-preflight-environment.ts",
    "src/lib/payment/refund/__tests__/refund-p3e-b2-foundation-authority-policy.test.ts",
    "src/lib/payment/refund/__tests__/refund-sandbox-provider-free-preflight-environment.test.ts",
  ]);
  for (const root of [
    join(ROOT, "containers/refund-worker"),
    join(ROOT, "scripts"),
    join(ROOT, "docs/payment_policy"),
    join(ROOT, "infra/refund-sandbox/p3e-b2/contracts"),
    join(ROOT, "src/lib/payment/refund"),
  ]) {
    for (const path of repositoryRelativeFiles(root)) {
      const name = basename(path);
      if (isR2aDiscoveredPath(path, name)) candidates.add(path);
    }
  }
  return Object.freeze([...candidates].sort());
}

function isR2aDiscoveredPath(path: string, name: string): boolean {
  return path.startsWith("containers/refund-worker/")
    || name.startsWith("verify-refund-worker-")
    || name === "build-refund-worker-bundles.mts"
    || name === "refund_worker_p3e_b2_runtime_image_connection_v1.md"
    || name === "runtime-image-connection-v1.json"
    || name.startsWith("refund-worker-container-supervisor")
    || name === "refund-p3e-real-filesystem-inventory.ts"
    || name === "refund-p3e-b2-runtime-image-policy.test.ts";
}

function repositoryRelativeFiles(root: string): string[] {
  return walkRefundP3eRealFiles(root)
    .map((path) => relative(ROOT, path).split(sep).join("/"))
    .sort();
}

function migrationRuntimeDigest(): string {
  const digest = createHash("sha256");
  const migrationsRoot = join(ROOT, "prisma/migrations");
  const migrations = walkRefundP3eRealFiles(migrationsRoot)
    .filter((path) => basename(path) === "migration.sql")
    .sort();
  for (const migration of migrations) {
    digest.update(basename(dirname(migration)));
    digest.update("\0");
    digest.update(readFileSync(migration));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecordWithStringArray(
  value: unknown,
  key: string,
): value is Readonly<Record<string, unknown>> & Readonly<{ paths: readonly string[] }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const observed = Object.getOwnPropertyDescriptor(value, key);
  return observed !== undefined && "value" in observed
    && Array.isArray(observed.value)
    && observed.value.every((entry) => typeof entry === "string");
}

const SYNTHETIC_PROOF_MANIFEST_DIGEST = `sha256:${"f".repeat(64)}`;
const SYNTHETIC_PROOF_CONFIG_DIGEST = `sha256:${"e".repeat(64)}`;
const SYNTHETIC_PROOF_OTHER_DIGEST = `sha256:${"d".repeat(64)}`;

type SyntheticInspectionOptions = Readonly<{
  repoTags?: unknown;
  repoDigests?: unknown;
  padding?: string;
}>;

function inspectionJson(options: SyntheticInspectionOptions = {}): string {
  return JSON.stringify([{
    Id: SYNTHETIC_PROOF_MANIFEST_DIGEST,
    RepoTags: options.repoTags,
    RepoDigests: options.repoDigests,
    Padding: options.padding,
  }]);
}

function inspectionJsonWithExactByteLength(targetBytes: number): string {
  const empty = inspectionJson({ repoTags: [], repoDigests: [], padding: "" });
  const paddingBytes = targetBytes - Buffer.byteLength(empty, "utf8");
  if (paddingBytes < 0) throw new Error("TEST_INSPECTION_BOUND_TOO_SMALL");
  const result = inspectionJson({
    repoTags: [],
    repoDigests: [],
    padding: "p".repeat(paddingBytes),
  });
  if (Buffer.byteLength(result, "utf8") !== targetBytes) {
    throw new Error("TEST_INSPECTION_BOUND_CONSTRUCTION_FAILED");
  }
  return result;
}

function repoDigestWithExactByteLength(targetBytes: number): string {
  const suffix = `@sha256:${"a".repeat(64)}`;
  const repositoryBytes = targetBytes - Buffer.byteLength(suffix, "utf8");
  if (repositoryBytes < 1) throw new Error("TEST_REPO_DIGEST_BOUND_TOO_SMALL");
  const result = `${"r".repeat(repositoryBytes)}${suffix}`;
  if (Buffer.byteLength(result, "utf8") !== targetBytes) {
    throw new Error("TEST_REPO_DIGEST_BOUND_CONSTRUCTION_FAILED");
  }
  return result;
}

type SyntheticProofIdentityOptions = Readonly<{
  iidfile?: string;
  config?: string;
  manifest?: string;
  descriptor?: string;
  localStoreImageId?: string;
  repoDigests?: readonly string[];
}>;

function syntheticProofMetadata(
  options: SyntheticProofIdentityOptions = {},
): string {
  const config = options.config ?? SYNTHETIC_PROOF_CONFIG_DIGEST;
  const manifest = options.manifest ?? SYNTHETIC_PROOF_MANIFEST_DIGEST;
  return JSON.stringify({
    "containerimage.config.digest": config,
    "containerimage.digest": manifest,
    "containerimage.descriptor": {
      digest: options.descriptor ?? manifest,
      mediaType: "application/vnd.docker.distribution.manifest.v2+json",
      size: 498,
    },
  });
}

function syntheticProofIdentityInput(
  tag: string,
  options: SyntheticProofIdentityOptions = {},
) {
  const manifest = options.manifest ?? SYNTHETIC_PROOF_MANIFEST_DIGEST;
  return {
    iidFileValue: options.iidfile ?? SYNTHETIC_PROOF_CONFIG_DIGEST,
    metadataFileValue: syntheticProofMetadata(options),
    localInspectionValue: JSON.stringify([{
      Id: options.localStoreImageId ?? SYNTHETIC_PROOF_MANIFEST_DIGEST,
      RepoDigests: options.repoDigests ?? [
        `mira-refund-worker@${manifest}`,
      ],
    }]),
    tag,
  };
}

type FakeProofImage = Readonly<{
  localStoreImageId: string;
  repoDigests: readonly string[];
}>;

function installSyntheticProofImage(
  tags: Map<string, FakeProofImage>,
  tag: string,
): void {
  tags.set(tag, {
    localStoreImageId: SYNTHETIC_PROOF_MANIFEST_DIGEST,
    repoDigests: [
      `mira-refund-worker@${SYNTHETIC_PROOF_MANIFEST_DIGEST}`,
    ],
  });
}

function createFakeProofDocker(
  options: Readonly<{ failImageRemoval?: boolean }> = {},
) {
  const tags = new Map<string, FakeProofImage>();
  const containers = new Map<string, boolean>();
  const commands: string[][] = [];
  const execute: ProofImageDockerExecutor = (args) => {
    const command = [...args];
    commands.push(command);
    if (command[0] === "image") {
      return executeFakeImageCommand(command, tags, options);
    }
    if (command[0] === "container") {
      return executeFakeContainerCommand(command, containers);
    }
    return { status: 2, stdout: "", stderr: "unsupported fake command" };
  };
  return { tags, containers, commands, execute };
}

function executeFakeImageCommand(
  command: readonly string[],
  tags: Map<string, FakeProofImage>,
  options: Readonly<{ failImageRemoval?: boolean }>,
) {
  const tag = command.at(-1) ?? "";
  if (command[1] === "inspect") {
    const image = tags.get(tag);
    if (image === undefined) {
      return { status: 1, stdout: "", stderr: "not found" };
    }
    const formatted = command.includes("--format");
    return {
      status: 0,
      stdout: formatted
        ? `${image.localStoreImageId}\n`
        : `${JSON.stringify([{
          Id: image.localStoreImageId,
          RepoDigests: image.repoDigests,
        }])}\n`,
      stderr: "",
    };
  }
  if (command[1] !== "rm") {
    return { status: 2, stdout: "", stderr: "unsupported image command" };
  }
  if (options.failImageRemoval) {
    return { status: 1, stdout: "", stderr: "bounded failure" };
  }
  tags.delete(tag);
  return { status: 0, stdout: `${tag}\n`, stderr: "" };
}

function executeFakeContainerCommand(
  command: readonly string[],
  containers: Map<string, boolean>,
) {
  const name = command.at(-1) ?? "";
  if (command[1] === "inspect") {
    const running = containers.get(name);
    return running === undefined
      ? { status: 1, stdout: "", stderr: "not found" }
      : { status: 0, stdout: `${String(running)}\n`, stderr: "" };
  }
  if (command[1] === "stop" && containers.has(name)) {
    containers.set(name, false);
    return { status: 0, stdout: `${name}\n`, stderr: "" };
  }
  if (command[1] === "rm" && containers.delete(name)) {
    return { status: 0, stdout: `${name}\n`, stderr: "" };
  }
  return { status: 1, stdout: "", stderr: "not found" };
}

type EntryOverride = Readonly<Partial<Omit<RootEntry, "path">>>;

function syntheticBaseInventory(): unknown {
  return syntheticInventory([
    directory("/"),
    directory("/etc"),
    directory("/tmp", 0, 0, 0o1777),
    directory("/usr"),
    directory("/usr/lib"),
    regular("/usr/lib/synthetic-removed", "1".repeat(64)),
    directory("/usr/local"),
    directory("/usr/local/bin"),
    regular("/usr/local/bin/node", "4".repeat(64), 0o755),
    symlink("/usr/local/bin/node-link", "/usr/local/bin/node"),
  ]);
}

function syntheticRuntimeInventory(
  overrides: Readonly<Record<string, EntryOverride>> = {},
  authority: string = "IMAGE_NATIVE_CONTAINER_LSTAT",
): unknown {
  const entries = [
    directory("/"),
    directory("/app"),
    regular("/app/synthetic-bundle.mjs", "5".repeat(64)),
    directory("/cloudsql", 65532, 65532, 0o700),
    directory("/etc"),
    directory("/tmp"),
    directory("/tmp/refund-worker", 65532, 65532, 0o700),
    directory("/usr"),
    directory("/usr/lib"),
    directory("/usr/local"),
    directory("/usr/local/bin"),
    regular("/usr/local/bin/cloud-sql-proxy", "6".repeat(64), 0o755),
    regular("/usr/local/bin/node", "4".repeat(64), 0o755),
    symlink("/usr/local/bin/node-link", "/usr/local/bin/node"),
  ];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const [path, override] of Object.entries(overrides)) {
    const existing = byPath.get(path);
    byPath.set(path, completeEntry(path, override, existing));
  }
  return syntheticInventory(
    [...byPath.values()],
    authority,
  );
}

function runtimeEntryAt(inventory: unknown, path: string): RootEntry {
  if (!isImageNativeInventory(inventory)) {
    throw new Error("Synthetic image-native inventory expected");
  }
  const entry = inventory.entries.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`Synthetic image-native entry missing: ${path}`);
  return entry;
}

function replaceRuntimeEntry(
  inventory: unknown,
  path: string,
  replacement: RootEntry,
): unknown {
  if (!isImageNativeInventory(inventory)) {
    throw new Error("Synthetic image-native inventory expected");
  }
  if (replacement.path !== path) {
    throw new Error(`Synthetic replacement path mismatch: ${path}`);
  }
  let replacementCount = 0;
  const entries = inventory.entries.map((entry) => {
    if (entry.path !== path) return entry;
    replacementCount += 1;
    return replacement;
  });
  if (replacementCount !== 1) {
    throw new Error(`Synthetic image-native replacement count: ${path}`);
  }
  return syntheticInventory(entries);
}

function isImageNativeInventory(
  value: unknown,
): value is ImageNativeInventory {
  return typeof value === "object" && value !== null
    && "authority" in value
    && value.authority === "IMAGE_NATIVE_CONTAINER_LSTAT"
    && "entries" in value
    && Array.isArray(value.entries);
}

const ROOT_ENTRY_FIELDS = Object.freeze([
  "path",
  "type",
  "mode",
  "uid",
  "gid",
  "executable",
  "sha256",
  "symlinkTarget",
] satisfies readonly (keyof RootEntry)[]);

function expectOnlyEntryFieldChanged(
  baseline: RootEntry,
  mutated: RootEntry,
  changedField: keyof RootEntry,
): void {
  for (const field of ROOT_ENTRY_FIELDS) {
    if (field === changedField) {
      expect(mutated[field]).not.toEqual(baseline[field]);
    } else {
      expect(mutated[field]).toEqual(baseline[field]);
    }
  }
}

function frozenClosureFrom(
  inspection: FilesystemInspection,
  applicationOverride: Readonly<Partial<
  FrozenImageContract["applicationClosure"]
  >> = {},
): FrozenImageContract {
  return Object.freeze({
    proofImageInspectionBounds: DOCKER_INSPECTION_LIMITS,
    applicationClosure: Object.freeze({
      entryCount: inspection.applicationClosureCount,
      metadataManifestSha256: inspection.applicationMetadataManifestSha256,
      contentManifestSha256: inspection.applicationContentManifestSha256,
      ...applicationOverride,
    }),
    systemClosure: Object.freeze({
      removedEntryCount: inspection.reviewedRemovalCount,
      removedPathManifestSha256: inspection.removedPathManifestSha256,
      changedEntryCount: inspection.reviewedChangedEntryCount,
      changedMetadataContentManifestSha256:
        inspection.changedMetadataContentManifestSha256,
      addedEntryCount: inspection.reviewedRuntimeAdditionCount,
      addedMetadataContentManifestSha256:
        inspection.addedMetadataContentManifestSha256,
    }),
    forbiddenRuntimeExecutables: FORBIDDEN_EXECUTABLE_NAMES,
    forbiddenRuntimePathPrefixes: FORBIDDEN_CONTENT_PREFIXES,
  });
}

function completeEntry(
  path: string,
  override: EntryOverride,
  existing: RootEntry | undefined,
): RootEntry {
  const fallback = existing ?? regular(path, "7".repeat(64));
  const merged = Object.freeze({ ...fallback, ...override, path });
  const type = merged.type;
  const mode = merged.mode;
  return Object.freeze({
    path,
    type,
    mode,
    uid: merged.uid,
    gid: merged.gid,
    executable: type === "SYMLINK"
      || type === "REGULAR_FILE" && (mode & 0o111) !== 0,
    sha256: type === "REGULAR_FILE" ? merged.sha256 : null,
    symlinkTarget: type === "SYMLINK" ? merged.symlinkTarget : null,
  });
}

function syntheticInventory(
  entries: readonly RootEntry[],
  authority: string = "IMAGE_NATIVE_CONTAINER_LSTAT",
): unknown {
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    authority,
    entries: Object.freeze(sorted),
    virtualRuntimeExclusions: Object.freeze([
      "/.dockerenv", "/dev", "/etc/hostname", "/etc/hosts",
      "/etc/resolv.conf", "/proc", "/root/.cache", "/sys",
    ]),
    counts: Object.freeze({
      regularFiles: sorted.filter((entry) => entry.type === "REGULAR_FILE").length,
      directories: sorted.filter((entry) => entry.type === "DIRECTORY").length,
      symlinks: sorted.filter((entry) => entry.type === "SYMLINK").length,
      executables: sorted.filter(
        (entry) => entry.type === "REGULAR_FILE" && entry.executable,
      ).length,
    }),
  });
}

function directory(
  path: string,
  uid: number = 0,
  gid: number = 0,
  mode: number = 0o755,
): RootEntry {
  return Object.freeze({
    path,
    type: "DIRECTORY",
    mode,
    uid,
    gid,
    executable: false,
    sha256: null,
    symlinkTarget: null,
  });
}

function regular(
  path: string,
  sha256: string,
  mode: number = 0o644,
): RootEntry {
  return Object.freeze({
    path,
    type: "REGULAR_FILE",
    mode,
    uid: 0,
    gid: 0,
    executable: (mode & 0o111) !== 0,
    sha256,
    symlinkTarget: null,
  });
}

function symlink(
  path: string,
  symlinkTarget: string,
): RootEntry {
  return Object.freeze({
    path,
    type: "SYMLINK",
    mode: 0o777,
    uid: 0,
    gid: 0,
    executable: true,
    sha256: null,
    symlinkTarget,
  });
}
