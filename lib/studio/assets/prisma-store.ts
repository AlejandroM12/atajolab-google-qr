import type { PrismaClient, StudioAssetStatus as PrismaStatus } from "@prisma/client";
import type { StudioStoredMime } from "@/lib/studio/assets/limits";
import type { StudioAssetInsert, StudioAssetRecord, StudioAssetStore } from "@/lib/studio/assets/store";

type StudioAssetDb = {
  studioAsset: PrismaClient["studioAsset"];
  $transaction?: PrismaClient["$transaction"];
};

/**
 * Prisma-backed store. Accepts a full client or an interactive transaction client
 * so order create + retain can share one atomic transaction.
 */
export function createPrismaStudioAssetStore(client: StudioAssetDb): StudioAssetStore {
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

    async sumBytesByDraft(draftKeyHash: string): Promise<number> {
      const aggregate = await client.studioAsset.aggregate({
        where: { draftKeyHash },
        _sum: { byteLength: true },
      });
      return aggregate._sum.byteLength ?? 0;
    },

    async retain(input): Promise<{ retained: string[]; rejected: string[] }> {
      const unique = [...new Set(input.ids)];
      const execute = async (db: Pick<PrismaClient, "studioAsset">) => {
        // Only TEMPORARY draft-owned rows may be bound. Already RETAINED assets
        // cannot be reassigned to another order (even with the same draft key).
        const eligible = await db.studioAsset.findMany({
          where: {
            id: { in: unique },
            draftKeyHash: input.draftKeyHash,
            status: "TEMPORARY",
            orderId: null,
          },
          select: { id: true },
        });
        const eligibleIds = new Set(eligible.map((row) => row.id));
        const rejected = unique.filter((id) => !eligibleIds.has(id));
        // All-or-nothing: never leave a partial retain if any id is foreign/missing/already bound.
        if (rejected.length > 0) return { retained: [], rejected };

        if (unique.length === 0) return { retained: [], rejected: [] };

        const updated = await db.studioAsset.updateMany({
          where: {
            id: { in: unique },
            draftKeyHash: input.draftKeyHash,
            status: "TEMPORARY",
            orderId: null,
          },
          data: {
            status: "RETAINED",
            orderId: input.orderId,
            expiresAt: null,
          },
        });
        if (updated.count !== unique.length) {
          // Concurrent retain raced us — force transaction rollback.
          throw new Error("order-assets");
        }
        return { retained: unique, rejected: [] };
      };

      if (typeof client.$transaction === "function") {
        return client.$transaction((tx) => execute(tx));
      }
      return execute(client as Pick<PrismaClient, "studioAsset">);
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
