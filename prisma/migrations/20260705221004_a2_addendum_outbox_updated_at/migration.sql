/*
  Warnings:

  - Added the required column `updatedAt` to the `PaymentOutbox` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PaymentOutbox" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
