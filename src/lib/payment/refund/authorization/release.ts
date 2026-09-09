import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { digest, exactFields, identifier, record, RefundAuthorizationError, type AuthorizationEnv } from "./contract";

// Server-owned, content-addressed reviewed configuration. No real release identity is
// shipped here. The exact execution task template includes image, env/secret references,
// database binding, resources and effect gates. Only the grant selector is substituted.
export type RefundReentryRelease = Readonly<{
  digest: string;
  audience: string;
  jobName: string;
  serviceAccountSubject: string;
  serviceAccountEmail: string;
  mid: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  secretResource: string;
  secretVersion: string;
  executionTemplate: Readonly<Record<string, unknown>>;
}>;
export type LoadRefundReentryRelease = (digest: string) => Promise<RefundReentryRelease>;

export async function loadRefundReentryRelease(expected: string, env: AuthorizationEnv = process.env): Promise<RefundReentryRelease> {
  const path = env.MIRA_REFUND_REENTRY_RELEASE_FILE;
  if (!path || !isAbsolute(path) || !digest(expected)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (expected !== env.MIRA_REFUND_REENTRY_RELEASE_SHA256) throw new RefundAuthorizationError("RELEASE_MISMATCH");
  const bytes = await readFile(path);
  if (bytes.length > 65_536 || createHash("sha256").update(bytes).digest("hex") !== expected) throw new RefundAuthorizationError("RELEASE_MISMATCH");
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  return parseRefundReentryRelease(value, expected);
}

export function parseRefundReentryRelease(value: unknown, releaseDigest: string): RefundReentryRelease {
  const fields = ["formatVersion", "audience", "jobName", "serviceAccountSubject", "serviceAccountEmail", "mid",
    "merchantAccountBindingId", "credentialGenerationBindingId", "secretResource", "secretVersion", "executionTemplate"];
  if (!digest(releaseDigest) || !exactFields(value, fields) || value.formatVersion !== "mira-refund-reentry-release/v1") throw new RefundAuthorizationError("CONFIG_INVALID");
  const runtime = runtimeIdentity(value);
  const account = accountIdentity(value);
  if (!record(value.executionTemplate)) throw new RefundAuthorizationError("CONFIG_INVALID");
  validateTaskTemplate(value.executionTemplate, runtime.serviceAccountEmail);
  return Object.freeze({ digest: releaseDigest, ...runtime, ...account, executionTemplate: value.executionTemplate });
}

function runtimeIdentity(value: Record<string, unknown>) {
  if (typeof value.audience !== "string" || !/^https:\/\/[^\s?#]+\/api\/payments\/refunds\/reentry\/admission$/u.test(value.audience)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (typeof value.jobName !== "string" || !/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/jobs\/[a-z0-9-]+$/u.test(value.jobName)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (!matches(value.serviceAccountSubject, /^\d{1,30}$/u)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (typeof value.serviceAccountEmail !== "string" || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/u.test(value.serviceAccountEmail)) throw new RefundAuthorizationError("CONFIG_INVALID");
  return { audience: value.audience, jobName: value.jobName, serviceAccountSubject: value.serviceAccountSubject, serviceAccountEmail: value.serviceAccountEmail };
}

function accountIdentity(value: Record<string, unknown>) {
  if (!identifier(value.mid) || !identifier(value.merchantAccountBindingId) || !identifier(value.credentialGenerationBindingId)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (typeof value.secretResource !== "string" || !/^projects\/[a-z0-9-]+\/secrets\/[A-Za-z0-9_-]+$/u.test(value.secretResource)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (typeof value.secretVersion !== "string" || !/^[1-9]\d*$/u.test(value.secretVersion)) throw new RefundAuthorizationError("CONFIG_INVALID");
  return { mid: value.mid, merchantAccountBindingId: value.merchantAccountBindingId,
    credentialGenerationBindingId: value.credentialGenerationBindingId, secretResource: value.secretResource, secretVersion: value.secretVersion };
}

function validateTaskTemplate(template: Record<string, unknown>, serviceAccount: string): void {
  const valid = [template.serviceAccount === serviceAccount, template.maxRetries === 0, template.timeout === "180s"];
  if (!valid.every(Boolean) || !Array.isArray(template.containers) || template.containers.length !== 1) throw new RefundAuthorizationError("CONFIG_INVALID");
  validateContainer(template.containers[0]);
}

function validateContainer(container: unknown): void {
  if (!record(container) || typeof container.image !== "string" || !/@sha256:[0-9a-f]{64}$/u.test(container.image)) throw new RefundAuthorizationError("CONFIG_INVALID");
  if (!Array.isArray(container.env)) throw new RefundAuthorizationError("CONFIG_INVALID");
  const selectors = container.env.filter((entry: unknown) => record(entry) && entry.name === "MIRA_REFUND_AUTHORIZATION_ID");
  if (selectors.length !== 1 || !record(selectors[0]) || selectors[0].value !== "${GRANT_ID}") throw new RefundAuthorizationError("CONFIG_INVALID");
}

export function templateForGrant(release: RefundReentryRelease, grantId: string): unknown {
  if (!identifier(grantId)) throw new RefundAuthorizationError("INVALID_INPUT");
  const template = release.executionTemplate;
  if (!Array.isArray(template.containers)) throw new RefundAuthorizationError("CONFIG_INVALID");
  return { ...template, containers: template.containers.map((container: unknown) => {
    if (!record(container) || !Array.isArray(container.env)) throw new RefundAuthorizationError("CONFIG_INVALID");
    return { ...container, env: container.env.map((entry: unknown) => (
      record(entry) && entry.name === "MIRA_REFUND_AUTHORIZATION_ID" ? { ...entry, value: grantId } : entry
    )) };
  }) };
}

export function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item: unknown, i) => sameJson(item, right[i]));
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
