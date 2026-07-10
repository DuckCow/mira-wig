BEGIN;

-- CreateEnum
CREATE TYPE "RefundExecutionCommandStatus" AS ENUM ('READY', 'LEASED', 'WAITING_EVIDENCE', 'WAITING_RETRY', 'PARKED', 'DONE');

-- CreateEnum
CREATE TYPE "RefundExecutionEvidenceSource" AS ENUM ('ADAPTER_RESPONSE', 'PROVIDER_LOOKUP', 'WEBHOOK', 'RECONCILIATION', 'OPERATOR');

-- CreateEnum
CREATE TYPE "RefundExecutionEvidenceOutcome" AS ENUM ('SUCCEEDED', 'ACCEPTED_PENDING', 'NOT_EXECUTED_RETRYABLE', 'NOT_EXECUTED_TERMINAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RefundExecutionEvidenceApplication" AS ENUM ('APPLIED', 'PARKED', 'DUPLICATE', 'CONFLICT');

-- CreateTable
CREATE TABLE "RefundExecutionCommand" (
    "id" TEXT NOT NULL,
    "refundAttemptId" TEXT NOT NULL,
    "status" "RefundExecutionCommandStatus" NOT NULL DEFAULT 'READY',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" VARCHAR(255),
    "leaseUntil" TIMESTAMP(3),
    "dispatchAttempt" INTEGER NOT NULL DEFAULT 0,
    "lastSafeErrorCode" VARCHAR(128),
    "lastSafeErrorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundExecutionCommand_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundExecutionCommand_dispatch_attempt_nonnegative_check" CHECK (
        "dispatchAttempt" >= 0
    ),
    CONSTRAINT "RefundExecutionCommand_lease_status_coherence_check" CHECK (
        (
            "status" = 'LEASED'::"RefundExecutionCommandStatus"
            AND "leaseOwner" IS NOT NULL
            AND "leaseUntil" IS NOT NULL
        )
        OR
        (
            "status" <> 'LEASED'::"RefundExecutionCommandStatus"
            AND "leaseOwner" IS NULL
            AND "leaseUntil" IS NULL
        )
    ),
    CONSTRAINT "RefundExecutionCommand_leased_dispatch_attempt_check" CHECK (
        "status" <> 'LEASED'::"RefundExecutionCommandStatus"
        OR "dispatchAttempt" > 0
    ),
    CONSTRAINT "RefundExecutionCommand_lease_owner_nonblank_check" CHECK (
        "leaseOwner" IS NULL OR btrim("leaseOwner") <> ''
    ),
    CONSTRAINT "RefundExecutionCommand_last_safe_error_code_nonblank_check" CHECK (
        "lastSafeErrorCode" IS NULL OR btrim("lastSafeErrorCode") <> ''
    ),
    CONSTRAINT "RefundExecutionCommand_last_safe_error_message_nonblank_check" CHECK (
        "lastSafeErrorMessage" IS NULL OR btrim("lastSafeErrorMessage") <> ''
    )
);

-- CreateTable
CREATE TABLE "RefundExecutionEvidence" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "source" "RefundExecutionEvidenceSource" NOT NULL,
    "sourceDedupKey" VARCHAR(512) NOT NULL,
    "outcome" "RefundExecutionEvidenceOutcome" NOT NULL,
    "application" "RefundExecutionEvidenceApplication" NOT NULL,
    "observedProviderRefundId" VARCHAR(512),
    "reportedAmount" INTEGER,
    "reportedCurrency" VARCHAR(3),
    "safeCode" VARCHAR(128),
    "safeMessage" VARCHAR(500),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundExecutionEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundExecutionEvidence_source_dedup_key_nonblank_check" CHECK (
        btrim("sourceDedupKey") <> ''
    ),
    CONSTRAINT "RefundExecutionEvidence_reported_pair_check" CHECK (
        ("reportedAmount" IS NULL) = ("reportedCurrency" IS NULL)
    ),
    CONSTRAINT "RefundExecutionEvidence_reported_amount_positive_check" CHECK (
        "reportedAmount" IS NULL OR "reportedAmount" > 0
    ),
    CONSTRAINT "RefundExecutionEvidence_reported_currency_format_check" CHECK (
        "reportedCurrency" IS NULL OR "reportedCurrency" ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT "RefundExecutionEvidence_provider_refund_id_nonblank_check" CHECK (
        "observedProviderRefundId" IS NULL OR btrim("observedProviderRefundId") <> ''
    ),
    CONSTRAINT "RefundExecutionEvidence_safe_code_nonblank_check" CHECK (
        "safeCode" IS NULL OR btrim("safeCode") <> ''
    ),
    CONSTRAINT "RefundExecutionEvidence_safe_message_nonblank_check" CHECK (
        "safeMessage" IS NULL OR btrim("safeMessage") <> ''
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundExecutionCommand_refundAttemptId_key" ON "RefundExecutionCommand"("refundAttemptId");

-- CreateIndex
CREATE INDEX "RefundExecutionCommand_status_availableAt_createdAt_idx" ON "RefundExecutionCommand"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "RefundExecutionCommand_status_leaseUntil_idx" ON "RefundExecutionCommand"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "RefundExecutionEvidence_sourceDedupKey_key" ON "RefundExecutionEvidence"("sourceDedupKey");

-- CreateIndex
CREATE INDEX "RefundExecutionEvidence_commandId_createdAt_idx" ON "RefundExecutionEvidence"("commandId", "createdAt");

-- CreateIndex
CREATE INDEX "RefundExecutionEvidence_source_observedAt_idx" ON "RefundExecutionEvidence"("source", "observedAt");

-- AddForeignKey
ALTER TABLE "RefundExecutionCommand" ADD CONSTRAINT "RefundExecutionCommand_refundAttemptId_fkey" FOREIGN KEY ("refundAttemptId") REFERENCES "RefundAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundExecutionEvidence" ADD CONSTRAINT "RefundExecutionEvidence_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "RefundExecutionCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
