import {
  cloneInspirationDocument,
  getInspiration,
} from "@/lib/studio/inspiration";
import { takePreviousDesign } from "@/lib/studio/guided";
import {
  loadSessionDesign,
  writeDesign,
  type StorageLike,
} from "@/lib/studio/persistence";
import { createDocument, templateList, withoutTemplateLeftovers } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";

export type StudioBootstrap = {
  document: DesignDocumentV8;
  notice: string | null;
  persist: boolean;
  recovered: boolean;
  started: boolean;
  saveLabel: string;
  source: "inspiration" | "template" | "session" | "blank";
  /** The design a guided proposal just replaced: the editor puts it one Undo away. */
  previous: DesignDocumentV8 | null;
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
      previous: null,
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
      previous: null,
    };
  }

  const stored = loadSessionDesign(input.storage);
  // Sessions saved by older editors may hold template pieces in "Fuera del lienzo".
  const cleaned = withoutTemplateLeftovers(stored.document);
  const loaded = cleaned === stored.document ? stored : { ...stored, document: cleaned, persist: true };
  if (loaded.persist) writeDesign(input.storage, loaded.document);
  if (loaded.recovered) {
    // The guided flow saves the chosen proposal as the session design before coming here.
    const guided = params.get("origen") === "guiado";
    const previous = guided ? takePreviousDesign(input.storage) : null;
    return {
      ...loaded,
      started: true,
      saveLabel: !guided
        ? "Recuperamos el diseño de esta sesión."
        : previous
          ? "Tu diseño está listo. Con Deshacer volvés al que tenías antes."
          : "Tu diseño está listo. Podés cambiar todo.",
      source: "session",
      previous,
    };
  }

  return {
    ...loaded,
    started: false,
    saveLabel: "El diseño se guarda en esta sesión.",
    source: "blank",
    previous: null,
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
