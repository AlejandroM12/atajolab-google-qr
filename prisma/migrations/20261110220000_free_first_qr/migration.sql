-- Promoción "Tu primer QR es gratis". Solo agrega; no modifica ni borra datos.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'FREE';

-- CreateTable
CREATE TABLE "FreeQrClaim" (
    "visitorKeyHash" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeQrClaim_pkey" PRIMARY KEY ("visitorKeyHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeQrClaim_emailHash_key" ON "FreeQrClaim"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "FreeQrClaim_orderId_key" ON "FreeQrClaim"("orderId");

-- AddForeignKey
ALTER TABLE "FreeQrClaim" ADD CONSTRAINT "FreeQrClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
