BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionCommand"
    WHERE "status" = 'LEASED'
  ) THEN
    RAISE EXCEPTION 'Refund execution lease fence migration requires zero pre-existing LEASED commands.';
  END IF;
END
$$;

ALTER TABLE "RefundExecutionCommand"
  ADD COLUMN "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseTokenHash" VARCHAR(64);

ALTER TABLE "RefundExecutionCommand"
  DROP CONSTRAINT "RefundExecutionCommand_leased_dispatch_attempt_check",
  DROP CONSTRAINT "RefundExecutionCommand_lease_status_coherence_check";

ALTER TABLE "RefundExecutionCommand"
  ADD CONSTRAINT "RefundExecutionCommand_lease_generation_nonnegative_check" CHECK (
    "leaseGeneration" >= 0
  ),
  ADD CONSTRAINT "RefundExecutionCommand_lease_token_hash_format_check" CHECK (
    "leaseTokenHash" IS NULL OR "leaseTokenHash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "RefundExecutionCommand_lease_status_coherence_check" CHECK (
    (
      "status" = 'LEASED'::"RefundExecutionCommandStatus"
      AND "leaseOwner" IS NOT NULL
      AND "leaseUntil" IS NOT NULL
      AND "leaseTokenHash" IS NOT NULL
      AND "leaseGeneration" >= 1
    )
    OR
    (
      "status" <> 'LEASED'::"RefundExecutionCommandStatus"
      AND "leaseOwner" IS NULL
      AND "leaseUntil" IS NULL
      AND "leaseTokenHash" IS NULL
    )
  );

COMMIT;
