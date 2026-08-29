BEGIN;

CREATE TABLE "PromotionRecoveryReconciliationCheckpoint" (
  "scopeKey" VARCHAR(64) NOT NULL,
  "lastOrderId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionRecoveryReconciliationCheckpoint_pkey"
    PRIMARY KEY ("scopeKey"),
  CONSTRAINT "PromotionRecoveryReconciliationCheckpoint_scope_check"
    CHECK ("scopeKey" = 'PROMOTION_REFUND_RECOVERY'),
  CONSTRAINT "PromotionRecoveryReconciliationCheckpoint_cursor_check"
    CHECK ("lastOrderId" IS NULL OR btrim("lastOrderId") <> '')
);

COMMIT;
