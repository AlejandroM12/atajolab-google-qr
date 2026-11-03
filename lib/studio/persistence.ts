import { parseDesign, serializeDesign, type ParsedDesign } from "@/lib/studio/serialize";
import { createDocument } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";

/**
 * Session persistence for Studio v8.
 *
 * The design lives in sessionStorage under one versioned key. It is not an
 * order, it is not sent to checkout, and it is not written to Postgres.
 *
 * A later paid order can store a copy only after print export is validated.
 * That copy needs version 8 in its own snapshot parser, separate from artwork
 * version 7. Images should be files referenced by id, with the same kind of
 * size checks used for logos, instead of data URLs inside the order row.
 */
export const STUDIO_STORAGE_KEY = "atajolab.studio.v8";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LoadedDesign = {
  document: DesignDocumentV8;
  notice: string | null;
  persist: boolean;
  recovered: boolean;
};

export function loadSessionDesign(storage: StorageLike): LoadedDesign {
  const raw = storage.getItem(STUDIO_STORAGE_KEY);
  if (!raw) {
    return { document: createDocument("corporativo"), notice: null, persist: false, recovered: false };
  }

  const parsed = parseDesign(raw);
  if (!parsed) {
    return {
      document: createDocument("corporativo"),
      notice: "No pudimos leer el diseño guardado. Empezamos uno nuevo.",
      persist: true,
      recovered: false,
    };
  }

  return {
    document: parsed.document,
    notice: loadNotice(parsed),
    persist: parsed.droppedImages > 0 || parsed.repairedQr,
    recovered: true,
  };
}

export function readDesign(storage: StorageLike): ParsedDesign | null {
  const raw = storage.getItem(STUDIO_STORAGE_KEY);
  if (!raw) return null;
  return parseDesign(raw);
}

export function writeDesign(
  storage: StorageLike,
  document: DesignDocumentV8,
): { ok: true } | { ok: false; reason: "quota" | "unavailable" } {
  try {
    storage.setItem(STUDIO_STORAGE_KEY, serializeDesign(document));
    return { ok: true };
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, reason: "quota" };
    return { ok: false, reason: "unavailable" };
  }
}

function loadNotice(parsed: ParsedDesign): string | null {
  const notes: string[] = [];
  if (parsed.droppedImages === 1) notes.push("Quitamos una imagen que no se pudo usar.");
  if (parsed.droppedImages > 1) notes.push(`Quitamos ${parsed.droppedImages} imágenes que no se pudieron usar.`);
  if (parsed.repairedQr) notes.push("Ajustamos los colores del QR para que se pueda escanear.");
  return notes.join(" ") || null;
}

function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}
