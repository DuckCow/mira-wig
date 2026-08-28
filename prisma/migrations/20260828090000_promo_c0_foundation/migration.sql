BEGIN;

CREATE TYPE "PromotionKind" AS ENUM ('SIGNUP', 'BIRTHDAY', 'CAMPAIGN');
CREATE TYPE "PromotionPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "BirthdayLeapDayObservation" AS ENUM ('FEB_28', 'MAR_01');

CREATE TABLE "PromotionPolicyVersion" (
  "id" TEXT NOT NULL,
  "programKey" VARCHAR(128) NOT NULL,
  "version" INTEGER NOT NULL,
  "kind" "PromotionKind" NOT NULL,
  "status" "PromotionPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
  "requiresQualifyingPurchase" BOOLEAN NOT NULL DEFAULT false,
  "grantValidityDays" INTEGER,
  "birthdayWindowBeforeDays" INTEGER,
  "birthdayWindowAfterDays" INTEGER,
  "birthdayLeapDayObservation" "BirthdayLeapDayObservation",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PromotionPolicyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionPolicyVersion_program_key_check" CHECK (btrim("programKey") <> ''),
  CONSTRAINT "PromotionPolicyVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "PromotionPolicyVersion_interval_check" CHECK ("endsAt" IS NULL OR "startsAt" < "endsAt"),
  CONSTRAINT "PromotionPolicyVersion_grant_validity_check" CHECK ("grantValidityDays" IS NULL OR "grantValidityDays" > 0),
  CONSTRAINT "PromotionPolicyVersion_birthday_before_check" CHECK ("birthdayWindowBeforeDays" IS NULL OR "birthdayWindowBeforeDays" >= 0),
  CONSTRAINT "PromotionPolicyVersion_birthday_after_check" CHECK ("birthdayWindowAfterDays" IS NULL OR "birthdayWindowAfterDays" >= 0)
);

CREATE TABLE "PromotionMarketRule" (
  "id" TEXT NOT NULL,
  "policyVersionId" TEXT NOT NULL,
  "marketCode" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "rateBps" INTEGER NOT NULL,
  "maximumDiscountMinor" BIGINT NOT NULL,
  "minimumEligibleSubtotalMinor" BIGINT,
  "eligibilityTimeZone" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionMarketRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionMarketRule_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PromotionMarketRule_rate_bps_check" CHECK ("rateBps" BETWEEN 1 AND 10000),
  CONSTRAINT "PromotionMarketRule_maximum_discount_check" CHECK ("maximumDiscountMinor" > 0),
  CONSTRAINT "PromotionMarketRule_minimum_subtotal_check" CHECK (
    "minimumEligibleSubtotalMinor" IS NULL OR "minimumEligibleSubtotalMinor" >= 0
  )
);

CREATE TABLE "CustomerBenefitProfile" (
  "userId" TEXT NOT NULL,
  "birthdayMonth" INTEGER,
  "birthdayDay" INTEGER,
  "birthdaySetAt" TIMESTAMP(3),
  "birthdayUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerBenefitProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "CustomerBenefitProfile_birthday_pair_check" CHECK (
    ("birthdayMonth" IS NULL AND "birthdayDay" IS NULL)
    OR ("birthdayMonth" IS NOT NULL AND "birthdayDay" IS NOT NULL)
  ),
  CONSTRAINT "CustomerBenefitProfile_birthday_month_check" CHECK (
    "birthdayMonth" IS NULL OR "birthdayMonth" BETWEEN 1 AND 12
  ),
  CONSTRAINT "CustomerBenefitProfile_birthday_day_check" CHECK (
    "birthdayDay" IS NULL OR "birthdayDay" BETWEEN 1 AND 31
  ),
  CONSTRAINT "CustomerBenefitProfile_birthday_timestamps_check" CHECK (
    ("birthdayMonth" IS NULL AND "birthdaySetAt" IS NULL AND "birthdayUpdatedAt" IS NULL)
    OR ("birthdayMonth" IS NOT NULL AND "birthdaySetAt" IS NOT NULL AND "birthdayUpdatedAt" IS NOT NULL)
  )
);

