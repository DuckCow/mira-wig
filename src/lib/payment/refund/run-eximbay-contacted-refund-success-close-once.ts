import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { collectEximbayContactedRefundProofOnce, readContactedEvidenceDatabase, readEvidenceConfig,
  type ContactedEvidenceDependencies } from "./run-eximbay-contacted-refund-evidence-once";
import { readExactEximbayRefundCanarySecret } from "./eximbay-refund-canary-secret-reader";
import { applyEximbayContactedRefundSuccess, type ContactedSuccessApplication } from "./providers/eximbay/apply-contacted-success";
import type { ContactedRefundSuccessProof } from "./providers/eximbay/contacted-evidence-parser";

type Env = Readonly<Record<string, string | undefined>>;
export type ContactedClosureDependencies = ContactedEvidenceDependencies & Readonly<{
  apply: (proof: ContactedRefundSuccessProof, env: Env) => Promise<ContactedSuccessApplication>;
}>;

async function apply(proof: ContactedRefundSuccessProof, env: Env): Promise<ContactedSuccessApplication> {
  const config = readEvidenceConfig(env);
  if (!config || !env.DATABASE_URL) return { outcome: "REJECTED" };
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  try { return await applyEximbayContactedRefundSuccess(db, proof, config.config); }
  finally { await db.$disconnect(); }
}

export async function runEximbayContactedRefundSuccessCloseOnce(
  commandId: string, env: Env,
  dependencies: ContactedClosureDependencies = {
    readDatabase: readContactedEvidenceDatabase, fetch: globalThis.fetch,
    readSecret: readExactEximbayRefundCanarySecret, apply,
  },
) {
  let closure: ContactedSuccessApplication = { outcome: "REJECTED" };
  const evidence = await collectEximbayContactedRefundProofOnce(commandId, env, dependencies, async proof => {
    // The opaque proof goes straight to the local owner; no raw response or IDs escape.
    try { closure = await dependencies.apply(proof, env); }
    catch { closure = { outcome: "PERSISTENCE_FAILED" }; }
  });
  return Object.freeze({ schema: "mira-eximbay-contacted-refund-success-close/v1",
    outcome: closure.outcome, parserResult: evidence.parserResult,
    inquiryCount: evidence.inquiryCount, diagnosticCode: evidence.diagnosticCode });
}
