BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionDispatchAttempt" dispatch
    JOIN "RefundExecutionCommand" command ON command."id" = dispatch."commandId"
    JOIN "RefundAttempt" attempt ON attempt."id" = command."refundAttemptId"
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
      AND dispatch."state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
  ) THEN
    RAISE EXCEPTION 'Toss contact-proof migration requires zero contacted Toss dispatch rows.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionEvidence" evidence
    JOIN "RefundExecutionCommand" command ON command."id" = evidence."commandId"
    JOIN "RefundAttempt" attempt ON attempt."id" = command."refundAttemptId"
    WHERE attempt."provider" = 'TOSS'::"PaymentProvider"
  ) THEN
    RAISE EXCEPTION 'Toss contact-proof migration requires zero Toss execution evidence rows.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundAttempt"
    WHERE "provider" = 'TOSS'::"PaymentProvider"
      AND "providerRefundId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Toss contact-proof migration requires zero Toss provider refund identities.';
  END IF;
END
$$;

CREATE TABLE "RefundExecutionProviderContactEligibilityProof" (
    "id" TEXT NOT NULL,
    "dispatchAttemptId" TEXT NOT NULL,
    "paymentKey" VARCHAR(200) NOT NULL,
    "method" VARCHAR(64) NOT NULL,
    "easyPayPresent" BOOLEAN NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "providerStatus" VARCHAR(32) NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "balanceAmount" INTEGER NOT NULL,
    "taxFreeAmount" INTEGER NOT NULL,
    "taxExemptionAmount" INTEGER NOT NULL,
    "cancelsCount" INTEGER NOT NULL,
    "localReceivedAt" TIMESTAMP(3) NOT NULL,
    "eligibilityFingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundContactProof_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundContactProof_payment_key_check" CHECK (
        btrim("paymentKey") <> '' AND "paymentKey" !~ '[[:cntrl:]]'
    ),
    CONSTRAINT "RefundContactProof_method_check" CHECK ("method" = '카드'),
    CONSTRAINT "RefundContactProof_easy_pay_check" CHECK ("easyPayPresent" = false),
    CONSTRAINT "RefundContactProof_currency_check" CHECK ("currency" = 'KRW'),
    CONSTRAINT "RefundContactProof_status_check" CHECK ("providerStatus" = 'DONE'),
    CONSTRAINT "RefundContactProof_total_positive_check" CHECK ("totalAmount" >= 1),
    CONSTRAINT "RefundContactProof_balance_positive_check" CHECK ("balanceAmount" >= 1),
    CONSTRAINT "RefundContactProof_tax_free_zero_check" CHECK ("taxFreeAmount" = 0),
    CONSTRAINT "RefundContactProof_tax_exempt_zero_check" CHECK ("taxExemptionAmount" = 0),
    CONSTRAINT "RefundContactProof_cancels_zero_check" CHECK ("cancelsCount" = 0),
    CONSTRAINT "RefundContactProof_fingerprint_check" CHECK (
        "eligibilityFingerprint" ~ '^[0-9a-f]{64}$'
    )
);

CREATE UNIQUE INDEX "RefundContactProof_dispatch_key"
ON "RefundExecutionProviderContactEligibilityProof"("dispatchAttemptId");

ALTER TABLE "RefundExecutionProviderContactEligibilityProof"
ADD CONSTRAINT "RefundContactProof_dispatch_fkey"
FOREIGN KEY ("dispatchAttemptId") REFERENCES "RefundExecutionDispatchAttempt"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
