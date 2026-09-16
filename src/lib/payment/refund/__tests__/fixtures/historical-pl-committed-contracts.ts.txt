import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS,
  EximbayCanaryProducerError,
  type EximbayCanaryContractDigests,
} from "./eximbay-refund-canary-producer-contract";

const CONTRACTS = Object.freeze({
  runtimeContractSha256: Object.freeze({
    path: "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v2.json",
    sha256: EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.runtimeContractSha256,
  }),
  imagePolicySha256: Object.freeze({
    path: "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json",
    sha256: EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.imagePolicySha256,
  }),
  preflightContractSha256: Object.freeze({
    path: "infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json",
    sha256: EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.preflightContractSha256,
  }),
  terraformMainSha256: Object.freeze({
    path: "infra/refund-sandbox/p3e-b2/eximbay-canary/main.tf",
    sha256: EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.terraformMainSha256,
  }),
  terraformLocalsSha256: Object.freeze({
    path: "infra/refund-sandbox/p3e-b2/eximbay-canary/locals.tf",
    sha256: EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.terraformLocalsSha256,
  }),
  terraformVariablesSha256: Object.freeze({
    path: "infra/refund-sandbox/p3e-b2/eximbay-canary/variables.tf",
    sha256: EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.terraformVariablesSha256,
  }),
});

export async function loadEximbayCanaryCommittedContractDigests(
  repositoryRoot: string,
): Promise<EximbayCanaryContractDigests> {
  await Promise.all(Object.values(CONTRACTS).map(
    (contract) => verifyContract(repositoryRoot, contract.path, contract.sha256),
  ));
  return Object.freeze({
    runtimeContractSha256: CONTRACTS.runtimeContractSha256.sha256,
    imagePolicySha256: CONTRACTS.imagePolicySha256.sha256,
    preflightContractSha256: CONTRACTS.preflightContractSha256.sha256,
    terraformMainSha256: CONTRACTS.terraformMainSha256.sha256,
    terraformLocalsSha256: CONTRACTS.terraformLocalsSha256.sha256,
    terraformVariablesSha256: CONTRACTS.terraformVariablesSha256.sha256,
  });
}

async function verifyContract(repositoryRoot: string, path: string, expected: string): Promise<void> {
  const bytes = await readFile(resolve(repositoryRoot, path)).catch(() => null);
  if (!bytes || sha256(bytes) !== expected) {
    throw new EximbayCanaryProducerError("COMMITTED_CONTRACT_DRIFT");
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
