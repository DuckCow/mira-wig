BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionDispatchAttempt"
    WHERE "provider" = 'TOSS'::"PaymentProvider"
  ) THEN
    RAISE EXCEPTION 'Toss refund binding migration requires zero Toss dispatch rows.';
  END IF;
END
$$;

CREATE TABLE "RefundExecutionProviderOperationBinding" (
    "id" TEXT NOT NULL,
    "refundAttemptId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "providerOperationKey" VARCHAR(300) NOT NULL,
    "operationKeyAlgorithmVersion" VARCHAR(64) NOT NULL,
    "wireContractVersion" VARCHAR(64) NOT NULL,
    "wireRequestFingerprint" VARCHAR(64) NOT NULL,
    "merchantAccountBindingId" VARCHAR(64) NOT NULL,
    "credentialGenerationBindingId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundProviderBinding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundProviderBinding_provider_toss_check" CHECK (
        "provider" = 'TOSS'::"PaymentProvider"
    ),
    CONSTRAINT "RefundProviderBinding_mode_sandbox_check" CHECK (
        "mode" = 'SANDBOX'::"PaymentMode"
    ),
    CONSTRAINT "RefundProviderBinding_operation_key_format_check" CHECK (
        "providerOperationKey" ~ '^toss-refund-v1-[0-9a-f]{64}$'
    ),
    CONSTRAINT "RefundProviderBinding_algorithm_version_check" CHECK (
        "operationKeyAlgorithmVersion" = 'toss-refund-v1'
    ),
    CONSTRAINT "RefundProviderBinding_wire_version_check" CHECK (
        "wireContractVersion" = 'refund-provider-toss-wire/v1'
    ),
    CONSTRAINT "RefundProviderBinding_wire_fingerprint_check" CHECK (
        "wireRequestFingerprint" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "RefundProviderBinding_merchant_label_check" CHECK (
        "merchantAccountBindingId" ~ '^[A-Za-z0-9._-]{1,64}$'
    ),
    CONSTRAINT "RefundProviderBinding_generation_label_check" CHECK (
        "credentialGenerationBindingId" ~ '^[A-Za-z0-9._-]{1,64}$'
    )
);

CREATE TABLE "RefundExecutionProviderEligibilityProof" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
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

    CONSTRAINT "RefundEligibilityProof_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundEligibilityProof_payment_key_check" CHECK (
        btrim("paymentKey") <> '' AND "paymentKey" !~ '[[:cntrl:]]'
    ),
    CONSTRAINT "RefundEligibilityProof_method_check" CHECK (
        "method" = '카드'
    ),
    CONSTRAINT "RefundEligibilityProof_easy_pay_check" CHECK (
        "easyPayPresent" = false
    ),
    CONSTRAINT "RefundEligibilityProof_currency_check" CHECK (
        "currency" = 'KRW'
    ),
    CONSTRAINT "RefundEligibilityProof_status_check" CHECK (
        "providerStatus" = 'DONE'
    ),
    CONSTRAINT "RefundEligibilityProof_total_positive_check" CHECK (
        "totalAmount" >= 1
    ),
    CONSTRAINT "RefundEligibilityProof_balance_positive_check" CHECK (
        "balanceAmount" >= 1
    ),
    CONSTRAINT "RefundEligibilityProof_tax_free_zero_check" CHECK (
        "taxFreeAmount" = 0
    ),
    CONSTRAINT "RefundEligibilityProof_tax_exempt_zero_check" CHECK (
        "taxExemptionAmount" = 0
    ),
    CONSTRAINT "RefundEligibilityProof_cancels_zero_check" CHECK (
        "cancelsCount" = 0
    ),
    CONSTRAINT "RefundEligibilityProof_fingerprint_check" CHECK (
        "eligibilityFingerprint" ~ '^[0-9a-f]{64}$'
    )
);

CREATE UNIQUE INDEX "RefundProviderBinding_refundAttempt_key"
ON "RefundExecutionProviderOperationBinding"("refundAttemptId");

CREATE UNIQUE INDEX "RefundProviderBinding_operationKey_key"
ON "RefundExecutionProviderOperationBinding"("providerOperationKey");

CREATE UNIQUE INDEX "RefundEligibilityProof_binding_key"
ON "RefundExecutionProviderEligibilityProof"("bindingId");

ALTER TABLE "RefundExecutionProviderOperationBinding"
ADD CONSTRAINT "RefundProviderBinding_refundAttempt_fkey"
FOREIGN KEY ("refundAttemptId") REFERENCES "RefundAttempt"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefundExecutionProviderEligibilityProof"
ADD CONSTRAINT "RefundEligibilityProof_binding_fkey"
FOREIGN KEY ("bindingId") REFERENCES "RefundExecutionProviderOperationBinding"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
