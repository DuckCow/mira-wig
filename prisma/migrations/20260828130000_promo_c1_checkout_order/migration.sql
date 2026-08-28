BEGIN;

ALTER TABLE "CheckoutSession"
  ADD COLUMN "promotionGrantId" TEXT,
  ADD COLUMN "firstOrderPromotionClaimedAt" TIMESTAMP(3),
  ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CheckoutSessionLine"
  ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ADD COLUMN "promotionGrantId" TEXT,
  ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OrderItem"
  ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PromotionGrant"
  ADD COLUMN "reservedCheckoutSessionId" TEXT,
  ADD COLUMN "reservedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PromotionGrant_reservedCheckoutSessionId_key"
ON "PromotionGrant"("reservedCheckoutSessionId");

CREATE UNIQUE INDEX "Order_promotionGrantId_key"
ON "Order"("promotionGrantId");

CREATE UNIQUE INDEX "CheckoutSession_firstOrderPromotionClaim_user_key"
ON "CheckoutSession"("userId")
WHERE "firstOrderPromotionClaimedAt" IS NOT NULL;

ALTER TABLE "CheckoutSession"
  ADD CONSTRAINT "CheckoutSession_promotionGrantId_fkey"
    FOREIGN KEY ("promotionGrantId") REFERENCES "PromotionGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CheckoutSession_discount_nonnegative_check"
    CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "CheckoutSession_discount_subtotal_check"
    CHECK ("discountAmount" <= "subtotalAmount"),
  ADD CONSTRAINT "CheckoutSession_total_arithmetic_check"
    CHECK (
      "totalAmount"::bigint
      = "subtotalAmount"::bigint + "shippingAmount"::bigint - "discountAmount"::bigint
    );

ALTER TABLE "CheckoutSessionLine"
  ADD CONSTRAINT "CheckoutSessionLine_discount_nonnegative_check"
    CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "CheckoutSessionLine_discount_gross_check"
    CHECK (
      "discountAmount"::bigint
      <= "unitAmount"::bigint * "quantity"::bigint
    );

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_promotionGrantId_fkey"
    FOREIGN KEY ("promotionGrantId") REFERENCES "PromotionGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Order_discount_nonnegative_check"
    CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "Order_discount_subtotal_check"
    CHECK ("discountAmount" <= "subtotalAmount"),
  ADD CONSTRAINT "Order_total_arithmetic_check"
    CHECK (
      "totalAmount"::bigint
      = "subtotalAmount"::bigint + "shippingAmount"::bigint - "discountAmount"::bigint
    );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_discount_nonnegative_check"
    CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "OrderItem_discount_gross_check"
    CHECK (
      "discountAmount"::bigint
      <= "unitAmount"::bigint * "quantity"::bigint
    );

ALTER TABLE "PromotionGrant"
  ADD CONSTRAINT "PromotionGrant_reservedCheckoutSessionId_fkey"
    FOREIGN KEY ("reservedCheckoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PromotionGrant_reservation_pair_check"
    CHECK (
      ("reservedCheckoutSessionId" IS NULL AND "reservedAt" IS NULL)
      OR ("reservedCheckoutSessionId" IS NOT NULL AND "reservedAt" IS NOT NULL)
    );

COMMIT;
