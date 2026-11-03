import type { PrismaClient, StudioAssetStatus as PrismaStatus } from "@prisma/client";
import type { StudioStoredMime } from "@/lib/studio/assets/limits";
import type { StudioAssetInsert, StudioAssetRecord, StudioAssetStore } from "@/lib/studio/assets/store";

export function createPrismaStudioAssetStore(client: PrismaClient): StudioAssetStore {
  return {
    async put(asset: StudioAssetInsert): Promise<StudioAssetRecord> {
      const row = await client.studioAsset.create({
        data: {
          id: asset.id,
          sha256: asset.sha256,
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
          byteLength: asset.byteLength,
          bytes: Uint8Array.from(asset.bytes),
          status: asset.status as PrismaStatus,
          draftKeyHash: asset.draftKeyHash,
          orderId: asset.orderId,
          createdAt: asset.createdAt,
          expiresAt: asset.expiresAt,
        },
      });
      return mapRow(row);
    },

    async findById(id: string): Promise<StudioAssetRecord | null> {
      const row = await client.studioAsset.findUnique({ where: { id } });
      return row ? mapRow(row) : null;
    },

    async findByDraftSha(draftKeyHash: string, sha256: string): Promise<StudioAssetRecord | null> {
      const row = await client.studioAsset.findUnique({
        where: { draftKeyHash_sha256: { draftKeyHash, sha256 } },
      });
      return row ? mapRow(row) : null;
    },

    async countByDraft(draftKeyHash: string): Promise<number> {
      return client.studioAsset.count({ where: { draftKeyHash } });
    },

    async retain(input): Promise<{ retained: string[]; rejected: string[] }> {
      const unique = [...new Set(input.ids)];
      return client.$transaction(async (tx) => {
        const owned = await tx.studioAsset.findMany({
          where: { id: { in: unique }, draftKeyHash: input.draftKeyHash },
          select: { id: true },
        });
        const ownedIds = new Set(owned.map((row) => row.id));
        const rejected = unique.filter((id) => !ownedIds.has(id));
        // All-or-nothing: never leave a partial retain if any id is foreign/missing.
        if (rejected.length > 0) return { retained: [], rejected };

        await tx.studioAsset.updateMany({
          where: { id: { in: unique }, draftKeyHash: input.draftKeyHash },
          data: {
            status: "RETAINED",
            orderId: input.orderId,
            expiresAt: null,
          },
        });
        return { retained: unique, rejected: [] };
      });
    },

    async deleteExpired(now: Date): Promise<number> {
      const result = await client.studioAsset.deleteMany({
        where: {
          status: "TEMPORARY",
          expiresAt: { lte: now },
        },
      });
      return result.count;
    },
  };
}

function mapRow(row: {
  id: string;
  sha256: string;
  mime: string;
  width: number;
  height: number;
  byteLength: number;
  bytes: Uint8Array;
  status: PrismaStatus;
  draftKeyHash: string | null;
  orderId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}): StudioAssetRecord {
  return {
    id: row.id,
    sha256: row.sha256,
    mime: row.mime as StudioStoredMime,
    width: row.width,
    height: row.height,
    byteLength: row.byteLength,
    bytes: Buffer.from(row.bytes),
    status: row.status,
    draftKeyHash: row.draftKeyHash,
    orderId: row.orderId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}
