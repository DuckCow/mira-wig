-- CreateTable
CREATE TABLE "Market" (
    "code" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "shippableCountries" TEXT[],
    "defaultLocale" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "taxConfig" JSONB,
    "paymentConfig" JSONB,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "VariantMarketPrice" (
    "variantId" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "VariantMarketPrice_pkey" PRIMARY KEY ("variantId","marketCode")
);

-- CreateTable
CREATE TABLE "WigStyleMarket" (
    "wigStyleId" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WigStyleMarket_pkey" PRIMARY KEY ("wigStyleId","marketCode")
);

-- AddForeignKey
ALTER TABLE "VariantMarketPrice" ADD CONSTRAINT "VariantMarketPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "WigVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantMarketPrice" ADD CONSTRAINT "VariantMarketPrice_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WigStyleMarket" ADD CONSTRAINT "WigStyleMarket_wigStyleId_fkey" FOREIGN KEY ("wigStyleId") REFERENCES "WigStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WigStyleMarket" ADD CONSTRAINT "WigStyleMarket_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE CASCADE ON UPDATE CASCADE;
