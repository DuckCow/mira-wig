/*
  Warnings:

  - You are about to drop the `TryOn` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TryOn" DROP CONSTRAINT "TryOn_userId_fkey";

-- DropForeignKey
ALTER TABLE "TryOn" DROP CONSTRAINT "TryOn_wigStyleId_fkey";

-- DropTable
DROP TABLE "TryOn";

-- DropEnum
DROP TYPE "TryOnStatus";
