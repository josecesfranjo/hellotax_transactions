/*
  Warnings:

  - A unique constraint covering the columns `[fingerprint]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fingerprint` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "fingerprint" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_fingerprint_key" ON "public"."Transaction"("fingerprint");
