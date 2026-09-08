import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  verifyPackagedProducerResultTransport,
  verifyPackagedRefundAuthority,
} from
  "../../../../../scripts/verify-refund-db-bootstrap-image.mjs";

const ROOT = process.cwd();
const RUNTIME_V2 = read("infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v2.json");
const POLICY_V9 = read("infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json");
const PRODUCER_AUTHORITY = Buffer.from([
  read("src/lib/payment/refund/eximbay-refund-canary-committed-contracts.ts").toString("utf8"),
  read("src/lib/payment/refund/eximbay-refund-canary-producer-contract.ts").toString("utf8"),
].join("\n"));

describe("refund database-bootstrap authority alignment", () => {
  it("packages only the current refund runtime and image-policy inputs", () => {
    const contextOwner = read("scripts/build-refund-db-bootstrap-context.mts").toString("utf8");
    const dockerfile = read("containers/refund-db-bootstrap/Dockerfile").toString("utf8");
    for (const source of [contextOwner, dockerfile]) {
      expect(source).toContain(
        "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v2.json",
      );
      expect(source).toContain(
        "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json",
      );
      expect(source).not.toContain(
        "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v1.json",
      );
      expect(source).not.toContain(
        "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json",
      );
    }
  });

  it("accepts the exact frozen v2/v9/worker-v9 authority and single-shot ceilings", () => {
    expect(verifyPackagedRefundAuthority(
      RUNTIME_V2,
      POLICY_V9,
      PRODUCER_AUTHORITY,
    )).toEqual({
      runtimeContractVersion: "mira-refund-p3e-b2-eximbay-canary-runtime/v2",
      runtimeSha256: "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41",
      imagePolicyVersion: "mira-refund-eximbay-canary-image-policy/v9",
      imagePolicySha256: "ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf",
      workerManifestDigest:
        "sha256:f3bbc000423588905c19507fcabb52e475923c1fcf1d0d03ffe5ac6b1d9fa691",
      workerConfigDigest:
        "sha256:1bfa5a67f9219a62f717056f1edb2fafaa0ca1c2dabb58c854eb655a435d1e27",
      staleRuntimeV1Selected: false,
    });
  });

  it("requires the corrected producer-result transport in the packaged entrypoint", () => {
    expect(verifyPackagedProducerResultTransport(
      read("containers/refund-db-bootstrap/entrypoint.ts"),
    )).toEqual({
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
  });

  it.each([
    [
      "runtime v1",
      read("infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v1.json"),
      POLICY_V9,
      PRODUCER_AUTHORITY,
    ],
    [
      "policy v1",
      RUNTIME_V2,
      read("infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json"),
      PRODUCER_AUTHORITY,
    ],
    [
      "wrong policy version",
      RUNTIME_V2,
      replace(POLICY_V9, "image-policy/v9", "image-policy/v8"),
      PRODUCER_AUTHORITY,
    ],
    [
      "wrong worker manifest",
      RUNTIME_V2,
      replace(POLICY_V9, "f3bbc0004235", "03bbc0004235"),
      PRODUCER_AUTHORITY,
    ],
    [
      "wrong worker config",
      RUNTIME_V2,
      replace(POLICY_V9, "1bfa5a67f921", "0bfa5a67f921"),
      PRODUCER_AUTHORITY,
    ],
    ["arbitrary producer authority", RUNTIME_V2, POLICY_V9, Buffer.from("arbitrary")],
    [
      "producer selecting historical runtime v1",
      RUNTIME_V2,
      POLICY_V9,
      Buffer.concat([
        PRODUCER_AUTHORITY,
        Buffer.from("infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v1.json"),
      ]),
    ],
  ])("rejects %s as current packaged refund authority", (_name, runtime, policy, producer) => {
    expect(() => verifyPackagedRefundAuthority(runtime, policy, producer)).toThrow(
      /DB_BOOTSTRAP_REFUND_AUTHORITY_(?:BYTES_)?INVALID/u,
    );
  });
});

function read(path: string): Buffer {
  return readFileSync(join(ROOT, path));
}

function replace(source: Buffer, search: string, replacement: string): Buffer {
  return Buffer.from(source.toString("utf8").replace(search, replacement));
}
