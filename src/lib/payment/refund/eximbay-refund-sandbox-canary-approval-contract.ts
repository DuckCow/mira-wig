import { createHash } from "node:crypto";

export const EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION =
  "mira-refund-eximbay-sandbox-canary-approval/v1";
export const EXIMBAY_REFUND_SANDBOX_CANARY_EVIDENCE_VERSION =
  "mira-refund-eximbay-sandbox-canary-evidence/v1";

const DIGEST = /^[0-9a-f]{64}$/u;

export type EximbayRefundSandboxCanaryEvidence = Readonly<{
  formatVersion: typeof EXIMBAY_REFUND_SANDBOX_CANARY_EVIDENCE_VERSION;
  provider: "EXIMBAY";
  mode: "SANDBOX";
  trigger: "MANUAL_ONLY";
  intendedExecutionLimit: 1;
  releaseBindingDigest: string;
  canaryJobBindingDigest: string;
  preflightJobBindingDigest: string;
  imageBindingDigest: string;
  secretGenerationBindingDigest: string;
  targetBindingDigest: string;
}>;

export type EximbayRefundSandboxCanaryEvaluation = Readonly<{
  ok: boolean;
  code: "EVIDENCE_ACCEPTED" | "EVIDENCE_REJECTED";
  approvalEvidenceDigest: string | null;
  executionAuthorization: "NOT_ISSUED";
}>;

export function evaluateEximbayRefundSandboxCanaryEvidence(
  value: unknown,
): EximbayRefundSandboxCanaryEvaluation {
  if (!isExactEvidence(value)) return rejected();
  return Object.freeze({
    ok: true,
    code: "EVIDENCE_ACCEPTED",
    approvalEvidenceDigest: createHash("sha256")
      .update(JSON.stringify(canonicalEvidence(value)), "utf8")
      .digest("hex"),
    executionAuthorization: "NOT_ISSUED",
  });
}

function isExactEvidence(value: unknown): value is EximbayRefundSandboxCanaryEvidence {
  if (!isRecord(value)) return false;
  const record = value;
  const keys = Object.keys(record).sort();
  const expected = [
    "canaryJobBindingDigest", "formatVersion", "imageBindingDigest",
    "intendedExecutionLimit", "mode", "preflightJobBindingDigest", "provider",
    "releaseBindingDigest", "secretGenerationBindingDigest", "targetBindingDigest", "trigger",
  ].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) return false;
  if (!evidenceDiscriminantsMatch(record)) return false;
  return evidenceDigests(record).every(isDigest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function evidenceDiscriminantsMatch(record: Readonly<Record<string, unknown>>): boolean {
  return [
    record.formatVersion === EXIMBAY_REFUND_SANDBOX_CANARY_EVIDENCE_VERSION,
    record.provider === "EXIMBAY",
    record.mode === "SANDBOX",
    record.trigger === "MANUAL_ONLY",
    record.intendedExecutionLimit === 1,
  ].every(Boolean);
}

function evidenceDigests(record: Readonly<Record<string, unknown>>): readonly unknown[] {
  return [record.releaseBindingDigest, record.canaryJobBindingDigest,
    record.preflightJobBindingDigest, record.imageBindingDigest,
    record.secretGenerationBindingDigest, record.targetBindingDigest];
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function canonicalEvidence(value: EximbayRefundSandboxCanaryEvidence): unknown {
  return [
    value.formatVersion, value.provider, value.mode, value.trigger,
    value.intendedExecutionLimit, value.releaseBindingDigest,
    value.canaryJobBindingDigest, value.preflightJobBindingDigest,
    value.imageBindingDigest, value.secretGenerationBindingDigest,
    value.targetBindingDigest,
  ];
}

function rejected(): EximbayRefundSandboxCanaryEvaluation {
  return Object.freeze({
    ok: false,
    code: "EVIDENCE_REJECTED",
    approvalEvidenceDigest: null,
    executionAuthorization: "NOT_ISSUED",
  });
}
