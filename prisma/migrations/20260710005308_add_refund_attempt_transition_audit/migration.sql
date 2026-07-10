-- CreateTable
CREATE TABLE "RefundAttemptTransition" (
    "id" TEXT NOT NULL,
    "refundAttemptId" TEXT NOT NULL,
    "fromStatus" "RefundAttemptStatus",
    "toStatus" "RefundAttemptStatus" NOT NULL,
    "orderStatusBefore" "OrderStatus" NOT NULL,
    "orderStatusAfter" "OrderStatus" NOT NULL,
    "actorType" "RefundAttemptActorType" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundAttemptTransition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundAttemptTransition_creation_edge_check" CHECK (
        ("fromStatus" IS NULL) = ("toStatus" = 'REQUESTED'::"RefundAttemptStatus")
    ),
    CONSTRAINT "RefundAttemptTransition_distinct_status_check" CHECK (
        "fromStatus" IS NULL OR "fromStatus" <> "toStatus"
    ),
    CONSTRAINT "RefundAttemptTransition_admin_actor_check" CHECK (
        "actorType" <> 'ADMIN'::"RefundAttemptActorType" OR "actorUserId" IS NOT NULL
    ),
    CONSTRAINT "RefundAttemptTransition_actor_user_nonblank_check" CHECK (
        "actorUserId" IS NULL OR btrim("actorUserId") <> ''
    ),
    CONSTRAINT "RefundAttemptTransition_reason_nonblank_check" CHECK (
        btrim("reason") <> ''
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundAttemptTransition_operationKey_key" ON "RefundAttemptTransition"("operationKey");

-- CreateIndex
CREATE INDEX "RefundAttemptTransition_refundAttemptId_createdAt_idx" ON "RefundAttemptTransition"("refundAttemptId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefundAttemptTransition" ADD CONSTRAINT "RefundAttemptTransition_refundAttemptId_fkey" FOREIGN KEY ("refundAttemptId") REFERENCES "RefundAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
