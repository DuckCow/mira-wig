-- CreateEnum
CREATE TYPE "FittingStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Fitting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" "FittingStatus" NOT NULL DEFAULT 'PENDING',
    "sourceImageKey" TEXT,
    "resultImageKey" TEXT,
    "providerJobId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fitting_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Fitting" ADD CONSTRAINT "Fitting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fitting" ADD CONSTRAINT "Fitting_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "WigVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
