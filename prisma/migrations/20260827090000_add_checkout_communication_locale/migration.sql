-- R13B is prospective: existing CheckoutSession rows remain NULL rather than
-- receiving a guessed language derived from Market or another mutable fact.
ALTER TABLE "CheckoutSession"
ADD COLUMN "communicationLocale" VARCHAR(2);

ALTER TABLE "CheckoutSession"
ADD CONSTRAINT "CheckoutSession_communicationLocale_check"
CHECK (
  "communicationLocale" IS NULL
  OR "communicationLocale" IN ('ko', 'en', 'ja')
);
