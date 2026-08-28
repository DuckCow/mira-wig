-- Durable whole-Order commerce cancellation and MTO production-start audit.
-- Existing ManufacturingRequest rows are neither rewritten nor reclassified.
ALTER TABLE "ManufacturingRequest"
ADD COLUMN "productionStartRequestKey" VARCHAR(128),
ADD COLUMN "startedByUserId" TEXT;

CREATE UNIQUE INDEX "ManufacturingRequest_productionStartRequestKey_key"
ON "ManufacturingRequest"("productionStartRequestKey");

CREATE INDEX "ManufacturingRequest_startedByUserId_idx"
ON "ManufacturingRequest"("startedByUserId");

ALTER TABLE "ManufacturingRequest"
ADD CONSTRAINT "ManufacturingRequest_startedByUserId_fkey"
FOREIGN KEY ("startedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingRequest"
ADD CONSTRAINT "ManufacturingRequest_productionStartRequestKey_nonblank"
CHECK (
  "productionStartRequestKey" IS NULL
  OR btrim("productionStartRequestKey") <> ''
) NOT VALID;

ALTER TABLE "ManufacturingRequest"
ADD CONSTRAINT "ManufacturingRequest_productionStartAudit_coherent"
CHECK (
  (
    "status" IN ('IN_PRODUCTION'::"MrStatus", 'COMPLETED'::"MrStatus")
    AND "startedAt" IS NOT NULL
    AND "productionStartRequestKey" IS NOT NULL
    AND "startedByUserId" IS NOT NULL
  )
  OR
  (
    "status" IN ('RECEIVED'::"MrStatus", 'CANCELLED'::"MrStatus")
    AND "startedAt" IS NULL
    AND "productionStartRequestKey" IS NULL
    AND "startedByUserId" IS NULL
  )
) NOT VALID;

CREATE TABLE "OrderCancellation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "requestKey" VARCHAR(128) NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "initialRefundAttemptId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderCancellation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderCancellation_requestKey_nonblank" CHECK (btrim("requestKey") <> '')
);

CREATE UNIQUE INDEX "OrderCancellation_orderId_key"
ON "OrderCancellation"("orderId");

CREATE UNIQUE INDEX "OrderCancellation_requestKey_key"
ON "OrderCancellation"("requestKey");

CREATE UNIQUE INDEX "OrderCancellation_initialRefundAttemptId_key"
ON "OrderCancellation"("initialRefundAttemptId");

CREATE UNIQUE INDEX "OrderCancellation_initialRefundAttemptId_orderId_key"
ON "OrderCancellation"("initialRefundAttemptId", "orderId");

CREATE INDEX "OrderCancellation_requestedByUserId_acceptedAt_idx"
ON "OrderCancellation"("requestedByUserId", "acceptedAt");

ALTER TABLE "OrderCancellation"
ADD CONSTRAINT "OrderCancellation_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderCancellation"
ADD CONSTRAINT "OrderCancellation_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderCancellation"
ADD CONSTRAINT "OrderCancellation_initialRefundAttemptId_orderId_fkey"
FOREIGN KEY ("initialRefundAttemptId", "orderId")
REFERENCES "RefundAttempt"("id", "orderId")
ON DELETE RESTRICT ON UPDATE CASCADE;
