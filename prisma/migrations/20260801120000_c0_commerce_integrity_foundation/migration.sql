BEGIN;

-- C0 has no trustworthy historical parent or provider-contact evidence. Fail before
-- the first authoritative mutation instead of reconstructing history from mutable rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Payment"
    WHERE "status" IN ('INITIATED', 'AWAITING', 'SUCCEEDED')
    GROUP BY "checkoutSessionId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'C0 migration blocked: duplicate legacy blocking payment attempts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Payment"
    WHERE "status" IN ('INITIATED', 'AWAITING')
       OR "providerRef" IS NOT NULL
       OR "providerPaymentKey" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'C0 migration blocked: legacy provider-contact outcome cannot be classified safely';
  END IF;

  IF EXISTS (SELECT 1 FROM "Payment") THEN
    RAISE EXCEPTION 'C0 migration blocked: legacy payment lifecycle cannot be classified safely';
  END IF;

  IF EXISTS (SELECT 1 FROM "CheckoutSessionLine")
     OR EXISTS (SELECT 1 FROM "OrderItem") THEN
    RAISE EXCEPTION 'C0 migration blocked: historical style identity is unavailable';
  END IF;
END
$$;

-- The zero-row precondition makes these required identities safe without a backfill.
ALTER TABLE "CheckoutSessionLine" ADD COLUMN "wigStyleId" TEXT NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN "wigStyleId" TEXT NOT NULL;

CREATE TYPE "PaymentAttemptLifecycle" AS ENUM (
  'CONTACT_AUTHORIZED',
  'CONTACTED',
  'OUTCOME_UNKNOWN',
  'SUPERSEDED',
  'TERMINAL_FAILURE',
  'SUSPENDED',
  'FINALIZED',
  'TERMINAL_REMEDIATED'
);

CREATE TYPE "PaymentInitiationOutputKind" AS ENUM ('READY', 'REDIRECT');

CREATE TYPE "PaymentRemediationStatus" AS ENUM (
  'NONE',
  'REQUIRED',
  'PENDING',
  'RECONCILIATION_REQUIRED',
  'REMEDIATED'
);

CREATE TYPE "PaymentRemediationOperation" AS ENUM (
  'VOID',
  'CANCEL',
  'REVERSAL',
  'REFUND',
  'MANUAL_RECONCILIATION'
);

ALTER TABLE "Payment"
  ADD COLUMN "routingRuleId" TEXT,
  ADD COLUMN "attemptLifecycle" "PaymentAttemptLifecycle" NOT NULL,
  ADD COLUMN "remediationStatus" "PaymentRemediationStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "contactIntentAt" TIMESTAMP(3),
  ADD COLUMN "contactStartedAt" TIMESTAMP(3),
  ADD COLUMN "initiationOutputKind" "PaymentInitiationOutputKind",
  ADD COLUMN "initiationApproveUrl" TEXT,
  ADD COLUMN "initiationCompletedAt" TIMESTAMP(3),
  ADD COLUMN "financialSucceededAt" TIMESTAMP(3),
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD COLUMN "blockingEndedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedByPaymentId" TEXT,
  ADD COLUMN "remediationOperation" "PaymentRemediationOperation",
  ADD COLUMN "remediationResultRef" TEXT,
  ADD COLUMN "remediatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Payment_checkoutSessionId_id_key"
