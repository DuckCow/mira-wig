import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import historicalPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json";
import predecessorPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json";
import historicalV2Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v2.json";
import historicalV3Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v3.json";
import historicalV4Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v4.json";
import historicalV5Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v5.json";
import historicalV6Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v6.json";
import historicalV7Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v7.json";
import historicalV8Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v8.json";
import historicalV9Policy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json";
import currentPolicy from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v10.json";
import {
  enforceCurrentArtifact,
  enforceCurrentImageConfiguration,
  enforceCurrentClosure,
  enforceCurrentSubject,
  enforceFilesystemSafety,
  enforceFrozenClosure,
  enforceV1EximbayImageSubject,
  enforceV2EximbayImageSubject,
  enforceV3EximbayImageSubject,
  enforceV4EximbayImageSubject,
  enforceV5EximbayImageSubject,
  enforceV6EximbayImageSubject,
  enforceV8EximbayImageSubject,
  enforceV9EximbayImageSubject,
  enforceV7EximbayImageSubject,
  parseCurrentEximbayImageAuthority,
  parseFrozenImageContract,
  parseV1EximbayImageAuthority,
  parseV2EximbayImageAuthority,
  parseV3EximbayImageAuthority,
  parseV4EximbayImageAuthority,
  parseV5EximbayImageAuthority,
  parseV6EximbayImageAuthority,
  parseV8EximbayImageAuthority,
  parseV9EximbayImageAuthority,
  parseV7EximbayImageAuthority,
  readCurrentEximbayImageAuthority,
  readV2EximbayImageAuthority,
  readV3EximbayImageAuthority,
  readV4EximbayImageAuthority,
  readV5EximbayImageAuthority,
  readV6EximbayImageAuthority,
  readV8EximbayImageAuthority,
  readV9EximbayImageAuthority,
  readV7EximbayImageAuthority,
  verifyFrozenImageAuthorityBytes,
  type CurrentEximbayImageAuthority,
  type FilesystemInspection,
  type FrozenImageContract,
  type HistoricalEximbayImageAuthority,
} from "../../../../../scripts/verify-refund-worker-image.mjs";

const A_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json",
);

const V1_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json",
);

const V2_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v2.json",
);

const V3_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v3.json",
);

const V4_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v4.json",
);

const V5_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v5.json",
);

const V6_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v6.json",
);

const V7_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v7.json",
);

const V8_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v8.json",
);

const V9_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json",
);

const V10_PATH = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v10.json",
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
      historicalContext(authority),
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
      ...historicalContext(authority),
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

describe("immutable five-entrypoint v2 predecessor authority", () => {
  const authority = parseV2EximbayImageAuthority(historicalV2Policy);

  it("keeps the exact v2 bytes and parses its exact historical schema", async () => {
    expect(createHash("sha256").update(readFileSync(V2_PATH)).digest("hex")).toBe(
      "82cfa63b1c58bf6c289722ba5a56460a1bd1cefb672f8c2fbb8d26b453fbf287",
    );
    await expect(readV2EximbayImageAuthority()).resolves.toEqual(authority);
  });

  it("accepts only its historical source, context, entrypoints, and closure", () => {
    expect(() => enforceV2EximbayImageSubject(
      authority,
      historicalContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
    expect(() => parseV2EximbayImageAuthority({
      ...historicalV2Policy,
      baselineCommit: currentPolicy.baselineCommit,
    })).toThrow("CURRENT_BASELINE_COMMIT_BINDING");
    expect(() => enforceCurrentClosure(
      currentFilesystem(parseCurrentEximbayImageAuthority(currentPolicy)),
      authority,
    )).toThrow("SYSTEM_ADDITION_MANIFEST");
  });
});

describe("immutable diagnostic-predecessor v3 authority", () => {
  const authority = parseV3EximbayImageAuthority(historicalV3Policy);

  it("keeps exact v3 bytes and accepts its historical subject and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V3_PATH)).digest("hex")).toBe(
      "9094297f20d5c2db8e12088d5bb7769da690d9fec29f9309426ff6e6ade56062",
    );
    await expect(readV3EximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceV3EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });
});

describe("immutable diagnostic-predecessor v4 authority", () => {
  const authority = parseV4EximbayImageAuthority(historicalV4Policy);

  it("keeps exact v4 bytes and accepts its historical subject and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V4_PATH)).digest("hex")).toBe(
      "e9ffcb71011465099280e199d94b1156ef40b7ea1b90b3a10cef573aba291408",
    );
    await expect(readV4EximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceV4EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });
});

