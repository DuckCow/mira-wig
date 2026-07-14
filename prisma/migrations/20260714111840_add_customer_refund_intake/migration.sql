BEGIN;

-- CreateEnum
CREATE TYPE "CustomerRefundIntakeStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CustomerRefundIntakeReasonCode" AS ENUM ('CHANGE_OF_MIND', 'PRODUCT_DEFECT', 'DELIVERY_ISSUE', 'OTHER');

-- CreateTable
CREATE TABLE "CustomerRefundIntake" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "status" "CustomerRefundIntakeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reasonCode" "CustomerRefundIntakeReasonCode" NOT NULL,
    "reasonDetail" VARCHAR(500),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "adminRejectionReason" VARCHAR(500),
    "approvedRefundAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRefundIntake_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerRefundIntake_withdrawal_coherence_check" CHECK (
        (
            "status" = 'WITHDRAWN'::"CustomerRefundIntakeStatus"
        ) = (
            "withdrawnAt" IS NOT NULL
        )
    ),
    CONSTRAINT "CustomerRefundIntake_review_coherence_check" CHECK (
        (
            "status" IN (
                'APPROVED'::"CustomerRefundIntakeStatus",
                'REJECTED'::"CustomerRefundIntakeStatus"
            )
        ) = (
            "reviewedAt" IS NOT NULL
        )
    ),
    CONSTRAINT "CustomerRefundIntake_reviewer_pair_check" CHECK (
        ("reviewedAt" IS NULL) = ("reviewedByUserId" IS NULL)
    ),
    CONSTRAINT "CustomerRefundIntake_rejection_coherence_check" CHECK (
        (
            "status" = 'REJECTED'::"CustomerRefundIntakeStatus"
        ) = (
            "adminRejectionReason" IS NOT NULL
        )
    ),
    CONSTRAINT "CustomerRefundIntake_approval_link_coherence_check" CHECK (
        (
            "status" = 'APPROVED'::"CustomerRefundIntakeStatus"
        ) = (
            "approvedRefundAttemptId" IS NOT NULL
        )
    ),
    CONSTRAINT "CustomerRefundIntake_reviewer_nonblank_check" CHECK (
        "reviewedByUserId" IS NULL
        OR btrim("reviewedByUserId") <> ''
    ),
    CONSTRAINT "CustomerRefundIntake_rejection_reason_nonblank_check" CHECK (
        "adminRejectionReason" IS NULL
        OR btrim("adminRejectionReason") <> ''
    ),
    CONSTRAINT "CustomerRefundIntake_reason_detail_nonblank_check" CHECK (
        "reasonDetail" IS NULL
        OR btrim("reasonDetail") <> ''
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRefundIntake_approvedRefundAttemptId_key" ON "CustomerRefundIntake"("approvedRefundAttemptId");

-- CreateIndex
CREATE INDEX "CustomerRefundIntake_orderId_submittedAt_idx" ON "CustomerRefundIntake"("orderId", "submittedAt");

-- CreateIndex
CREATE INDEX "CustomerRefundIntake_status_submittedAt_idx" ON "CustomerRefundIntake"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRefundIntake_orderId_submitted_key"
ON "CustomerRefundIntake" ("orderId")
WHERE "status" = 'SUBMITTED'::"CustomerRefundIntakeStatus";

-- AddForeignKey
ALTER TABLE "CustomerRefundIntake" ADD CONSTRAINT "CustomerRefundIntake_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRefundIntake" ADD CONSTRAINT "CustomerRefundIntake_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRefundIntake" ADD CONSTRAINT "CustomerRefundIntake_approvedRefundAttemptId_fkey" FOREIGN KEY ("approvedRefundAttemptId") REFERENCES "RefundAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
