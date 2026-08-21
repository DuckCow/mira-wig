BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionDispatchAttempt"
    WHERE "provider" = 'EXIMBAY'::"PaymentProvider"
  ) THEN
    RAISE EXCEPTION 'Eximbay preflight-observation migration requires zero historical Eximbay dispatch rows.';
  END IF;
END
$$;

CREATE TABLE "RefundExecutionEximbayPreflightObservation" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "observingLeaseGeneration" INTEGER NOT NULL,
    "mid" VARCHAR(512) NOT NULL,
    "providerOrderId" VARCHAR(512) NOT NULL,
    "providerTransactionId" VARCHAR(512) NOT NULL,
    "providerStatus" VARCHAR(32) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "originalAmount" INTEGER NOT NULL,
    "refundableBalance" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "inquiryContractVersion" VARCHAR(64) NOT NULL,
    "parserVersion" VARCHAR(64) NOT NULL,
    "observationFingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundExecutionEximbayPreflightObservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EximbayPreflight_generation_check" CHECK ("observingLeaseGeneration" >= 1),
    CONSTRAINT "EximbayPreflight_mid_check" CHECK (btrim("mid") <> '' AND "mid" !~ '[[:cntrl:]]'),
    CONSTRAINT "EximbayPreflight_order_check" CHECK (btrim("providerOrderId") <> '' AND "providerOrderId" !~ '[[:cntrl:]]'),
    CONSTRAINT "EximbayPreflight_transaction_check" CHECK (btrim("providerTransactionId") <> '' AND "providerTransactionId" !~ '[[:cntrl:]]'),
    CONSTRAINT "EximbayPreflight_status_check" CHECK ("providerStatus" = 'SALE'),
    CONSTRAINT "EximbayPreflight_currency_check" CHECK ("currency" IN ('USD', 'JPY')),
    CONSTRAINT "EximbayPreflight_original_amount_check" CHECK ("originalAmount" >= 1),
    CONSTRAINT "EximbayPreflight_balance_nonnegative_check" CHECK ("refundableBalance" >= 0),
    CONSTRAINT "EximbayPreflight_balance_ceiling_check" CHECK ("refundableBalance" <= "originalAmount"),
    CONSTRAINT "EximbayPreflight_inquiry_version_check" CHECK ("inquiryContractVersion" = 'refund-provider-eximbay-inquiry/v1'),
    CONSTRAINT "EximbayPreflight_parser_version_check" CHECK ("parserVersion" = 'refund-provider-eximbay-inquiry-parser/v1'),
    CONSTRAINT "EximbayPreflight_fingerprint_check" CHECK ("observationFingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "EximbayPreflight_binding_generation_key"
ON "RefundExecutionEximbayPreflightObservation"("bindingId", "observingLeaseGeneration");

CREATE UNIQUE INDEX "RefundExecutionEximbayPreflightObservation_observationFingerprint_key"
ON "RefundExecutionEximbayPreflightObservation"("observationFingerprint");

ALTER TABLE "RefundExecutionEximbayPreflightObservation"
ADD CONSTRAINT "RefundExecutionEximbayPreflightObservation_bindingId_fkey"
FOREIGN KEY ("bindingId") REFERENCES "RefundExecutionProviderOperationBinding"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_eximbay_preflight_observation_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'RefundExecutionEximbayPreflightObservation is immutable';
END;
$$;

CREATE TRIGGER "EximbayPreflight_immutable"
BEFORE UPDATE OR DELETE ON "RefundExecutionEximbayPreflightObservation"
FOR EACH ROW EXECUTE FUNCTION "reject_eximbay_preflight_observation_mutation"();

COMMIT;