describe("immutable child-terminal-predecessor v5 authority", () => {
  const authority = parseV5EximbayImageAuthority(historicalV5Policy);

  it("keeps exact v5 bytes and accepts its historical subject and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V5_PATH)).digest("hex")).toBe(
      "ce703401c5b17cd799a8e6ffb01c9a1337351ddfe180744345e6a551b9eeb398",
    );
    await expect(readV5EximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceV5EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });
});

describe("immutable supervisor-corrected predecessor v6 authority", () => {
  const authority = parseV6EximbayImageAuthority(historicalV6Policy);

  it("keeps exact v6 bytes and accepts its historical subject and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V6_PATH)).digest("hex")).toBe(
      "8cb641f5f945ce392d19c7b410824f356e205704c0e90f275821d412b2d5979d",
    );
    await expect(readV6EximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceV6EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });
});

describe("immutable first fresh-target predecessor v7 authority", () => {
  const authority = parseV7EximbayImageAuthority(historicalV7Policy);

  it("keeps exact v7 bytes and accepts its historical subject and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V7_PATH)).digest("hex")).toBe(
      "6c54d36686b9fbbc41daf1d5023a8ec857b0afec34122c2c71d455b5485f5af8",
    );
    await expect(readV7EximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceV7EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });
});

describe("immutable contacted-reconciliation predecessor v8 authority", () => {
  const authority = parseV8EximbayImageAuthority(historicalV8Policy);

  it("keeps exact v8 bytes and accepts its historical subject and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V8_PATH)).digest("hex")).toBe(
      "edd02390a033d26d239ce1f0bf13e19d983228e2a80aaaea665afb6bdffbfe5a",
    );
    await expect(readV8EximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceV8EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });
});

