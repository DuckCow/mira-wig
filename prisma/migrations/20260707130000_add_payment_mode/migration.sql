-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('SANDBOX', 'LIVE');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "mode" "PaymentMode";

-- Backfill existing rows before enforcing required mode.
UPDATE "Payment" SET "mode" = 'SANDBOX' WHERE "mode" IS NULL;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "mode" SET NOT NULL;