CREATE TABLE "PromotionGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "policyVersionId" TEXT NOT NULL,
  "grantKey" VARCHAR(500) NOT NULL,
  "benefitYear" INTEGER,
  "originMarketCode" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionGrant_grant_key_check" CHECK (btrim("grantKey") <> ''),
  CONSTRAINT "PromotionGrant_benefit_year_check" CHECK ("benefitYear" IS NULL OR "benefitYear" > 0),
  CONSTRAINT "PromotionGrant_validity_check" CHECK ("expiresAt" IS NULL OR "validFrom" < "expiresAt")
);

CREATE UNIQUE INDEX "PromotionPolicyVersion_programKey_version_key"
ON "PromotionPolicyVersion"("programKey", "version");

CREATE UNIQUE INDEX "PromotionPolicyVersion_one_active_program_key"
ON "PromotionPolicyVersion"("programKey")
WHERE "status" = 'ACTIVE'::"PromotionPolicyStatus";

CREATE INDEX "PromotionPolicyVersion_kind_status_startsAt_endsAt_idx"
ON "PromotionPolicyVersion"("kind", "status", "startsAt", "endsAt");

CREATE UNIQUE INDEX "PromotionMarketRule_policyVersionId_marketCode_key"
ON "PromotionMarketRule"("policyVersionId", "marketCode");

CREATE INDEX "PromotionMarketRule_marketCode_idx"
ON "PromotionMarketRule"("marketCode");

CREATE UNIQUE INDEX "PromotionGrant_grantKey_key" ON "PromotionGrant"("grantKey");
CREATE INDEX "PromotionGrant_userId_createdAt_idx" ON "PromotionGrant"("userId", "createdAt");
CREATE INDEX "PromotionGrant_policyVersionId_idx" ON "PromotionGrant"("policyVersionId");

ALTER TABLE "PromotionMarketRule"
  ADD CONSTRAINT "PromotionMarketRule_policyVersionId_fkey"
    FOREIGN KEY ("policyVersionId") REFERENCES "PromotionPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PromotionMarketRule_marketCode_fkey"
    FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerBenefitProfile"
  ADD CONSTRAINT "CustomerBenefitProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromotionGrant"
  ADD CONSTRAINT "PromotionGrant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PromotionGrant_policyVersionId_fkey"
    FOREIGN KEY ("policyVersionId") REFERENCES "PromotionPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PromotionGrant_originMarketCode_fkey"
    FOREIGN KEY ("originMarketCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "protect_promotion_policy_economics"()
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

CREATE TRIGGER "PromotionPolicyVersion_economics_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "PromotionPolicyVersion"
FOR EACH ROW EXECUTE FUNCTION "protect_promotion_policy_economics"();

CREATE FUNCTION "protect_promotion_market_rule_economics"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  policy_id TEXT;
  policy_status "PromotionPolicyStatus";
  is_used BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW."policyVersionId" IS DISTINCT FROM OLD."policyVersionId"
  THEN
    RAISE EXCEPTION 'Promotion Market rule policy version is immutable';
  END IF;

  policy_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."policyVersionId" ELSE NEW."policyVersionId" END;
  SELECT "status" INTO policy_status
  FROM "PromotionPolicyVersion"
  WHERE "id" = policy_id
  FOR UPDATE;
  SELECT EXISTS (
    SELECT 1 FROM "PromotionGrant" WHERE "policyVersionId" = policy_id
  ) INTO is_used;

  IF policy_status <> 'DRAFT'::"PromotionPolicyStatus" OR is_used THEN
    RAISE EXCEPTION 'Promotion Market rules are immutable after policy activation or use';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER "PromotionMarketRule_economics_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "PromotionMarketRule"
FOR EACH ROW EXECUTE FUNCTION "protect_promotion_market_rule_economics"();

COMMIT;