describe("immutable single-shot canary v9 authority", () => {
  const authority = parseV9EximbayImageAuthority(historicalV9Policy);

  it("keeps exact v9 bytes and accepts its historical subject and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V9_PATH)).digest("hex")).toBe(
      "ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf",
    );
    await expect(readV9EximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceV9EximbayImageSubject(
      authority,
      currentContext(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });
});

describe("conjunctive historical A and v1-v9 predecessors with current v10 authority", () => {
  const authority = parseCurrentEximbayImageAuthority(currentPolicy);

  it("selects v10 and accepts exact historical chain, subject, artifact, and closure", async () => {
    expect(createHash("sha256").update(readFileSync(V10_PATH)).digest("hex")).toBe(
      "5139f86b0cfa8321dd14caf8e5083a765ddccc33e82c5dbf03844c3e0106a851",
    );
    expect(() => verifyFrozenImageAuthorityBytes(readFileSync(A_PATH))).not.toThrow();
    await expect(readCurrentEximbayImageAuthority()).resolves.toEqual(authority);
    expect(() => enforceCurrentSubject(authority, currentContext(authority))).not.toThrow();
    expect(() => enforceCurrentArtifact(
      authority,
      currentArtifactInspection(authority),
    )).not.toThrow();
    expect(() => enforceCurrentClosure(currentFilesystem(authority), authority)).not.toThrow();
  });

  it("binds the sole contacted target and preserves the canary ceilings", () => {
    expect(currentPolicy.contactedReconciliation).toMatchObject({
      target: {
        runId: "4c5c9b039f18037c6f3356c903df1372",
        checkoutSessionId: "cmtk62h80000001s626b90f9y",
        paymentId: "DERIVED_BY_APPLICATION",
        providerOrderId: "DERIVED_BY_APPLICATION",
        operatorTargetInputs: 0,
      },
      paymentBinding: "APPLICATION_DERIVED",
      providerOrderIdBinding: "APPLICATION_DERIVED",
      arbitraryTargetAuthority: "ABSENT",
      previousTargetCurrent: "NO",
      eligiblePaymentCardinality: "EXACTLY_ONE",
      providerEffectCaps: {
        maxProviderRetrieveAttemptsPerExecution: 1,
        automaticProviderRetry: 0,
        cloudRunTaskRetry: 0,
      },
    });
    expect(currentPolicy.canaryExecution).toMatchObject({
      preRefundRetrieve: 1,
      refundRequest: 1,
      postRefundRetrieve: 0,
      recoveryRetrieve: 0,
      secondRefundRequest: 0,
      automaticRetry: 0,
    });
  });

  it("binds the exact successor source tree, supervisor, and command allowlist", () => {
    expect(authority).toMatchObject({
      baselineCommit: "6e1aaa32b66876252dcce40296970ea23d592d64",
      sourceTree: "97ea29321bef86e9b2f38abceef5f0b86a7795df",
      supervisorSource: {
        path: "src/lib/payment/refund/refund-worker-container-supervisor.ts",
        sha256: "68d443ac70fb8de1863287d320626c3558ac4b92cfb8ab9cf735a3555b540711",
      },
      commandAllowlist: [
        "worker-check", "worker-health", "worker-once", "sandbox-preflight",
        "image-self-check", "eximbay-canary-once",
        "eximbay-contacted-reconciliation-once",
      ],
    });
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      commandAllowlist: currentPolicy.commandAllowlist.slice(0, 6),
    })).toThrow("CURRENT_COMMAND_ALLOWLIST_BINDING");
    expect(() => parseCurrentEximbayImageAuthority({
      ...currentPolicy,
      sourceTree: "0".repeat(40),
    })).toThrow("CURRENT_SOURCE_TREE_BINDING");
  });

  it("rejects wrong manifest, config, layers, and the historical v2 artifact", () => {
    for (const [override, error] of [
      [{ Id: `sha256:${"0".repeat(64)}` }, "CURRENT_MANIFEST_BINDING"],
      [{ Descriptor: { annotations: { "config.digest": `sha256:${"0".repeat(64)}` } } },
        "CURRENT_CONFIG_BINDING"],
      [{ RootFS: { Layers: authority.artifact.diffIds.slice(0, 13) } },
        "CURRENT_LAYER_BINDING"],
      [{
        Id: "sha256:4137f0b63724f637f19b139ada7de7d589e2508dd1a5afb805428033b803db2d",
        Descriptor: {
          digest:
            "sha256:4137f0b63724f637f19b139ada7de7d589e2508dd1a5afb805428033b803db2d",
          annotations: {
            "config.digest":
              "sha256:9d9f9e58ef3d345329ea2bb3a26701f7df4fee19671ba46eabcfd4702ffbbdcc",
          },
        },
      }, "CURRENT_MANIFEST_BINDING"],
    ] as const) {
      expect(() => enforceCurrentArtifact(
        authority,
        currentArtifactInspection(authority, override),
      )).toThrow(error);
    }
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
    WorkingDir: "/app",
    Entrypoint: [
      "/usr/local/bin/node",
      "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs",
    ],
    Cmd: [],
    ExposedPorts: undefined,
    Env: [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "NODE_VERSION=22.23.1",
      "YARN_VERSION=1.22.22",
      "NODE_ENV=production",
    ],
    Labels: {
      "mira.refund.contract": "mira-refund-worker-runtime-image-connection/v1",
      "mira.refund.release-authority": "absent",
      "org.opencontainers.image.created": "1784764800",
      "org.opencontainers.image.title": "mira-refund-worker",
      "org.opencontainers.image.version": "local-reproducibility-proof",
    },
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

function currentArtifactInspection(
  authority: CurrentEximbayImageAuthority,
  override: Readonly<Record<string, unknown>> = {},
): readonly unknown[] {
  const descriptorOverride = typeof override.Descriptor === "object"
    && override.Descriptor !== null ? override.Descriptor : {};
  const descriptorAnnotations = "annotations" in descriptorOverride
    && typeof descriptorOverride.annotations === "object"
    && descriptorOverride.annotations !== null ? descriptorOverride.annotations : {};
  const rootFsOverride = typeof override.RootFS === "object"
    && override.RootFS !== null ? override.RootFS : {};
  const topLevelOverride = Object.fromEntries(
    Object.entries(override).filter(([key]) => key !== "Descriptor" && key !== "RootFS"),
  );
  return [{
    Id: authority.artifact.manifestDigest,
    Size: authority.artifact.imageSize,
    Os: "linux",
    Architecture: "amd64",
    Descriptor: {
      digest: authority.artifact.manifestDigest,
      size: authority.artifact.manifestSize,
      ...descriptorOverride,
      annotations: {
        "config.digest": authority.artifact.configDigest,
        ...descriptorAnnotations,
      },
    },
    RootFS: {
      Layers: authority.artifact.diffIds,
      ...rootFsOverride,
    },
    ...topLevelOverride,
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
    entrypointCount: authority.buildContext.entrypointCount,
    migrationInventory: Object.freeze({
      migrationCount: authority.buildContext.migrationCount,
      migrationDigest: authority.buildContext.migrationDigest,
    }),
  });
}

function historicalContext(authority: HistoricalEximbayImageAuthority) {
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

function currentFilesystem(authority: HistoricalEximbayImageAuthority): FilesystemInspection {
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
