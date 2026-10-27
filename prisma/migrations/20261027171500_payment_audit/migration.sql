-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryKeyHash" TEXT,
ADD COLUMN     "mercadoPagoPaymentStatus" TEXT,
ADD COLUMN     "paymentCheckedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_mercadoPagoPreferenceId_key" ON "Order"("mercadoPagoPreferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_mercadoPagoPaymentId_key" ON "Order"("mercadoPagoPaymentId");
