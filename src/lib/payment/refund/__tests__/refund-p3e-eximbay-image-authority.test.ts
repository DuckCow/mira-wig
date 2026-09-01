import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import historicalPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json";
import predecessorPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json";
import currentPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v2.json";
import {
  enforceCurrentImageConfiguration,
  enforceCurrentClosure,
  enforceCurrentSubject,
  enforceFilesystemSafety,
  enforceFrozenClosure,
  enforceV1EximbayImageSubject,
  parseCurrentEximbayImageAuthority,
  parseFrozenImageContract,
  parseV1EximbayImageAuthority,
  readCurrentEximbayImageAuthority,
  verifyFrozenImageAuthorityBytes,
  type CurrentEximbayImageAuthority,
  type FilesystemInspection,
  type FrozenImageContract,
} from "../../../../../scripts/verify-refund-worker-image.mjs";

const A_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json",
);

const V1_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json",
);

describe("immutable four-entrypoint v1 predecessor authority", () => {
  const authority = parseV1EximbayImageAuthority(predecessorPolicy);

  it("keeps the exact v1 bytes and parses its exact schema", () => {
    expect(createHash("sha256").update(readFileSync(V1_PATH)).digest("hex")).toBe(
      "5ffc8c8af5ba5892296e15d78932dc61ce883aeaac6861bb9bb006a4b790e876",
    );
  });

  it("accepts the exact v1 subject", () => {
    expect(() => enforceV1EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
  });

  it("accepts the exact v1 closure", () => {
    expect(() => enforceCurrentClosure(
      currentFilesystem(authority),
      authority,
    )).not.toThrow();
  });

  it("rejects a changed v1 parent", () => {
    expect(() => parseV1EximbayImageAuthority({
      ...predecessorPolicy,
      parentAuthoritySha256: "0".repeat(64),
    })).toThrow("CURRENT_PARENT_AUTHORITY_BINDING");
  });

  it("rejects a changed v1 baseline", () => {
    expect(() => parseV1EximbayImageAuthority({
      ...predecessorPolicy,
      baselineCommit: "0".repeat(40),
    })).toThrow("CURRENT_BASELINE_COMMIT_BINDING");
  });

  it("rejects a changed v1 context", () => {
    expect(() => enforceV1EximbayImageSubject(authority, {
      ...currentContext(authority),
      manifestDigest: "0".repeat(64),
    })).toThrow("CURRENT_CONTEXT_MANIFEST_BINDING");
  });

  it("rejects a missing v1 entrypoint", () => {
    expect(() => parseV1EximbayImageAuthority({
      ...predecessorPolicy,
      entrypoints: predecessorPolicy.entrypoints.slice(0, 3),
    })).toThrow("CURRENT_ENTRYPOINTS_SHAPE");
  });

  it("rejects a fifth v1 entrypoint", () => {
    expect(() => parseV1EximbayImageAuthority({
      ...predecessorPolicy,
      entrypoints: [...predecessorPolicy.entrypoints, {
        source: "scripts/unapproved.ts",
        runtimePath: "/app/unapproved.mjs",
      }],
    })).toThrow("CURRENT_ENTRYPOINTS_SHAPE");
  });

  it("rejects a changed v1 closure", () => {
    expect(() => enforceCurrentClosure({
      ...currentFilesystem(authority),
      applicationContentManifestSha256: "0".repeat(64),
    }, authority)).toThrow("APPLICATION_CONTENT_MANIFEST");
  });
});

describe("conjunctive historical A, v1 predecessor, and current v2 authority", () => {
  const authority = parseCurrentEximbayImageAuthority(currentPolicy);

  it("accepts exact A bytes, exact B subject, and the exact current closure", () => {
    expect(() => verifyFrozenImageAuthorityBytes(readFileSync(A_PATH))).not.toThrow();
    expect(() => enforceCurrentSubject(authority, currentContext(authority))).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });

  it("fails when A bytes change even if the current image exactly matches B", () => {
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
    const modified = Buffer.concat([readFileSync(A_PATH), Buffer.from("\n")]);
    expect(() => verifyFrozenImageAuthorityBytes(modified)).toThrow(
      "FROZEN_PARENT_AUTHORITY_SHA256",
    );
  });

  it("strictly rejects a changed B parent hash and unexpected B fields", () => {
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      parentAuthoritySha256: "0".repeat(64),
    })).toThrow("CURRENT_PARENT_AUTHORITY_BINDING");
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      fallbackAuthority: "FORBIDDEN",
    })).toThrow("CURRENT_IMAGE_AUTHORITY_SHAPE");
  });

  it("rejects every changed current source/context identity field", () => {
    const cases = [
      ["manifestSha256", "0".repeat(64), "CURRENT_CONTEXT_MANIFEST_BINDING"],
      ["fileCount", currentPolicy.buildContext.fileCount + 1,
        "CURRENT_CONTEXT_FILE_COUNT_BINDING"],
      ["repositoryGraphInputCount",
        currentPolicy.buildContext.repositoryGraphInputCount + 1,
        "CURRENT_REPOSITORY_GRAPH_BINDING"],
      ["packagedGraphInputCount",
        currentPolicy.buildContext.packagedGraphInputCount + 1,
        "CURRENT_PACKAGED_GRAPH_BINDING"],
    ] as const;
    for (const [field, value, error] of cases) {
      const changed = parseCurrentEximbayImageAuthority({
        ...currentPolicy,
        buildContext: { ...currentPolicy.buildContext, [field]: value },
      });
      expect(() => enforceCurrentSubject(
        changed,
        currentContext(authority),
      )).toThrow(error);
    }
  });

  it("fails closed when B is missing and has no A fallback", async () => {
    await expect(readCurrentEximbayImageAuthority(
      join(tmpdir(), "mira-r12-p3e-authority-b-intentionally-absent.json"),
    )).rejects.toThrow();
  });

  it("keeps historical closure validation distinct from the current filesystem", () => {
    const historical = parseFrozenImageContract(historicalPolicy);
    const historicalFilesystem = historicalFilesystemFrom(historical);
    expect(() => enforceFrozenClosure(historicalFilesystem, historical)).not.toThrow();
    expect(() => enforceCurrentClosure(historicalFilesystem, authority)).toThrow();
  });

  it("rejects four, six, missing, renamed, and retargeted current entrypoints", () => {
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      entrypoints: currentPolicy.entrypoints.slice(0, 4),
    })).toThrow("CURRENT_ENTRYPOINTS_SHAPE");
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      entrypoints: [...currentPolicy.entrypoints, {
        source: "scripts/unapproved-sixth-entrypoint.ts",
        runtimePath: "/app/unapproved-sixth-entrypoint.mjs",
      }],
    })).toThrow("CURRENT_ENTRYPOINTS_SHAPE");
    for (const entrypoints of [
      currentPolicy.entrypoints.map((entry, index) => index === 0
        ? { ...entry, source: "containers/refund-worker/missing.ts" }
        : entry),
      currentPolicy.entrypoints.map((entry, index) => index === 4
        ? { ...entry, source: "scripts/renamed-reconciliation.ts" }
        : entry),
      currentPolicy.entrypoints.map((entry, index) => index === 4
        ? { ...entry, runtimePath: "/app/retargeted-reconciliation.mjs" }
        : entry),
    ]) {
      const changed = parseCurrentEximbayImageAuthority({
        ...currentPolicy,
        entrypoints,
      });
      expect(() => enforceCurrentSubject(
        changed,
        currentContext(authority),
      )).toThrow("CURRENT_ENTRYPOINT_INVENTORY_BINDING");
    }
  });

  it("rejects extra additions and individually mismatched non-application additions", () => {
    const filesystem = currentFilesystem(authority);
    expect(() => enforceCurrentClosure({
      ...filesystem,
      reviewedRuntimeAdditionCount: filesystem.reviewedRuntimeAdditionCount + 1,
    }, authority)).toThrow("SYSTEM_ADDITION_COUNT");
    expect(() => enforceCurrentClosure({
      ...filesystem,
      nonApplicationAdditions: changedNonApplicationInventory(filesystem),
    }, authority)).toThrow("CURRENT_NON_APPLICATION_ADDITION_INVENTORY");
  });

  it("rejects every changed application and system closure identity", () => {
    const filesystem = currentFilesystem(authority);
    const cases = [
      ["applicationClosureCount", filesystem.applicationClosureCount + 1,
        "APPLICATION_CLOSURE_COUNT"],
      ["applicationMetadataManifestSha256", "0".repeat(64),
        "APPLICATION_METADATA_MANIFEST"],
      ["applicationContentManifestSha256", "0".repeat(64),
        "APPLICATION_CONTENT_MANIFEST"],
      ["reviewedRemovalCount", filesystem.reviewedRemovalCount + 1,
        "SYSTEM_REMOVAL_COUNT"],
      ["removedPathManifestSha256", "0".repeat(64),
        "SYSTEM_REMOVAL_MANIFEST"],
      ["reviewedChangedEntryCount", filesystem.reviewedChangedEntryCount + 1,
        "SYSTEM_CHANGED_COUNT"],
      ["changedMetadataContentManifestSha256", "0".repeat(64),
        "SYSTEM_CHANGED_MANIFEST"],
      ["reviewedRuntimeAdditionCount", filesystem.reviewedRuntimeAdditionCount + 1,
        "SYSTEM_ADDITION_COUNT"],
      ["addedMetadataContentManifestSha256", "0".repeat(64),
        "SYSTEM_ADDITION_MANIFEST"],
    ] as const;
    for (const [field, value, error] of cases) {
      expect(() => enforceCurrentClosure({
        ...filesystem,
        [field]: value,
      }, authority)).toThrow(error);
    }
  });

  it("rejects changed platform, architecture, user, Entrypoint, and Cmd", () => {
    expect(() => enforceCurrentImageConfiguration(
      currentImageInspection({ Os: "windows" }),
    )).toThrow("IMAGE_OS");
    expect(() => enforceCurrentImageConfiguration(
      currentImageInspection({ Architecture: "arm64" }),
    )).toThrow("IMAGE_ARCHITECTURE");
    expect(() => enforceCurrentImageConfiguration(
      currentImageInspection({ Config: { User: "0:0" } }),
    )).toThrow("IMAGE_USER");
    expect(() => enforceCurrentImageConfiguration(
      currentImageInspection({ Config: { Entrypoint: ["/unapproved"] } }),
    )).toThrow("IMAGE_ENTRYPOINT");
    expect(() => enforceCurrentImageConfiguration(
      currentImageInspection({ Config: { Cmd: ["unapproved"] } }),
    )).toThrow("IMAGE_DEFAULT_COMMAND");
  });

  it("rejects CA authority and every filesystem safety class", () => {
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      systemCaTrust: {
        ...currentPolicy.systemCaTrust,
        requiredOwner: "65532:65532",
      },
    })).toThrow("CURRENT_SYSTEM_CA_TRUST");

    const filesystem = currentFilesystem(authority);
    expect(() => enforceFilesystemSafety(filesystem)).not.toThrow();
    for (const [field, value, error] of [
      ["forbiddenExecutableCount", 1, "FORBIDDEN_EXECUTABLE"],
      ["forbiddenContentCount", 1, "FORBIDDEN_CONTENT"],
      ["rootOwnershipViolationCount", 1, "ROOT_OWNERSHIP"],
      ["workerWritableDirectoryPaths", [
        "/cloudsql", "/tmp/refund-worker", "/unexpected",
      ], "WORKER_WRITABLE_DIRECTORY_SET"],
    ] as const) {
      expect(() => enforceFilesystemSafety({
        ...filesystem,
        [field]: value,
      })).toThrow(error);
    }
  });
});

