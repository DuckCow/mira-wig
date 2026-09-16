import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createEximbayRefundPreflightConfig } from "./providers/eximbay/preflight-contract";
import { createHash } from "node:crypto";
import { readExactEximbayRefundCanarySecret } from "./eximbay-refund-canary-secret-reader";
import { exactEximbayRefundCanarySecretName } from "./eximbay-refund-canary-secret-contract";
import { createAuthenticatedEximbayRefundRestFetch, createEximbayRefundRestCredentials } from "./providers/eximbay/authenticated-transport";
import {
  CONTACTED_EVIDENCE_COMMAND_ID, contactedEvidenceSelect, recoverContactedEvidenceAuthority,
  type ContactedEvidenceRow,
} from "./providers/eximbay/contacted-evidence-state";
import { createEximbayRefundLookupPlan, type EximbayRefundLookupAuthority,
  type EximbayRefundLookupTransport } from "./providers/eximbay/refund-lookup";
import { readEximbayRawJsonResponse } from "./providers/eximbay/raw-response";
import { emptyContactedRefundEvidence, parseContactedRefundEvidence,
  parseContactedRefundSuccessProof, type ContactedRefundSuccessProof, type ContactedRefundEvidence } from "./providers/eximbay/contacted-evidence-parser";

export type ContactedProofConsumer = (proof: ContactedRefundSuccessProof) => Promise<void>;

type Env = Readonly<Record<string, string | undefined>>;
export type ContactedEvidenceDatabaseRead = Readonly<{
  row: ContactedEvidenceRow | null; databaseDisconnected: boolean; databaseReadSucceeded: boolean;
}>;
export type ContactedEvidenceDependencies = Readonly<{
  readDatabase: (env: Env) => Promise<ContactedEvidenceDatabaseRead>;
  fetch: EximbayRefundLookupTransport;
  readSecret: typeof readExactEximbayRefundCanarySecret;
}>;
export type ContactedEvidenceResult = ContactedRefundEvidence & Readonly<{
  schema: "mira-eximbay-contacted-refund-evidence/v1";
  diagnosticCode: string;
  terminalClass: "READ_ONLY_CONTACTED_REFUND_EVIDENCE";
  databaseDisconnected: boolean;
  inquiryCount: 0 | 1;
  httpStatus: number | null;
  jsonValid: boolean | null;
}>;

