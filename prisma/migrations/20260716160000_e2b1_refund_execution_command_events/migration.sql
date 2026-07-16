BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionCommand"
    WHERE "status" = 'LEASED'
  ) THEN
    RAISE EXCEPTION 'Refund execution command-event migration requires zero LEASED commands.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionCommand"
    WHERE "dispatchAttempt" > 0
  ) THEN
    RAISE EXCEPTION 'Refund execution command-event migration requires zero positive dispatch ordinals.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RefundExecutionEvidence"
  ) THEN
    RAISE EXCEPTION 'Refund execution command-event migration requires zero execution evidence rows.';
  END IF;
END
$$;

-- CreateEnum
CREATE TYPE "RefundExecutionCommandEventType" AS ENUM ('LEASE_ACQUIRED', 'PRE_CONTACT_RELEASED');

-- CreateTable
CREATE TABLE "RefundExecutionCommandEvent" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "eventType" "RefundExecutionCommandEventType" NOT NULL,
    "leaseGeneration" INTEGER NOT NULL,
    "dispatchAttempt" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundExecutionCommandEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefundExecutionCommandEvent_lease_generation_positive_check" CHECK (
        "leaseGeneration" >= 1
    ),
    CONSTRAINT "RefundExecutionCommandEvent_dispatch_attempt_nonnegative_check" CHECK (
        "dispatchAttempt" >= 0
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundExecutionCommandEvent_commandId_leaseGeneration_eventType_key"
ON "RefundExecutionCommandEvent"("commandId", "leaseGeneration", "eventType");

-- CreateIndex
CREATE INDEX "RefundExecutionCommandEvent_commandId_occurredAt_idx"
ON "RefundExecutionCommandEvent"("commandId", "occurredAt");

-- AddForeignKey
ALTER TABLE "RefundExecutionCommandEvent"
ADD CONSTRAINT "RefundExecutionCommandEvent_commandId_fkey"
FOREIGN KEY ("commandId") REFERENCES "RefundExecutionCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
