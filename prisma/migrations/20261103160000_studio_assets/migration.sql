-- CreateEnum
CREATE TYPE "StudioAssetStatus" AS ENUM ('TEMPORARY', 'RETAINED');

-- CreateTable
CREATE TABLE "StudioAsset" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "status" "StudioAssetStatus" NOT NULL DEFAULT 'TEMPORARY',
    "draftKeyHash" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "StudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioAsset_sha256_idx" ON "StudioAsset"("sha256");

-- CreateIndex
CREATE INDEX "StudioAsset_draftKeyHash_status_idx" ON "StudioAsset"("draftKeyHash", "status");

-- CreateIndex
CREATE INDEX "StudioAsset_orderId_idx" ON "StudioAsset"("orderId");

-- CreateIndex
CREATE INDEX "StudioAsset_status_expiresAt_idx" ON "StudioAsset"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioAsset_draftKeyHash_sha256_key" ON "StudioAsset"("draftKeyHash", "sha256");

-- AddForeignKey
ALTER TABLE "StudioAsset" ADD CONSTRAINT "StudioAsset_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
