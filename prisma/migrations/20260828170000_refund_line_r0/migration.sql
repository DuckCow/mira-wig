BEGIN;

CREATE UNIQUE INDEX "RefundAttempt_id_orderId_key"
ON "RefundAttempt"("id", "orderId");

CREATE UNIQUE INDEX "OrderItem_id_orderId_key"
ON "OrderItem"("id", "orderId");

CREATE TABLE "RefundAttemptLine" (
  "refundAttemptId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,

  CONSTRAINT "RefundAttemptLine_pkey" PRIMARY KEY ("refundAttemptId", "orderItemId"),
  CONSTRAINT "RefundAttemptLine_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "RefundAttemptLine_refundAttemptId_orderId_fkey"
    FOREIGN KEY ("refundAttemptId", "orderId")
    REFERENCES "RefundAttempt"("id", "orderId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RefundAttemptLine_orderItemId_orderId_fkey"
    FOREIGN KEY ("orderItemId", "orderId")
    REFERENCES "OrderItem"("id", "orderId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RefundAttemptLine_orderItemId_idx"
ON "RefundAttemptLine"("orderItemId");

CREATE INDEX "RefundAttemptLine_orderId_idx"
ON "RefundAttemptLine"("orderId");

COMMIT;