ON "Payment"("checkoutSessionId", "id");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_checkoutSessionId_suspendedByPaymentId_fkey"
    FOREIGN KEY ("checkoutSessionId", "suspendedByPaymentId")
    REFERENCES "Payment"("checkoutSessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_money_evidence_check" CHECK (
    "amount" >= 0
    AND "currency" ~ '^[A-Z]{3}$'
  ),
  ADD CONSTRAINT "Payment_attempt_lifecycle_evidence_check" CHECK (
    (
      "attemptLifecycle" = 'CONTACT_AUTHORIZED'
      AND "status" = 'INITIATED'
      AND "routingRuleId" IS NOT NULL
      AND "idempotencyKey" IS NOT NULL
      AND "contactIntentAt" IS NOT NULL
      AND "contactStartedAt" IS NULL
      AND "initiationOutputKind" IS NULL
      AND "initiationApproveUrl" IS NULL
      AND "initiationCompletedAt" IS NULL
      AND "providerRef" IS NULL
      AND "providerPaymentKey" IS NULL
      AND "financialSucceededAt" IS NULL
      AND "blockingEndedAt" IS NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "attemptLifecycle" IN ('CONTACTED', 'OUTCOME_UNKNOWN')
      AND "contactIntentAt" IS NOT NULL
      AND "contactStartedAt" IS NOT NULL
      AND "blockingEndedAt" IS NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "attemptLifecycle" = 'SUPERSEDED'
      AND "supersededAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
      AND (
        (
          "remediationStatus" = 'NONE'
          AND "status" = 'INITIATED'
          AND "contactStartedAt" IS NULL
          AND "providerRef" IS NULL
          AND "providerPaymentKey" IS NULL
          AND "initiationOutputKind" IS NULL
          AND "initiationApproveUrl" IS NULL
          AND "initiationCompletedAt" IS NULL
          AND "financialSucceededAt" IS NULL
          AND "blockingEndedAt" IS NOT NULL
        )
        OR ("remediationStatus" <> 'NONE' AND "blockingEndedAt" IS NULL)
      )
    ) OR (
      "attemptLifecycle" = 'TERMINAL_FAILURE'
      AND "status" = 'FAILED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "attemptLifecycle" = 'SUSPENDED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NOT NULL
    ) OR (
      "attemptLifecycle" = 'FINALIZED'
      AND "status" = 'SUCCEEDED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
    ) OR (
      "attemptLifecycle" = 'TERMINAL_REMEDIATED'
      AND "status" = 'VOIDED'
      AND "blockingEndedAt" IS NOT NULL
      AND "suspendedByPaymentId" IS NULL
    )
  ),
  ADD CONSTRAINT "Payment_initiation_output_evidence_check" CHECK (
    ("initiationOutputKind" IS NULL AND "initiationApproveUrl" IS NULL AND "initiationCompletedAt" IS NULL)
    OR (
      "initiationOutputKind" = 'READY'
      AND "initiationApproveUrl" IS NULL
      AND "initiationCompletedAt" IS NOT NULL
      AND "contactStartedAt" IS NOT NULL
    )
    OR (
      "initiationOutputKind" = 'REDIRECT'
      AND "initiationApproveUrl" IS NOT NULL
      AND "initiationCompletedAt" IS NOT NULL
      AND "contactStartedAt" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "Payment_financial_success_evidence_check" CHECK (
    (
      "status" IN ('SUCCEEDED', 'VOIDED')
      AND "providerPaymentKey" IS NOT NULL
      AND "financialSucceededAt" IS NOT NULL
    ) OR (
      "status" NOT IN ('SUCCEEDED', 'VOIDED')
      AND "financialSucceededAt" IS NULL
    )
  ),
  ADD CONSTRAINT "Payment_financial_success_release_check" CHECK (
    "status" NOT IN ('SUCCEEDED', 'VOIDED')
    OR "blockingEndedAt" IS NULL
    OR "attemptLifecycle" = 'FINALIZED'
    OR "remediationStatus" IN ('REQUIRED', 'PENDING', 'RECONCILIATION_REQUIRED', 'REMEDIATED')
  ),
  ADD CONSTRAINT "Payment_terminal_lifecycle_check" CHECK (
    ("status" = 'FAILED') = ("attemptLifecycle" = 'TERMINAL_FAILURE')
    AND ("status" = 'VOIDED') = ("attemptLifecycle" = 'TERMINAL_REMEDIATED')
    AND ("status" <> 'VOIDED' OR "remediationStatus" = 'REMEDIATED')
    AND ("suspendedByPaymentId" IS NULL OR "suspendedByPaymentId" <> "id")
  ),
  ADD CONSTRAINT "Payment_remediation_evidence_check" CHECK (
    (
      "remediationStatus" = 'NONE'
      AND "remediationOperation" IS NULL
      AND "remediationResultRef" IS NULL
      AND "remediatedAt" IS NULL
    ) OR (
      "remediationStatus" IN ('REQUIRED', 'PENDING', 'RECONCILIATION_REQUIRED')
      AND "status" = 'SUCCEEDED'
      AND "remediationOperation" IS NULL
      AND "remediationResultRef" IS NULL
      AND "remediatedAt" IS NULL
    ) OR (
      "remediationStatus" = 'REMEDIATED'
      AND "status" = 'VOIDED'
      AND "remediationOperation" IS NOT NULL
      AND "remediationResultRef" IS NOT NULL
      AND "remediatedAt" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "Payment_remediation_blocking_check" CHECK (
    "remediationStatus" IN ('NONE', 'REMEDIATED')
    OR "blockingEndedAt" IS NULL
    OR ("attemptLifecycle" = 'SUSPENDED' AND "suspendedByPaymentId" IS NOT NULL)
  );

-- WigVariant identity includes its original parent. Reparenting requires a new row/id.
CREATE FUNCTION "prevent_wig_variant_parent_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."wigStyleId" IS DISTINCT FROM OLD."wigStyleId" THEN
    RAISE EXCEPTION 'WigVariant.wigStyleId is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "WigVariant_parent_immutable"
BEFORE UPDATE OF "wigStyleId" ON "WigVariant"
FOR EACH ROW
EXECUTE FUNCTION "prevent_wig_variant_parent_change"();

-- Every row with an open blocking interval competes for the one session slot.
CREATE UNIQUE INDEX "Payment_one_blocking_attempt_per_session_key"
ON "Payment"("checkoutSessionId")
WHERE "blockingEndedAt" IS NULL;

CREATE INDEX "Payment_checkoutSessionId_attemptLifecycle_idx"
ON "Payment"("checkoutSessionId", "attemptLifecycle");

CREATE INDEX "Payment_suspendedByPaymentId_idx"
ON "Payment"("suspendedByPaymentId");

COMMIT;
