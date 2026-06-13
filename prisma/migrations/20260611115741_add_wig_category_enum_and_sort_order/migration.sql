/*
  Warnings:

  - Changed the type of `category` on the `WigStyle` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "WigCategory" AS ENUM ('HAIR_LOSS', 'FASHION', 'COSPLAY', 'TOPPER', 'MEDICAL');

-- AlterTable
ALTER TABLE "WigStyle" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "category",
ADD COLUMN     "category" "WigCategory" NOT NULL;
