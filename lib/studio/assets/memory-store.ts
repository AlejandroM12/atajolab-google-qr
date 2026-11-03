import type { StudioAssetInsert, StudioAssetRecord, StudioAssetStore } from "@/lib/studio/assets/store";

/** In-memory adapter for unit tests. Not for production. */
export function createMemoryStudioAssetStore(): StudioAssetStore {
  const rows = new Map<string, StudioAssetRecord>();

  return {
    async put(asset: StudioAssetInsert): Promise<StudioAssetRecord> {
      const record: StudioAssetRecord = {
        ...asset,
        bytes: Buffer.from(asset.bytes),
      };
      rows.set(record.id, record);
      return clone(record);
    },

    async findById(id: string): Promise<StudioAssetRecord | null> {
      const row = rows.get(id);
      return row ? clone(row) : null;
    },

    async findByDraftSha(draftKeyHash: string, sha256: string): Promise<StudioAssetRecord | null> {
      for (const row of rows.values()) {
        if (row.draftKeyHash === draftKeyHash && row.sha256 === sha256) return clone(row);
      }
      return null;
    },

    async countByDraft(draftKeyHash: string): Promise<number> {
      let count = 0;
      for (const row of rows.values()) {
        if (row.draftKeyHash === draftKeyHash) count += 1;
      }
      return count;
    },

    async retain(input): Promise<{ retained: string[]; rejected: string[] }> {
      const unique = [...new Set(input.ids)];
      const rejected = unique.filter((id) => {
        const row = rows.get(id);
        return !row || row.draftKeyHash !== input.draftKeyHash || row.status !== "TEMPORARY" || row.orderId !== null;
      });
      if (rejected.length > 0) return { retained: [], rejected };
      for (const id of unique) {
        const row = rows.get(id)!;
        row.status = "RETAINED";
        row.orderId = input.orderId;
        row.expiresAt = null;
      }
      return { retained: unique, rejected: [] };
    },

    async deleteExpired(now: Date): Promise<number> {
      let removed = 0;
      for (const [id, row] of rows) {
        if (row.status !== "TEMPORARY") continue;
        if (!row.expiresAt || row.expiresAt > now) continue;
        rows.delete(id);
        removed += 1;
      }
      return removed;
    },
  };
}

function clone(row: StudioAssetRecord): StudioAssetRecord {
  return { ...row, bytes: Buffer.from(row.bytes), createdAt: new Date(row.createdAt), expiresAt: row.expiresAt ? new Date(row.expiresAt) : null };
}
