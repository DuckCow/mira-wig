BEGIN;

-- EX1 made EXIMBAY a persisted enum identity but left it runtime-disabled. Any
-- historical row therefore lacks trustworthy EX2B1 provider-order authority.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Payment"
    WHERE "provider" = 'EXIMBAY'
  ) THEN
    RAISE EXCEPTION 'EX2B1 migration blocked: historical EXIMBAY Payment requires adjudication';
  END IF;
END
$$;

ALTER TABLE "Payment"
  ADD COLUMN "providerOrderId" TEXT;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_provider_order_identity_shape_check" CHECK (
    (
      "provider" = 'EXIMBAY'
      AND "providerOrderId" IS NOT NULL
      AND "providerOrderId" ~ '^c[0-9a-z]{24}$'
    ) OR (
      "provider" <> 'EXIMBAY'
      AND "providerOrderId" IS NULL
    )
  );

CREATE UNIQUE INDEX "Payment_provider_providerOrderId_key"
ON "Payment"("provider", "providerOrderId");

CREATE FUNCTION "prevent_payment_provider_order_id_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."providerOrderId" IS DISTINCT FROM OLD."providerOrderId" THEN
    RAISE EXCEPTION 'Payment.providerOrderId is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Payment_provider_order_id_immutable"
BEFORE UPDATE OF "providerOrderId" ON "Payment"
FOR EACH ROW
EXECUTE FUNCTION "prevent_payment_provider_order_id_change"();

COMMIT;
