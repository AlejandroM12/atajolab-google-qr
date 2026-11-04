import {
  cloneInspirationDocument,
  getInspiration,
} from "@/lib/studio/inspiration";
import {
  loadSessionDesign,
  writeDesign,
  type StorageLike,
} from "@/lib/studio/persistence";
import { createDocument, templateList } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";

export type StudioBootstrap = {
  document: DesignDocumentV8;
  notice: string | null;
  persist: boolean;
  recovered: boolean;
  started: boolean;
  saveLabel: string;
  source: "inspiration" | "template" | "session" | "blank";
};

/**
 * Resolves which document Studio should open.
 * Explicit URL selection (?inspiracion= / ?plantilla=) always wins over a saved session.
 */
export function resolveStudioBootstrap(input: {
  search: string;
  storage: StorageLike;
}): StudioBootstrap {
  const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);

  const inspiration = getInspiration(params.get("inspiracion"));
  if (inspiration) {
    const document = cloneInspirationDocument(inspiration.document);
    writeDesign(input.storage, document);
    return {
      document,
      notice: null,
      persist: false,
      recovered: false,
      started: true,
      saveLabel: `Empezamos con «${inspiration.name}». Podés cambiar todo.`,
      source: "inspiration",
    };
  }

  const templateId = params.get("plantilla");
  const template = templateList.find((item) => item.id === templateId);
  if (template) {
    const document = createDocument(template.id);
    writeDesign(input.storage, document);
    return {
      document,
      notice: null,
      persist: false,
      recovered: false,
      started: true,
      saveLabel: "El diseño se guarda en esta sesión.",
      source: "template",
    };
  }

  const loaded = loadSessionDesign(input.storage);
  if (loaded.persist) writeDesign(input.storage, loaded.document);
  if (loaded.recovered) {
    return {
      ...loaded,
      started: true,
      saveLabel: "Recuperamos el diseño de esta sesión.",
      source: "session",
    };
  }

  return {
    ...loaded,
    started: false,
    saveLabel: "El diseño se guarda en esta sesión.",
    source: "blank",
  };
}

/** Stable remount key so soft-nav to ?inspiracion= reloads the selected design. */
export function studioBootKey(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const inspiration = params.get("inspiracion");
  if (inspiration && getInspiration(inspiration)) return `inspiration:${inspiration}`;
  const plantilla = params.get("plantilla");
  if (plantilla && templateList.some((item) => item.id === plantilla)) return `template:${plantilla}`;
  return "session";
}