function currentImageInspection(
  override: Readonly<Record<string, unknown>> = {},
): readonly unknown[] {
  const config = {
    User: "65532:65532",
    Entrypoint: [
      "/usr/local/bin/node",
      "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs",
    ],
    Cmd: [],
    ...(typeof override.Config === "object" && override.Config !== null
      ? override.Config
      : {}),
  };
  return [{
    Os: "linux",
    Architecture: "amd64",
    ...override,
    Config: config,
  }];
}

function currentContext(authority: CurrentEximbayImageAuthority) {
  return Object.freeze({
    manifestDigest: authority.buildContext.manifestSha256,
    manifestEntries: Object.freeze(Array.from(
      { length: authority.buildContext.fileCount },
      (_, index) => index,
    )),
    repositoryGraphInputCount: authority.buildContext.repositoryGraphInputCount,
    packagedGraphInputCount: authority.buildContext.packagedGraphInputCount,
  });
}

function changedNonApplicationInventory(
  filesystem: FilesystemInspection,
): FilesystemInspection["nonApplicationAdditions"] {
  return filesystem.nonApplicationAdditions.map((entry, index) => (
    index === 0 ? { ...entry, path: "/unapproved" } : entry
  ));
}

function currentFilesystem(authority: CurrentEximbayImageAuthority): FilesystemInspection {
  return filesystemFromClosures(
    authority.applicationClosure,
    authority.systemClosure,
    authority.nonApplicationAdditions,
  );
}

