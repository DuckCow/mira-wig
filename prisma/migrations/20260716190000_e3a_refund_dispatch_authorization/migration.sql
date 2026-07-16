BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionCommand"
    WHERE "status" = 'LEASED'
  ) THEN
    RAISE EXCEPTION 'Refund dispatch-attempt migration requires zero pre-existing LEASED commands.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionCommand"
    WHERE "dispatchAttempt" > 0
  ) THEN
    RAISE EXCEPTION 'Refund dispatch-attempt migration requires zero positive dispatch ordinals.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionEvidence"
  ) THEN
    RAISE EXCEPTION 'Refund dispatch-attempt migration requires zero execution evidence rows.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundAttempt"
    WHERE "providerRefundId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Refund dispatch-attempt migration requires zero provider refund identities.';
  END IF;
END
$$;

CREATE TYPE "RefundExecutionDispatchAttemptState" AS ENUM (
  'AUTHORIZED',
  'CONTACT_MAY_HAVE_OCCURRED'
);

CREATE TABLE "RefundExecutionDispatchAttempt" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "leaseGeneration" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "providerOperationKey" VARCHAR(512) NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "state" "RefundExecutionDispatchAttemptState" NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "contactMarkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundExecutionDispatchAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundExecutionDispatchAttempt_ordinal_positive_check" CHECK (
        "ordinal" >= 1
    ),
    CONSTRAINT "RefundExecutionDispatchAttempt_lease_generation_positive_check" CHECK (
        "leaseGeneration" >= 1
    ),
    CONSTRAINT "RefundExecutionDispatchAttempt_provider_operation_key_nonblank_check" CHECK (
        btrim("providerOperationKey") <> ''
    ),
    CONSTRAINT "RefundExecutionDispatchAttempt_request_fingerprint_format_check" CHECK (
        "requestFingerprint" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "RefundExecutionDispatchAttempt_state_contact_coherence_check" CHECK (
        (
            "state" = 'AUTHORIZED'::"RefundExecutionDispatchAttemptState"
            AND "contactMarkedAt" IS NULL
        )
        OR
        (
            "state" = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState"
            AND "contactMarkedAt" IS NOT NULL
            AND "contactMarkedAt" >= "authorizedAt"
        )
    )
);

CREATE UNIQUE INDEX "RefundExecutionDispatchAttempt_commandId_ordinal_key"
ON "RefundExecutionDispatchAttempt"("commandId", "ordinal");

ALTER TABLE "RefundExecutionDispatchAttempt"
ADD CONSTRAINT "RefundExecutionDispatchAttempt_commandId_fkey"
FOREIGN KEY ("commandId") REFERENCES "RefundExecutionCommand"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
