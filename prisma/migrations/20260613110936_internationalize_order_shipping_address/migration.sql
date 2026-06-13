/*
  Warnings:

  - You are about to drop the column `shippingAddr` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `shippingAddr2` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `shippingName` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `shippingPhone` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `shippingZip` on the `Order` table. All the data in the column will be lost.
  - Added the required column `addressLine1` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `country` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `postalCode` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recipientName` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ShippingCountry" AS ENUM ('KR', 'US', 'JP');

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "shippingAddr",
DROP COLUMN "shippingAddr2",
DROP COLUMN "shippingName",
DROP COLUMN "shippingPhone",
DROP COLUMN "shippingZip",
ADD COLUMN     "addressLine1" TEXT NOT NULL,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "administrativeArea" TEXT,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "country" "ShippingCountry" NOT NULL,
ADD COLUMN     "phone" TEXT NOT NULL,
ADD COLUMN     "postalCode" TEXT NOT NULL,
ADD COLUMN     "recipientName" TEXT NOT NULL;
