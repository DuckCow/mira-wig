import { createHash } from "node:crypto";
export const S3_TARGET_FINGERPRINT_DOMAIN = "mira-s3-preflight-target/v1";

export type ValidatedS3TargetFingerprintInput = Readonly<{
  scenarioId: "S3";
  paymentKey: string;
  providerOrderId: string;
  amount: number;
  currency: string;
  reference: string;
}>;

export function fingerprintValidatedS3Target(
  fixture: ValidatedS3TargetFingerprintInput,
): string {
  if (fixture.scenarioId !== "S3") throw new Error("S3_FIXTURE_REQUIRED");
  const encoded = `${S3_TARGET_FINGERPRINT_DOMAIN}\0${JSON.stringify({
    paymentKey: fixture.paymentKey,
    providerOrderId: fixture.providerOrderId,
    amount: fixture.amount,
    currency: fixture.currency,
    reference: fixture.reference,
  })}`;
  return createHash("sha256").update(encoded, "utf8").digest("hex");
}
