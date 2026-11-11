/**
 * State of the guided flow and its hand-off to the editor. Client-safe and free
 * of React so the rules can be tested: what gets saved, which proposal is
 * selected, and what the editor finds when the user taps "Usar este diseño".
 */
import {
  buildQrContent,
  readQrContentInput,
  type QrContentInput,
} from "@/lib/qr-content";
import { DEFAULT_FORMAT_ID, isFormatId, type FormatId } from "@/lib/studio/formats";
import { STUDIO_STORAGE_KEY, type StorageLike } from "@/lib/studio/persistence";
import {
  PROPOSAL_NAME_MAX,
  isStyleId,
  recommendedStyle,
  type StyleId,
} from "@/lib/studio/proposal-options";
import { parseDesign, serializeDesign } from "@/lib/studio/serialize";
import type { DesignDocumentV8 } from "@/lib/studio/types";

export const GUIDED_STORAGE_KEY = "atajolab.guiado.v2";
/** The design the editor had before a proposal replaced it. One level, so Undo can bring it back. */
export const STUDIO_PREVIOUS_KEY = `${STUDIO_STORAGE_KEY}.anterior`;

export const GUIDED_STEPS = ["Contenido", "Datos", "Estilo", "Formato", "Diseño"] as const;
export type GuidedStep = 0 | 1 | 2 | 3 | 4;

export type GuidedState = {
  step: GuidedStep;
  content: QrContentInput | null;
  name: string;
  styleId: StyleId;
  /** True once the user picked a style, so a new content type stops changing it. */
  stylePicked: boolean;
  formatId: FormatId;
  /** Proposal the user selected on the last step. Null means "the first one". */
  proposalId: string | null;
};

export function initialGuidedState(): GuidedState {
  return {
    step: 0,
    content: null,
    name: "",
    styleId: "clasico",
    stylePicked: false,
    formatId: DEFAULT_FORMAT_ID,
    proposalId: null,
  };
}

/** The furthest step the current answers allow. */
export function reachableStep(state: Pick<GuidedState, "content">): GuidedStep {
  if (!state.content) return 0;
  return buildQrContent(state.content).ok ? 4 : 1;
}

/**
 * What is kept in sessionStorage so a reload does not lose the answers.
 * A Wi-Fi password is never written: after a reload the flow asks for it again.
 */
export function serializeGuidedState(state: GuidedState): string {
  const content =
    state.content?.type === "wifi" ? { ...state.content, password: "" } : state.content;
  return JSON.stringify({ ...state, content });
}

export function readGuidedState(raw: string | null): GuidedState {
  const fallback = initialGuidedState();
  if (!raw) return fallback;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return fallback;
  const record = saved as Record<string, unknown>;
  const content = readQrContentInput(record.content);
  if (!content) return fallback;
  const step =
    typeof record.step === "number" && [0, 1, 2, 3, 4].includes(record.step) ? (record.step as GuidedStep) : 1;
  const state: GuidedState = {
    step,
    content,
    name: typeof record.name === "string" ? record.name.slice(0, PROPOSAL_NAME_MAX) : "",
    styleId: isStyleId(record.styleId) ? record.styleId : recommendedStyle(content.type),
    stylePicked: record.stylePicked === true,
    formatId: isFormatId(record.formatId) ? record.formatId : DEFAULT_FORMAT_ID,
    proposalId: typeof record.proposalId === "string" ? record.proposalId.slice(0, 80) : null,
  };
  // Never land past the data step with data that no longer validates.
  const reachable = reachableStep(state);
  return state.step > reachable ? { ...state, step: reachable } : state;
}

/** The proposal shown as selected: the one the user chose, or the first (best match). */
export function selectedProposal<T extends { id: string }>(proposals: readonly T[], wantedId: string | null): T | null {
  return proposals.find((proposal) => proposal.id === wantedId) ?? proposals[0] ?? null;
}

export type HandoffResult = { ok: true; replaced: boolean } | { ok: false; reason: "invalid" | "storage" };


/**
 * Saves the chosen proposal as the editor's design. If the editor already had
 * another design, it is kept aside so the editor can offer it back with Undo
 * instead of asking for a confirmation here.
 */
export function handoffProposal(storage: StorageLike, proposal: unknown): HandoffResult {
  let parsed: ReturnType<typeof parseDesign>;
  try {
    parsed = parseDesign(JSON.stringify(proposal));
  } catch {
    parsed = null;
  }
  if (!parsed) return { ok: false, reason: "invalid" };
  const next = serializeDesign(parsed.document);

  try {
    const stored = storage.getItem(STUDIO_STORAGE_KEY);
    // Compared after parsing, so the same design saved by the editor does not count as another one.
    const current = stored ? parseDesign(stored)?.document : null;
    const previous = current && serializeDesign(current) !== next ? serializeDesign(current) : null;
    if (previous) storage.setItem(STUDIO_PREVIOUS_KEY, previous);
    else storage.removeItem?.(STUDIO_PREVIOUS_KEY);
    storage.setItem(STUDIO_STORAGE_KEY, next);
    return { ok: true, replaced: previous !== null };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

/** Takes the design a proposal replaced, once. Null when there was none. */
export function takePreviousDesign(storage: StorageLike): DesignDocumentV8 | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STUDIO_PREVIOUS_KEY);
    storage.removeItem?.(STUDIO_PREVIOUS_KEY);
  } catch {
    return null;
  }
  return raw ? (parseDesign(raw)?.document ?? null) : null;
}
