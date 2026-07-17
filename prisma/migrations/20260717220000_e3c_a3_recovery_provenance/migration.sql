BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionDispatchAttempt" dispatch
    JOIN "RefundExecutionCommand" command ON command."id" = dispatch."commandId"
    JOIN "RefundAttempt" attempt ON attempt."id" = command."refundAttemptId"
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
      AND dispatch."ordinal" > 1
  ) THEN
    RAISE EXCEPTION 'Toss recovery-provenance migration requires zero higher dispatch ordinals.';
  END IF;

  IF EXISTS (
    SELECT evidence."commandId"
    FROM "RefundExecutionEvidence" evidence
    JOIN "RefundExecutionCommand" command ON command."id" = evidence."commandId"
    JOIN "RefundAttempt" attempt ON attempt."id" = command."refundAttemptId"
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
      AND evidence."outcome" = 'SUCCEEDED'::"RefundExecutionEvidenceOutcome"
      AND evidence."application" = 'APPLIED'::"RefundExecutionEvidenceApplication"
    GROUP BY evidence."commandId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Toss recovery-provenance migration rejects multiple applied success authorities.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionDispatchAttempt" dispatch
    JOIN "RefundExecutionCommand" command ON command."id" = dispatch."commandId"
    JOIN "RefundAttempt" attempt ON attempt."id" = command."refundAttemptId"
    LEFT JOIN "RefundExecutionProviderContactEligibilityProof" proof
      ON proof."dispatchAttemptId" = dispatch."id"
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
      AND dispatch."state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
      AND proof."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Toss recovery-provenance migration rejects contacted dispatch without proof.';
  END IF;

  IF EXISTS (
    SELECT attempt."orderId"
    FROM "RefundAttempt" attempt
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
      AND attempt."providerRefundId" IS NOT NULL
    GROUP BY attempt."orderId"
    HAVING count(DISTINCT attempt."providerRefundId") > 1
  ) THEN
    RAISE EXCEPTION 'Toss recovery-provenance migration rejects conflicting provider identities.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionDispatchAttempt" dispatch
    JOIN "RefundExecutionCommand" command ON command."id" = dispatch."commandId"
    JOIN "RefundAttempt" attempt ON attempt."id" = command."refundAttemptId"
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
      AND dispatch."state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
  ) THEN
    RAISE EXCEPTION 'Toss recovery-provenance migration requires zero contacted dispatch rows.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionEvidence" evidence
    JOIN "RefundExecutionCommand" command ON command."id" = evidence."commandId"
    JOIN "RefundAttempt" attempt ON attempt."id" = command."refundAttemptId"
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
  ) THEN
    RAISE EXCEPTION 'Toss recovery-provenance migration requires zero Toss evidence rows.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundAttempt"
    WHERE "provider" = 'TOSS'::"PaymentProvider"
      AND "providerRefundId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Toss recovery-provenance migration requires zero Toss provider refund identities.';
  END IF;
END
$$;

ALTER TYPE "RefundExecutionCommandEventType" ADD VALUE 'RECOVERY_LEASE_ACQUIRED';

ALTER TABLE "RefundExecutionEvidence"
ADD COLUMN "dispatchAttemptId" TEXT,
ADD COLUMN "authorizingLeaseGeneration" INTEGER,
ADD CONSTRAINT "RefundEvidence_authorizing_generation_check" CHECK (
  "authorizingLeaseGeneration" IS NULL OR "authorizingLeaseGeneration" >= 1
);

CREATE INDEX "RefundEvidence_dispatch_idx"
ON "RefundExecutionEvidence"("dispatchAttemptId");

ALTER TABLE "RefundExecutionEvidence"
ADD CONSTRAINT "RefundEvidence_dispatch_fkey"
FOREIGN KEY ("dispatchAttemptId") REFERENCES "RefundExecutionDispatchAttempt"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
