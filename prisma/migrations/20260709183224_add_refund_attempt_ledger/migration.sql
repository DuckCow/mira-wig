-- CreateEnum
CREATE TYPE "RefundAttemptStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'MANUAL_REVIEW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundAttemptActorType" AS ENUM ('ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "RefundAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "RefundAttemptStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "actorType" "RefundAttemptActorType" NOT NULL,
    "actorUserId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "providerRefundId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "safeFailureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundAttempt_idempotencyKey_key" ON "RefundAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RefundAttempt_orderId_status_idx" ON "RefundAttempt"("orderId", "status");

-- CreateIndex
CREATE INDEX "RefundAttempt_paymentId_status_idx" ON "RefundAttempt"("paymentId", "status");

-- CreateIndex
CREATE INDEX "RefundAttempt_orderId_requestedAt_idx" ON "RefundAttempt"("orderId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundAttempt_provider_providerRefundId_key" ON "RefundAttempt"("provider", "providerRefundId");

-- AddForeignKey
ALTER TABLE "RefundAttempt" ADD CONSTRAINT "RefundAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundAttempt" ADD CONSTRAINT "RefundAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
