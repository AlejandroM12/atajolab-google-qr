-- CreateTable
CREATE TABLE "StudioOrderAttempt" (
    "draftKeyHash" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioOrderAttempt_pkey" PRIMARY KEY ("draftKeyHash","idempotencyKeyHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudioOrderAttempt_orderId_key" ON "StudioOrderAttempt"("orderId");

-- CreateIndex
CREATE INDEX "StudioOrderAttempt_createdAt_idx" ON "StudioOrderAttempt"("createdAt");

-- AddForeignKey
ALTER TABLE "StudioOrderAttempt" ADD CONSTRAINT "StudioOrderAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
