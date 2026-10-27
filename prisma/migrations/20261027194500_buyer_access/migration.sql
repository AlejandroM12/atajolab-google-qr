-- AlterTable
ALTER TABLE "Order" ADD COLUMN "buyerEmail" TEXT;

-- CreateIndex
CREATE INDEX "Order_buyerEmail_idx" ON "Order"("buyerEmail");

-- CreateTable
CREATE TABLE "DownloadAccessLink" (
    "tokenHash" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadAccessLink_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "DownloadAccessCredential" (
    "keyHash" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadAccessCredential_pkey" PRIMARY KEY ("keyHash")
);

-- CreateIndex
CREATE INDEX "DownloadAccessLink_orderId_usedAt_idx" ON "DownloadAccessLink"("orderId", "usedAt");

-- CreateIndex
CREATE INDEX "DownloadAccessCredential_orderId_idx" ON "DownloadAccessCredential"("orderId");

-- AddForeignKey
ALTER TABLE "DownloadAccessLink" ADD CONSTRAINT "DownloadAccessLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadAccessCredential" ADD CONSTRAINT "DownloadAccessCredential_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