// One consistent snapshot, SELECT only. Disconnect before any provider request.
export async function readContactedEvidenceDatabase(env: Env): Promise<ContactedEvidenceDatabaseRead> {
  if (!env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  let row: ContactedEvidenceRow | null;
  let databaseReadSucceeded: boolean;
  let databaseDisconnected: boolean;
  try {
    row = await db.$transaction((tx) => tx.refundExecutionCommand.findUnique({
      where: { id: CONTACTED_EVIDENCE_COMMAND_ID }, select: contactedEvidenceSelect,
    }), { isolationLevel: "RepeatableRead" });
    databaseReadSucceeded = true;
  } catch {
    row = null;
    databaseReadSucceeded = false;
  } finally {
    try { await db.$disconnect(); databaseDisconnected = true; }
    catch { databaseDisconnected = false; }
  }
  return { row, databaseDisconnected, databaseReadSucceeded };
}

export async function runEximbayContactedRefundEvidenceOnce(
  commandId: string, env: Env,
  dependencies: ContactedEvidenceDependencies = { readDatabase: readContactedEvidenceDatabase, fetch: globalThis.fetch, readSecret: readExactEximbayRefundCanarySecret },
): Promise<ContactedEvidenceResult> {
  return collectEximbayContactedRefundProofOnce(commandId, env, dependencies);
}

export async function collectEximbayContactedRefundProofOnce(
  commandId: string, env: Env, dependencies: ContactedEvidenceDependencies,
  consumeProof?: ContactedProofConsumer,
): Promise<ContactedEvidenceResult> {
  let disconnected = false;
  try {
    if (commandId !== CONTACTED_EVIDENCE_COMMAND_ID) return stopped("TARGET_MISMATCH", false);
    const config = readEvidenceConfig(env);
    if (!config) return stopped("CONFIG_INVALID", false);
    const read = await dependencies.readDatabase(env);
    disconnected = read.databaseDisconnected;
    return await inquireAfterRead(read, config, dependencies, consumeProof);
  } catch { return stopped("INTERNAL_FAILURE", disconnected); }
}

export function readEvidenceConfig(env: Env) {
  try {
    const config = createEximbayRefundPreflightConfig({ mode: "SANDBOX",
      mid: environmentText(env, "EXIMBAY_SANDBOX_MID"),
      merchantAccountBindingId: environmentText(env, "EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING"),
      credentialGenerationBindingId: environmentText(env, "EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING"),
    });
    const secret = { resource: environmentText(env, "MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE"),
      version: environmentText(env, "MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION") };
    if (!exactEximbayRefundCanarySecretName(secret)) return null;
    const digest = createHash("sha256").update(JSON.stringify([
      "mira-refund-eximbay-canary-secret-generation/v1", secret.resource, secret.version,
      config.credentialGenerationBindingId,
    ])).digest("hex");
    if (digest !== env.MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST) return null;
    return { config, secret };
  } catch { return null; }
}

function environmentText(env: Env, key: string): string { return env[key] ?? ""; }

async function inquireAfterRead(
  read: ContactedEvidenceDatabaseRead,
  config: NonNullable<ReturnType<typeof readEvidenceConfig>>,
  dependencies: ContactedEvidenceDependencies,
  consumeProof?: ContactedProofConsumer,
): Promise<ContactedEvidenceResult> {
  if (!read.databaseDisconnected) return stopped("DATABASE_DISCONNECT_FAILED", false);
  if (!read.databaseReadSucceeded) return stopped("DATABASE_READ_FAILED", true);
  if (!read.row) return stopped("TARGET_UNAVAILABLE", true);
  const authority = recoverContactedEvidenceAuthority(read.row, config.config);
  if (!authority) return stopped("TARGET_MISMATCH", true);
  let secret: string;
  try { secret = await dependencies.readSecret(config.secret); }
  catch { return stopped("CREDENTIAL_UNAVAILABLE", true); }
  const credentials = createEximbayRefundRestCredentials(secret);
  return inquireOnce(authority, createAuthenticatedEximbayRefundRestFetch(credentials, dependencies.fetch), consumeProof);
}

async function inquireOnce(
  authority: EximbayRefundLookupAuthority, transport: EximbayRefundLookupTransport,
  consumeProof?: ContactedProofConsumer,
): Promise<ContactedEvidenceResult> {
  const plan = createEximbayRefundLookupPlan(authority);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let httpStatus: number | null = null;
  // A single lexical transport call; no retry/fallback/reconciliation capability.
  try {
    const response = await transport(plan.endpoint, {
      method: plan.method, headers: { "Content-Type": plan.contentType }, body: plan.body,
      redirect: "error", signal: controller.signal,
    });
    httpStatus = response.status >= 100 && response.status <= 599 ? response.status : null;
    const raw = await readEximbayRawJsonResponse(response);
    if (!raw.ok) return result(emptyContactedRefundEvidence("UNESTABLISHED", raw.code), {
      databaseDisconnected: true, inquiryCount: 1, httpStatus,
      jsonValid: raw.code === "INVALID_JSON" ? false : null,
    });
    const proof = parseContactedRefundSuccessProof(raw.value, authority);
    if (proof && consumeProof) await consumeProof(proof);
    return result(parseContactedRefundEvidence(raw.value, authority), {
      databaseDisconnected: true, inquiryCount: 1, httpStatus, jsonValid: true,
    });
  } catch {
    return result(emptyContactedRefundEvidence("UNESTABLISHED", "TRANSPORT_FAILURE"), {
      databaseDisconnected: true, inquiryCount: 1, httpStatus, jsonValid: null,
    });
  } finally { clearTimeout(timeout); }
}

function stopped(code: string, databaseDisconnected: boolean): ContactedEvidenceResult {
  return result(emptyContactedRefundEvidence("UNESTABLISHED", code), {
    databaseDisconnected, inquiryCount: 0, httpStatus: null, jsonValid: null,
  });
}
function result(evidence: ContactedRefundEvidence, facts: Pick<ContactedEvidenceResult,
  "databaseDisconnected" | "inquiryCount" | "httpStatus" | "jsonValid">): ContactedEvidenceResult {
  return Object.freeze({ schema: "mira-eximbay-contacted-refund-evidence/v1",
    terminalClass: "READ_ONLY_CONTACTED_REFUND_EVIDENCE", diagnosticCode: "CONTACTED_REFUND_EVIDENCE",
    ...facts, ...evidence });
}
