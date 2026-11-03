import type { StudioStoredMime } from "@/lib/studio/assets/limits";

export type StudioAssetStatus = "TEMPORARY" | "RETAINED";

export type StudioAssetRecord = {
  id: string;
  sha256: string;
  mime: StudioStoredMime;
  width: number;
  height: number;
  byteLength: number;
  bytes: Buffer;
  status: StudioAssetStatus;
  draftKeyHash: string | null;
  orderId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
};

export type StudioAssetInsert = {
  id: string;
  sha256: string;
  mime: StudioStoredMime;
  width: number;
  height: number;
  byteLength: number;
  bytes: Buffer;
  status: StudioAssetStatus;
  draftKeyHash: string | null;
  orderId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
};

/**
 * Physical storage adapter. Postgres today; R2 later can implement the same surface
 * by storing `bytes` elsewhere and keeping metadata rows.
 */
export type StudioAssetStore = {
  put(asset: StudioAssetInsert): Promise<StudioAssetRecord>;
  findById(id: string): Promise<StudioAssetRecord | null>;
  findByDraftSha(draftKeyHash: string, sha256: string): Promise<StudioAssetRecord | null>;
  countByDraft(draftKeyHash: string): Promise<number>;
  retain(input: {
    ids: string[];
    draftKeyHash: string;
    orderId: string;
  }): Promise<{ retained: string[]; rejected: string[] }>;
  deleteExpired(now: Date): Promise<number>;
};
