import { readAuthorizationJson } from "./json-body";
import { GoogleAuth } from "google-auth-library";
import { digest, identifier, record, REFUND_REENTRY_ADMISSION_AUTH_HEADER, RefundAuthorizationError, requireAuthorizationEnabled, type AuthorizationEnv } from "./contract";
import type { RefundExecutionLeaseHandle } from "../lease-contract";

export type AdmittedRefundReentry = Readonly<{
  grantId: string;
  releasePolicyDigest: string;
  lease: RefundExecutionLeaseHandle;
  account: Readonly<{ mid: string; merchantAccountBindingId: string; credentialGenerationBindingId: string; secretResource: string; secretVersion: string }>;
}>;

export async function requestRefundAuthorizationAdmission(env: AuthorizationEnv): Promise<AdmittedRefundReentry> {
  requireAuthorizationEnabled(env);
  const input = workerAdmissionConfiguration(env);
  const client = await new GoogleAuth().getIdTokenClient(input.audience);
  const token = await client.idTokenProvider.fetchIdToken(input.audience);
  // One request only. A lost response is inspected administratively; never re-consumed.
  const response = await fetch(input.audience, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { [REFUND_REENTRY_ADMISSION_AUTH_HEADER]: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grantId: input.grantId, executionName: input.executionName }),
  });
  if (!response.ok) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  const value = await readAuthorizationJson(response, 65_536);
  return parseAdmissionReceipt(value, input.grantId);
}

function workerAdmissionConfiguration(env: AuthorizationEnv) {
  const audience = env.MIRA_REFUND_REENTRY_ADMISSION_URL;
  const grantId = env.MIRA_REFUND_AUTHORIZATION_ID;
  const jobName = env.MIRA_REFUND_REENTRY_JOB_NAME;
  const execution = env.CLOUD_RUN_EXECUTION;
  if (!audience || !/^https:\/\/[^\s?#]+\/api\/payments\/refunds\/reentry\/admission$/u.test(audience)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (!identifier(grantId)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (!jobName || !/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/jobs\/[a-z0-9-]+$/u.test(jobName)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (!validExecutionName(execution)) throw new RefundAuthorizationError("CONFIG_INVALID");
  return { audience, grantId, executionName: `${jobName}/executions/${execution}` };
}

export function parseAdmissionReceipt(value: unknown, grantId: string): AdmittedRefundReentry {
  if (!record(value) || value.ok !== true || value.grantId !== grantId || !digest(value.releasePolicyDigest)) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  return { grantId, releasePolicyDigest: value.releasePolicyDigest, lease: parseLease(value.lease), account: parseAccount(value.account) };
}

function parseLease(value: unknown): RefundExecutionLeaseHandle {
  if (!record(value)) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  const identity = leaseIdentity(value);
  if (typeof value.leaseGeneration !== "number" || !Number.isInteger(value.leaseGeneration) || value.leaseGeneration < 2) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  if (!digest(value.leaseToken) || typeof value.leaseUntil !== "string") throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  const leaseUntil = new Date(value.leaseUntil);
  if (!Number.isFinite(leaseUntil.getTime())) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  return { ...identity, leaseGeneration: value.leaseGeneration, leaseToken: value.leaseToken, leaseUntil };
}

function parseAccount(value: unknown): AdmittedRefundReentry["account"] {
  if (!record(value)) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  if (!identifier(value.mid) || !identifier(value.merchantAccountBindingId) || !identifier(value.credentialGenerationBindingId)) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  if (typeof value.secretResource !== "string" || typeof value.secretVersion !== "string") throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  return { mid: value.mid, merchantAccountBindingId: value.merchantAccountBindingId,
    credentialGenerationBindingId: value.credentialGenerationBindingId, secretResource: value.secretResource, secretVersion: value.secretVersion };
}

function leaseIdentity(value: Record<string, unknown>) {
  if (!identifier(value.commandId) || !identifier(value.refundAttemptId) || !identifier(value.orderId)) throw new RefundAuthorizationError("PERSISTENCE_CONFLICT");
  return { commandId: value.commandId, refundAttemptId: value.refundAttemptId, orderId: value.orderId };
}

function validExecutionName(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9-]+$/u.test(value);
}
