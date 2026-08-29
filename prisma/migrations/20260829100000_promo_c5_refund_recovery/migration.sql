BEGIN;

ALTER TABLE "PromotionPolicyVersion"
  ADD COLUMN "recoveryGraceDays" INTEGER,
  ADD CONSTRAINT "PromotionPolicyVersion_recovery_grace_check"
    CHECK ("recoveryGraceDays" IS NULL OR "recoveryGraceDays" > 0);

ALTER TABLE "PromotionGrant"
  ADD COLUMN "recoveredFromGrantId" TEXT,
  ADD COLUMN "recoveryEligibleAt" TIMESTAMP(3),
  ADD CONSTRAINT "PromotionGrant_recovery_pair_check" CHECK (
    ("recoveredFromGrantId" IS NULL AND "recoveryEligibleAt" IS NULL)
    OR ("recoveredFromGrantId" IS NOT NULL AND "recoveryEligibleAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "PromotionGrant_recovery_not_self_check"
    CHECK ("recoveredFromGrantId" IS NULL OR "recoveredFromGrantId" <> "id"),
  ADD CONSTRAINT "PromotionGrant_recovery_key_check" CHECK (
    "recoveredFromGrantId" IS NULL
    OR "grantKey" = 'recovery:' || "recoveredFromGrantId"
  );

CREATE UNIQUE INDEX "PromotionGrant_recoveredFromGrantId_key"
ON "PromotionGrant"("recoveredFromGrantId");

ALTER TABLE "PromotionGrant"
  ADD CONSTRAINT "PromotionGrant_recoveredFromGrantId_fkey"
    FOREIGN KEY ("recoveredFromGrantId") REFERENCES "PromotionGrant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RefundAttemptLineEconomicAllocation" (
  "refundAttemptId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "merchandiseRefundAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RefundAttemptLineEconomicAllocation_pkey"
    PRIMARY KEY ("refundAttemptId", "orderItemId"),
  CONSTRAINT "RefundAttemptLineEconomicAllocation_amount_nonnegative_check"
    CHECK ("merchandiseRefundAmount" >= 0),
  CONSTRAINT "RefundAttemptLineEconomicAllocation_refundAttemptId_fkey"
    FOREIGN KEY ("refundAttemptId") REFERENCES "RefundAttempt"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RefundAttemptLineEconomicAllocation_refundAttemptId_orderI_fkey"
    FOREIGN KEY ("refundAttemptId", "orderItemId")
    REFERENCES "RefundAttemptLine"("refundAttemptId", "orderItemId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE FUNCTION "protect_refund_line_economic_allocation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Refund line economic allocation is immutable';
END
$$;

CREATE TRIGGER "RefundAttemptLineEconomicAllocation_immutable"
BEFORE UPDATE OR DELETE ON "RefundAttemptLineEconomicAllocation"
FOR EACH ROW EXECUTE FUNCTION "protect_refund_line_economic_allocation"();

CREATE FUNCTION "protect_promotion_grant_recovery_identity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."recoveredFromGrantId" IS NOT NULL OR EXISTS (
      SELECT 1 FROM "PromotionGrant" WHERE "recoveredFromGrantId" = OLD."id"
    ) THEN
      RAISE EXCEPTION 'Promotion grant recovery provenance is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."recoveredFromGrantId" IS DISTINCT FROM OLD."recoveredFromGrantId"
    OR NEW."recoveryEligibleAt" IS DISTINCT FROM OLD."recoveryEligibleAt"
  THEN
    RAISE EXCEPTION 'Promotion grant recovery provenance is immutable';
  END IF;

  IF OLD."recoveredFromGrantId" IS NOT NULL AND (
    NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."policyVersionId" IS DISTINCT FROM OLD."policyVersionId"
    OR NEW."grantKey" IS DISTINCT FROM OLD."grantKey"
    OR NEW."benefitYear" IS DISTINCT FROM OLD."benefitYear"
    OR NEW."originMarketCode" IS DISTINCT FROM OLD."originMarketCode"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
  ) THEN
    RAISE EXCEPTION 'Recovered promotion grant identity is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "PromotionGrant_recovery_identity_immutable"
BEFORE UPDATE OR DELETE ON "PromotionGrant"
FOR EACH ROW EXECUTE FUNCTION "protect_promotion_grant_recovery_identity"();

CREATE OR REPLACE FUNCTION "protect_promotion_policy_economics"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_used BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT'::"PromotionPolicyStatus" THEN
      RAISE EXCEPTION 'Promotion policy must be created as DRAFT';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM "PromotionGrant" WHERE "policyVersionId" = OLD."id"
  ) INTO is_used;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT'::"PromotionPolicyStatus" OR is_used THEN
      RAISE EXCEPTION 'Promotion policy history is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'DRAFT'::"PromotionPolicyStatus" AND NEW."status" = 'ACTIVE'::"PromotionPolicyStatus")
      OR (OLD."status" = 'ACTIVE'::"PromotionPolicyStatus" AND NEW."status" = 'RETIRED'::"PromotionPolicyStatus")
    )
  THEN
    RAISE EXCEPTION 'Promotion policy lifecycle transition is invalid';
  END IF;

  IF OLD."status" <> 'DRAFT'::"PromotionPolicyStatus" OR is_used THEN
    IF NEW."programKey" IS DISTINCT FROM OLD."programKey"
      OR NEW."version" IS DISTINCT FROM OLD."version"
      OR NEW."kind" IS DISTINCT FROM OLD."kind"
      OR NEW."startsAt" IS DISTINCT FROM OLD."startsAt"
      OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
      OR NEW."firstOrderOnly" IS DISTINCT FROM OLD."firstOrderOnly"
      OR NEW."requiresQualifyingPurchase" IS DISTINCT FROM OLD."requiresQualifyingPurchase"
      OR NEW."grantValidityDays" IS DISTINCT FROM OLD."grantValidityDays"
      OR NEW."recoveryGraceDays" IS DISTINCT FROM OLD."recoveryGraceDays"
      OR NEW."birthdayWindowBeforeDays" IS DISTINCT FROM OLD."birthdayWindowBeforeDays"
      OR NEW."birthdayWindowAfterDays" IS DISTINCT FROM OLD."birthdayWindowAfterDays"
      OR NEW."birthdayLeapDayObservation" IS DISTINCT FROM OLD."birthdayLeapDayObservation"
    THEN
      RAISE EXCEPTION 'Promotion policy economics are immutable after activation or use';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

COMMIT;
