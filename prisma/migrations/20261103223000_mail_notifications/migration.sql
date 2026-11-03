-- CreateEnum
CREATE TYPE "MailNotificationKind" AS ENUM ('PURCHASE_ACCESS');

-- CreateEnum
CREATE TYPE "MailNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "MailNotification" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "MailNotificationKind" NOT NULL,
    "status" "MailNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "accessTokenCipher" BYTEA,
    "accessTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailNotification_status_nextAttemptAt_idx" ON "MailNotification"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailNotification_orderId_kind_key" ON "MailNotification"("orderId", "kind");

-- AddForeignKey
ALTER TABLE "MailNotification" ADD CONSTRAINT "MailNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
