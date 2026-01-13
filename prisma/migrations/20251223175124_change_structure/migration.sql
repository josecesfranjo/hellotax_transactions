/*
  Warnings:

  - Made the column `itemDescription` on table `Transaction` required. This step will fail if there are existing NULL values in that column.
  - Made the column `taxableJurisdiction` on table `Transaction` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Transaction" ALTER COLUMN "itemDescription" SET NOT NULL,
ALTER COLUMN "departureCountry" DROP NOT NULL,
ALTER COLUMN "arrivalCountry" DROP NOT NULL,
ALTER COLUMN "taxableJurisdiction" SET NOT NULL;
