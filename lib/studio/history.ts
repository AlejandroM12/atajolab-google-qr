import { serializeDesign } from "@/lib/studio/serialize";
import type { DesignDocumentV8 } from "@/lib/studio/types";

const HISTORY_LIMIT = 50;

export type HistoryState = {
  past: DesignDocumentV8[];
  present: DesignDocumentV8;
  future: DesignDocumentV8[];
};

export function historyFrom(present: DesignDocumentV8): HistoryState {
  return { past: [], present, future: [] };
}

export function commit(history: HistoryState, next: DesignDocumentV8): HistoryState {
  if (serializeDesign(history.present) === serializeDesign(next)) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function replacePresent(history: HistoryState, next: DesignDocumentV8): HistoryState {
  return { past: history.past, present: next, future: history.future };
}

/** Folds an in-progress edit into the past once, without recording the keystrokes. */
export function flushDraft(history: HistoryState, base: DesignDocumentV8 | null): HistoryState {
  if (!base || serializeDesign(base) === serializeDesign(history.present)) return history;
  return {
    past: [...history.past, base].slice(-HISTORY_LIMIT),
    present: history.present,
    future: [],
  };
}

export function commitDraft(
  history: HistoryState,
  base: DesignDocumentV8 | null,
  next: DesignDocumentV8,
): HistoryState {
  return commit(flushDraft(history, base), next);
}

export function undo(history: HistoryState): HistoryState {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, HISTORY_LIMIT),
  };
}

export function redo(history: HistoryState): HistoryState {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: rest,
  };
}
