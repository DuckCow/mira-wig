-- AlterEnum
ALTER TYPE "PaymentEventStatus" ADD VALUE 'RETRYABLE_FAILED';

-- CreateEnum
CREATE TYPE "PaymentEventFailureStage" AS ENUM ('PARSE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "WebhookIngressRejectionStage" AS ENUM ('METADATA_EXTRACT', 'VERIFY');

-- AlterTable
ALTER TABLE "PaymentEvent"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "failureStage" "PaymentEventFailureStage",
ADD COLUMN "failureCode" TEXT;

-- CreateTable
CREATE TABLE "WebhookIngressRejection" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "stage" "WebhookIngressRejectionStage" NOT NULL,
    "code" TEXT NOT NULL,
    "candidateTransmissionId" TEXT,
    "candidateEventType" TEXT,
    "rawBodyBytes" INTEGER NOT NULL,
    "rawBodyHash" TEXT,
    "rawBodyPrefix" TEXT,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookIngressRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookIngressRejection_provider_receivedAt_idx" ON "WebhookIngressRejection"("provider", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookIngressRejection_candidateTransmissionId_idx" ON "WebhookIngressRejection"("candidateTransmissionId");
