-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('SALE', 'REFUND');

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "transactionId" TEXT NOT NULL,
    "transactionType" "public"."TransactionType" NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "itemDescription" TEXT,
    "itemQuantity" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "totalPriceOfItemsVatExcl" DOUBLE PRECISION NOT NULL,
    "totalShipChargeVatExcl" DOUBLE PRECISION NOT NULL,
    "totalGiftWrapVatExcl" DOUBLE PRECISION NOT NULL,
    "totalValueVatExcl" DOUBLE PRECISION NOT NULL,
    "totalPriceOfItemsVat" DOUBLE PRECISION NOT NULL,
    "totalShipChargeVat" DOUBLE PRECISION NOT NULL,
    "totalGiftWrapVat" DOUBLE PRECISION NOT NULL,
    "totalValueVat" DOUBLE PRECISION NOT NULL,
    "totalPriceOfItemsVatIncl" DOUBLE PRECISION NOT NULL,
    "totalShipChargeVatIncl" DOUBLE PRECISION NOT NULL,
    "totalGiftWrapVatIncl" DOUBLE PRECISION NOT NULL,
    "totalValueVatIncl" DOUBLE PRECISION NOT NULL,
    "transactionCurrencyCode" TEXT NOT NULL,
    "departureCountry" TEXT NOT NULL,
    "arrivalCountry" TEXT NOT NULL,
    "taxableJurisdiction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("transactionId")
);
