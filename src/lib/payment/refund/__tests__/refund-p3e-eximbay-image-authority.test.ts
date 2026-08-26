import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import historicalPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json";
import currentPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json";
import {
  enforceCurrentClosure,
  enforceCurrentSubject,
  enforceFrozenClosure,
  parseCurrentEximbayImageAuthority,
  parseFrozenImageContract,
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

describe("conjunctive historical A and current Eximbay B image authority", () => {
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

  it("rejects a changed current source/context identity", () => {
    const changed = parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      buildContext: {
        ...currentPolicy.buildContext,
        manifestSha256: "0".repeat(64),
      },
    });
    expect(() => enforceCurrentSubject(changed, currentContext(authority))).toThrow(
      "CURRENT_CONTEXT_MANIFEST_BINDING",
    );
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

  it("rejects a missing or fifth current entrypoint", () => {
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      entrypoints: currentPolicy.entrypoints.slice(0, 3),
    })).toThrow("CURRENT_ENTRYPOINTS_SHAPE");
    const changed = parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      entrypoints: currentPolicy.entrypoints.map((entry, index) => index === 3
        ? { ...entry, source: "scripts/unapproved-fifth-entrypoint.ts" }
        : entry),
    });
    expect(() => enforceCurrentSubject(changed, currentContext(authority))).toThrow(
      "CURRENT_ENTRYPOINT_INVENTORY_BINDING",
    );
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

  it("rejects one changed application content byte or metadata mode", () => {
    const filesystem = currentFilesystem(authority);
    expect(() => enforceCurrentClosure({
      ...filesystem,
      applicationContentManifestSha256: "0".repeat(64),
    }, authority)).toThrow("APPLICATION_CONTENT_MANIFEST");
    expect(() => enforceCurrentClosure({
      ...filesystem,
      applicationMetadataManifestSha256: "0".repeat(64),
    }, authority)).toThrow("APPLICATION_METADATA_MANIFEST");
  });
});

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
