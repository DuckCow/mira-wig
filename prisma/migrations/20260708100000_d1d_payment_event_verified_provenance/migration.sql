-- AlterTable
ALTER TABLE "PaymentEvent"
  ADD COLUMN "verifiedMode" "PaymentMode",
  ADD COLUMN "verifiedCredentialBinding" TEXT;
