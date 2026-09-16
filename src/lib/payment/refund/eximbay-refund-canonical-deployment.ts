import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import manifest from "../../../../infra/refund-sandbox/p3e-b2/contracts/eximbay-canonical-deployment-v1.json";

export const EXIMBAY_CANONICAL_DEPLOYMENT_SHA256 = "54769e21dc33664d74981e5b1561da43a12737affb14e5470b258afc0961cd14";
export const EXIMBAY_CANONICAL_DEPLOYMENT = Object.freeze(manifest);

/** Source selection, not permission to deploy or invoke. No historical fallback. */
export async function verifyEximbayCanonicalDeployment(repositoryRoot: string): Promise<void> {
  const entries = [{ path: "infra/refund-sandbox/p3e-b2/contracts/eximbay-canonical-deployment-v1.json",
    sha256: EXIMBAY_CANONICAL_DEPLOYMENT_SHA256 }, ...manifest.inputs];
  for (const entry of entries) {
    const bytes = await readFile(resolve(repositoryRoot, entry.path));
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      throw new Error("CANONICAL_DEPLOYMENT_CONTRACT_DRIFT");
    }
  }
}
