-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "providerConfirmIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerConfirmIdempotencyKey_key" ON "Payment"("providerConfirmIdempotencyKey");
