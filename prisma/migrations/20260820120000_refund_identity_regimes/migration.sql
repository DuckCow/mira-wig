BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionProviderOperationBinding"
    WHERE NOT (
      "provider" = 'TOSS'::"PaymentProvider"
      AND "mode" = 'SANDBOX'::"PaymentMode"
      AND "providerOperationKey" ~ '^toss-refund-v1-[0-9a-f]{64}$'
      AND "operationKeyAlgorithmVersion" = 'toss-refund-v1'
      AND "wireContractVersion" = 'refund-provider-toss-wire/v1'
      AND "wireRequestFingerprint" ~ '^[0-9a-f]{64}$'
      AND "merchantAccountBindingId" ~ '^[A-Za-z0-9._-]{1,64}$'
      AND "credentialGenerationBindingId" ~ '^[A-Za-z0-9._-]{1,64}$'
    )
  ) THEN
    RAISE EXCEPTION 'Refund identity-regime migration requires every historical binding to satisfy the installed Toss tuple.';
  END IF;
END
$$;

ALTER TABLE "RefundExecutionProviderOperationBinding"
DROP CONSTRAINT "RefundProviderBinding_provider_toss_check",
DROP CONSTRAINT "RefundProviderBinding_mode_sandbox_check",
DROP CONSTRAINT "RefundProviderBinding_operation_key_format_check",
DROP CONSTRAINT "RefundProviderBinding_algorithm_version_check",
DROP CONSTRAINT "RefundProviderBinding_wire_version_check",
ADD CONSTRAINT "RefundProviderBinding_provider_toss_check" CHECK (
  "provider" IN ('TOSS'::"PaymentProvider", 'EXIMBAY'::"PaymentProvider")
),
ADD CONSTRAINT "RefundProviderBinding_mode_sandbox_check" CHECK (
  "mode" = 'SANDBOX'::"PaymentMode"
),
ADD CONSTRAINT "RefundProviderBinding_operation_key_format_check" CHECK (
  (
    "provider" = 'TOSS'::"PaymentProvider"
    AND "providerOperationKey" ~ '^toss-refund-v1-[0-9a-f]{64}$'
  )
  OR
  (
    "provider" = 'EXIMBAY'::"PaymentProvider"
    AND "providerOperationKey" ~ '^eximbay-refund-family-v1-[0-9a-f]{64}$'
  )
),
ADD CONSTRAINT "RefundProviderBinding_algorithm_version_check" CHECK (
  (
    "provider" = 'TOSS'::"PaymentProvider"
    AND "operationKeyAlgorithmVersion" = 'toss-refund-v1'
  )
  OR
  (
    "provider" = 'EXIMBAY'::"PaymentProvider"
    AND "operationKeyAlgorithmVersion" = 'eximbay-refund-family-v1'
  )
),
ADD CONSTRAINT "RefundProviderBinding_wire_version_check" CHECK (
  (
    "provider" = 'TOSS'::"PaymentProvider"
    AND "wireContractVersion" = 'refund-provider-toss-wire/v1'
  )
  OR
  (
    "provider" = 'EXIMBAY'::"PaymentProvider"
    AND "wireContractVersion" = 'refund-provider-eximbay-cancel-wire/v1'
  )
);

CREATE UNIQUE INDEX "RefundDispatch_eximbay_operation_key_key"
ON "RefundExecutionDispatchAttempt"("providerOperationKey")
WHERE "provider" = 'EXIMBAY'::"PaymentProvider";

COMMIT;
