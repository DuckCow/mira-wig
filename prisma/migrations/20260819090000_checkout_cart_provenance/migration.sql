BEGIN;

ALTER TABLE "CheckoutSessionLine"
ADD COLUMN "sourceCartItemId" TEXT;

CREATE INDEX "CheckoutSessionLine_sourceCartItemId_idx"
ON "CheckoutSessionLine"("sourceCartItemId");

COMMIT;