function historicalFilesystemFrom(contract: FrozenImageContract): FilesystemInspection {
  return filesystemFromClosures(contract.applicationClosure, contract.systemClosure, []);
}

function filesystemFromClosures(
  application: FrozenImageContract["applicationClosure"],
  system: FrozenImageContract["systemClosure"],
  nonApplicationAdditions: FilesystemInspection["nonApplicationAdditions"],
): FilesystemInspection {
  return Object.freeze({
    regularFileCount: 0,
    directoryCount: 0,
    symlinkCount: 0,
    executableCount: 0,
    unchangedFromPinnedBaseCount: 0,
    reviewedRemovalCount: system.removedEntryCount,
    removedPathManifestSha256: system.removedPathManifestSha256,
    reviewedChangedEntryCount: system.changedEntryCount,
    changedMetadataContentManifestSha256: system.changedMetadataContentManifestSha256,
    reviewedRuntimeAdditionCount: system.addedEntryCount,
    addedMetadataContentManifestSha256: system.addedMetadataContentManifestSha256,
    nonApplicationAdditions,
    applicationClosureCount: application.entryCount,
    applicationMetadataManifestSha256: application.metadataManifestSha256,
    applicationContentManifestSha256: application.contentManifestSha256,
    forbiddenExecutableCount: 0,
    forbiddenExecutablePathSample: Object.freeze([]),
    forbiddenContentCount: 0,
    forbiddenContentPathSample: Object.freeze([]),
    rootOwnershipViolationCount: 0,
    rootOwnershipViolationPathSample: Object.freeze([]),
    workerWritableDirectoryPaths: Object.freeze(["/cloudsql", "/tmp/refund-worker"]),
    virtualRuntimeExclusions: Object.freeze([
      "/.dockerenv", "/dev", "/etc/hostname", "/etc/hosts", "/etc/resolv.conf",
      "/proc", "/sys",
    ]),
  });
}
