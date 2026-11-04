"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { InspirationGallery } from "@/components/studio/inspiration-gallery";
import { StudioCanvas } from "@/components/studio/studio-canvas";
import { StudioProperties, StudioToolbar } from "@/components/studio/studio-panels";
import { parseBuyerEmail } from "@/lib/buyer-email";
import { resolveStudioBootstrap } from "@/lib/studio/bootstrap";
import {
  cloneInspirationDocument,
  getInspiration,
  type InspirationId,
} from "@/lib/studio/inspiration";
import {
  addImage,
  addRect,
  addText,
  discardParked,
  duplicateElement,
  elementBox,
  ensureQrOnTop,
  moveLayer,
  removeElement,
  replaceElement,
  replaceImage,
  restoreAllParked,
  restoreParked,
  setBackground,
  updateElement,
  withGeometry,
} from "@/lib/studio/document";
import { commitDraft, flushDraft, historyFrom, redo, replacePresent, undo, type HistoryState } from "@/lib/studio/history";
import { createId } from "@/lib/studio/ids";
import { prepareStudioImage } from "@/lib/studio/images.browser";
import { writeDesign } from "@/lib/studio/persistence";
import { prepareStudioOrderDocument } from "@/lib/studio/prepare-order";
import { createStudioOrderIdempotencyKey } from "@/lib/studio/order-idempotency";
import { formatArs, PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { qrContrastIssue } from "@/lib/studio/qr-rules";
import { validateForExport, type ExportValidation } from "@/lib/studio/export/validate";
import { serializeDesign } from "@/lib/studio/serialize";
import {
  applySuggestedColors,
  applyTemplate,
  createBlankDocument,
  createDocument,
  suggestedTemplates,
  templateList,
} from "@/lib/studio/templates";
import {
  MAX_ELEMENTS,
  QR_MIN_MM,
  STUDIO_VERSION,
  type DesignDocumentV8,
  type ElementBox,
  type ElementPatch,
  type QrElement,
  type TemplateId,
} from "@/lib/studio/types";
import { elementsCoveringQr, validateDesign } from "@/lib/studio/validation";

export function StudioEditor({
  exportEnabled = true,
  checkoutEnabled = false,
  inspirationPreviews,
}: {
  exportEnabled?: boolean;
  checkoutEnabled?: boolean;
  inspirationPreviews: Record<InspirationId, string>;
}) {
  const router = useRouter();
  const [session] = useState(loadInitial);
  const [started, setStarted] = useState(session.started);
  const [fromBlank, setFromBlank] = useState(false);
  const [showInspiration, setShowInspiration] = useState(false);
  const [history, setHistory] = useState<HistoryState>(() => historyFrom(session.document));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(session.notice);
  const [saveLabel, setSaveLabel] = useState(session.saveLabel);
  const [imageBusy, setImageBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [prepareBusy, setPrepareBusy] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState<string | null>(null);
  const [prepareReady, setPrepareReady] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [buyerEmail, setBuyerEmail] = useState("");
  const commercialDocumentRef = useRef<DesignDocumentV8 | null>(null);
  const preparedFromRef = useRef<DesignDocumentV8 | null>(null);
  const createdPublicIdRef = useRef<string | null>(null);
  const purchaseIdempotencyKeyRef = useRef<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const historyRef = useRef<HistoryState | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const liveBase = useRef<DesignDocumentV8 | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);
  const imageBusyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef<{ undo: () => void; redo: () => void; remove: (id: string) => void }>({
    undo: () => {},
    redo: () => {},
    remove: () => {},
  });

  useEffect(() => {
    if (!checkoutEnabled) return;
    void fetch("/api/studio/draft", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    }).catch(() => {
      /* Draft cookie is best-effort on first paint; prepare flow retries. */
    });
  }, [checkoutEnabled]);

  useEffect(() => {
    if (!prepareReady) return;
    if (preparedFromRef.current !== history.present) {
      setPrepareReady(false);
      commercialDocumentRef.current = null;
      preparedFromRef.current = null;
      purchaseIdempotencyKeyRef.current = null;
      createdPublicIdRef.current = null;
      setSaveLabel("El diseño cambió. Volvé a preparar las imágenes antes de crear el pedido.");
    }
  }, [history.present, prepareReady]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isField(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) handlers.current.redo();
        else handlers.current.undo();
        return;
      }
      if (meta && key === "y") {
        event.preventDefault();
        handlers.current.redo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIdRef.current) {
        event.preventDefault();
        handlers.current.remove(selectedIdRef.current);
      }
    }
    function flush() {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const present = historyRef.current?.present;
      if (present) writeDesign(window.sessionStorage, present);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function remember() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const present = historyRef.current?.present;
      if (!present) return;
      const result = writeDesign(window.sessionStorage, present);
      if (!result.ok && result.reason === "quota") {
        setError("El diseño es muy pesado para guardarlo en esta sesión. Si recargás la página, puede perderse.");
        setSaveLabel("No se pudo guardar en esta sesión.");
        return;
      }
      setSaveLabel(result.ok ? "Guardado en esta sesión." : "No se pudo guardar en esta sesión.");
    }, 250);
  }

  function publish(nextHistory: HistoryState) {
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setSelectedId((current) => {
      if (!current) return current;
      return nextHistory.present.elements.some((element) => element.id === current) ? current : null;
    });
    remember();
  }

  function commitDocument(next: DesignDocumentV8) {
    const current = historyRef.current;
    if (!current) return;
    const base = liveBase.current;
    liveBase.current = null;
    if (base) setDrafting(false);
    const nextHistory = commitDraft(current, base, next);
    if (nextHistory === current) return;
    publish(nextHistory);
  }

  function finishDraft() {
    const current = historyRef.current;
    if (!current || !liveBase.current) return;
    const base = liveBase.current;
    liveBase.current = null;
    setDrafting(false);
    const flushed = flushDraft(current, base);
    if (flushed !== current) publish(flushed);
  }

  function editLive(id: string, patch: ElementPatch) {
    const current = historyRef.current;
    if (!current) return;
    if (!liveBase.current) {
      liveBase.current = current.present;
      setDrafting(true);
    }
    const nextHistory = replacePresent(current, updateElement(current.present, id, patch));
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    remember();
  }

  function onUndo() {
    const current = historyRef.current;
    if (!current) return;
    const base = liveBase.current;
    liveBase.current = null;
    if (base) setDrafting(false);
    const flushed = flushDraft(current, base);
    const nextHistory = undo(flushed);
    if (nextHistory === current && flushed === current) return;
    publish(nextHistory);
  }

  function onRedo() {
    finishDraft();
    const latest = historyRef.current;
    if (!latest) return;
    const nextHistory = redo(latest);
    if (nextHistory === latest) return;
    publish(nextHistory);
  }

  function onGeometry(id: string, raw: ElementBox): ElementBox {
    const current = historyRef.current?.present;
    const element = current?.elements.find((item) => item.id === id);
    if (!current || !element) return raw;
    const nextElement = withGeometry(element, raw);
    if (element.type === "qr" && nextElement.type === "qr" && qrWasClamped(element, raw, nextElement)) {
      setNotice("El QR se mantiene cuadrado, dentro del cartel y con al menos 22 mm de lado.");
    }
    const nextDoc = replaceElement(current, nextElement);
    if (elementsCoveringQr(nextDoc).length > 0) {
      setNotice("Hay elementos sobre el QR o su margen. El diseño no está listo para exportar.");
    }
    commitDocument(nextDoc);
    const stored = historyRef.current?.present.elements.find((item) => item.id === id) ?? nextElement;
    return elementBox(stored);
  }

  function onTemplate(templateId: TemplateId) {
    const current = historyRef.current?.present;
    if (!current || current.templateId === templateId) return;
    const next = applyTemplate(current, templateId, { applyPalette: false });
    commitDocument(next);
    setError(null);
    if (next.parked.length === 1) {
      setNotice("Quedó 1 elemento fuera de la composición. Podés recuperarlo desde el panel.");
    } else if (next.parked.length > 1) {
      setNotice(`Quedaron ${next.parked.length} elementos fuera de la composición. Podés recuperarlos desde el panel.`);
    } else {
      setNotice("Cambiamos la composición. Tu fondo y tus textos se conservaron.");
    }
  }

  function onApplyPalette() {
    const current = historyRef.current?.present;
    if (!current) return;
    commitDocument(applySuggestedColors(current));
    setNotice("Aplicamos los colores sugeridos de esta plantilla. Podés volver a cambiarlos.");
  }

  function onBringQrForward() {
    const current = historyRef.current?.present;
    if (!current) return;
    const next = ensureQrOnTop(current);
    if (next === current) return;
    commitDocument(next);
    setNotice("El código QR quedó al frente.");
  }

  function onAddText() {
    const current = historyRef.current?.present;
    if (!current) return;
    if (current.elements.length >= MAX_ELEMENTS) {
      setError("Llegaste al máximo de 40 elementos.");
      return;
    }
    const id = createId("text");
    const next = addText(current, id);
    if (next === current) {
      setError("No pudimos agregar el texto.");
      return;
    }
    setError(null);
    commitDocument(next);
    setSelectedId(id);
  }

  function onAddRect() {
    const current = historyRef.current?.present;
    if (!current) return;
    if (current.elements.length >= MAX_ELEMENTS) {
      setError("Llegaste al máximo de 40 elementos.");
      return;
    }
    const id = createId("rect");
    const next = addRect(current, id);
    if (next === current) {
      setError("No pudimos agregar el rectángulo.");
      return;
    }
    setError(null);
    commitDocument(next);
    setSelectedId(id);
  }

  function onCommit(id: string, patch: ElementPatch) {
    const currentHistory = historyRef.current;
    const current = currentHistory?.present;
    const element = current?.elements.find((item) => item.id === id);
    if (!currentHistory || !current || !element) return;
    if (element.type === "qr" && (patch.foreground !== undefined || patch.background !== undefined)) {
      const issue = qrContrastIssue(patch.foreground ?? element.foreground, patch.background ?? element.background);
      if (issue) {
        setError(issue.message);
        return;
      }
    }
    const next = updateElement(current, id, patch);
    if (next === current) return;
    const updated = next.elements.find((item) => item.id === id);
    if (element.type === "qr" && updated?.type === "qr" && qrPatchClamped(element, patch, updated)) {
      setNotice("El QR se mantiene cuadrado, dentro del cartel y con al menos 22 mm de lado.");
    }
    if (elementsCoveringQr(next).length > 0) {
      setNotice("Hay elementos sobre el QR o su margen. El diseño no está listo para exportar.");
    }
    setError(null);
    commitDocument(next);
  }

  function onDelete(id: string) {
    const current = historyRef.current?.present;
    if (!current) return;
    const element = current.elements.find((item) => item.id === id);
    if (element?.type === "qr") {
      setNotice("El código QR se queda en el cartel.");
      return;
    }
    commitDocument(removeElement(current, id));
  }

  function onDuplicate(id: string) {
    const current = historyRef.current?.present;
    if (!current) return;
    const element = current.elements.find((item) => item.id === id);
    if (element?.type === "qr") {
      setNotice("El código QR no se duplica. Tiene que haber uno solo.");
      return;
    }
    if (current.elements.length >= MAX_ELEMENTS) {
      setError("Llegaste al máximo de 40 elementos.");
      return;
    }
    const newId = createId("copy");
    const next = duplicateElement(current, id, newId);
    if (next === current) return;
    setError(null);
    commitDocument(next);
    setSelectedId(newId);
  }

  function onRestore(id: string) {
    const current = historyRef.current?.present;
    if (!current) return;
    if (current.elements.length >= MAX_ELEMENTS) {
      setError("Llegaste al máximo de 40 elementos. Quitá uno para recuperar este.");
      return;
    }
    const next = restoreParked(current, id);
    if (next === current) return;
    setError(null);
    setNotice(null);
    commitDocument(next);
    setSelectedId(id);
  }

  function onRestoreAll() {
    const current = historyRef.current?.present;
    if (!current) return;
    const next = restoreAllParked(current);
    setError(null);
    commitDocument(next);
    setNotice(
      next.parked.length > 0
        ? "Recuperamos los que entraron. Todavía quedan elementos fuera porque el cartel llegó a 40."
        : null,
    );
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || imageBusyRef.current) return;
    imageBusyRef.current = true;
    setImageBusy(true);
    setError(null);
    const prepared = await prepareStudioImage(file);
    imageBusyRef.current = false;
    setImageBusy(false);
    const current = historyRef.current?.present;
    if (!current) return;
    if (!prepared.ok) {
      setError(prepared.message);
      return;
    }
    const target = replaceId.current;
    replaceId.current = null;
    if (target) {
      const next = replaceImage(current, target, prepared.src, prepared.alt);
      if (!next) {
        setError("No pudimos usar esa imagen.");
        return;
      }
      commitDocument(next);
      setSelectedId(target);
      return;
    }
    if (current.elements.length >= MAX_ELEMENTS) {
      setError("Llegaste al máximo de 40 elementos.");
      return;
    }
    const id = createId("image");
    const next = addImage(current, id, prepared.src, prepared.alt, prepared.width, prepared.height);
    if (!next) {
      setError("No pudimos usar esa imagen.");
      return;
    }
    commitDocument(next);
    setSelectedId(id);
  }

  async function onPrepareOrder(): Promise<boolean> {
    if (!checkoutEnabled) return false;
    const current = historyRef.current?.present;
    if (!current || prepareBusy || orderBusy) return false;
    const gate = validateForExport(current);
    if (!gate.ready) {
      setNotice(gate.errors[0]?.message ?? "El diseño todavía no está listo para preparar el pedido.");
      return false;
    }
    setPrepareBusy(true);
    setPrepareProgress("Preparando…");
    setError(null);
    setNotice(null);
    setPrepareReady(false);
    commercialDocumentRef.current = null;
    preparedFromRef.current = null;
    purchaseIdempotencyKeyRef.current = null;
    createdPublicIdRef.current = null;
    try {
      const prepared = await prepareStudioOrderDocument({
        document: current,
        onProgress: (progress) => {
          if (progress.total === 0) {
            setPrepareProgress("Preparando…");
            return;
          }
          setPrepareProgress(`Subiendo ${progress.completed + 1}/${progress.total}`);
        },
      });
      if (!prepared.ok) {
        setPrepareReady(false);
        commercialDocumentRef.current = null;
        preparedFromRef.current = null;
        setError(
          prepared.error === "draft-failed"
            ? "No pudimos abrir la sesión segura del borrador. Recargá e intentá de nuevo."
            : prepared.error === "rate-limited"
              ? "Llegaste al límite de subidas. Esperá un rato y reintentá."
              : prepared.error === "studio-checkout-disabled"
                ? "El cobro de Studio no está habilitado en este momento."
                : "No pudimos subir una imagen. Revisá el archivo y reintentá.",
        );
        return false;
      }
      commercialDocumentRef.current = prepared.commercialDocument;
      preparedFromRef.current = current;
      purchaseIdempotencyKeyRef.current = createStudioOrderIdempotencyKey();
      createdPublicIdRef.current = null;
      setPrepareReady(true);
      setPrepareProgress(null);
      setSaveLabel("Diseño listo para comprar.");
      return true;
    } catch {
      setPrepareReady(false);
      commercialDocumentRef.current = null;
      preparedFromRef.current = null;
      setError("No pudimos preparar las imágenes. Probá de nuevo.");
      return false;
    } finally {
      setPrepareBusy(false);
      setPrepareProgress(null);
    }
  }

  async function onCreateOrder() {
    if (!checkoutEnabled || orderBusy || prepareBusy) return;
    if (createdPublicIdRef.current) {
      router.push(`/pedido/${createdPublicIdRef.current}`);
      return;
    }
    const email = parseBuyerEmail(buyerEmail);
    if (!email) {
      setError(
        buyerEmail.trim().length === 0
          ? "Dejá tu correo para poder recuperar los archivos."
          : "Revisá el correo. Tiene que ser una dirección válida.",
      );
      return;
    }
    const current = historyRef.current?.present;
    if (!current) return;
    const gate = validateForExport(current);
    if (!gate.ready) {
      setNotice(gate.errors[0]?.message ?? "El diseño todavía no está listo para el pedido.");
      return;
    }

    setError(null);
    setNotice(null);

    let commercial = commercialDocumentRef.current;
    if (!commercial || preparedFromRef.current !== current || !prepareReady) {
      const prepared = await onPrepareOrder();
      if (!prepared) return;
      commercial = commercialDocumentRef.current;
    }
    if (!commercial) {
      setError("No pudimos preparar el diseño. Intentá de nuevo.");
      return;
    }

    if (!purchaseIdempotencyKeyRef.current) {
      purchaseIdempotencyKeyRef.current = createStudioOrderIdempotencyKey();
    }

    setOrderBusy(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          version: STUDIO_VERSION,
          email,
          document: commercial,
          idempotencyKey: purchaseIdempotencyKeyRef.current,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { publicId?: unknown; error?: unknown }
        | null;
      if (!response.ok) {
        setError(studioOrderErrorMessage(typeof body?.error === "string" ? body.error : ""));
        setOrderBusy(false);
        return;
      }
      const publicId = typeof body?.publicId === "string" ? body.publicId : "";
      if (!publicId) {
        setError("No pudimos crear el pedido. Intentá de nuevo.");
        setOrderBusy(false);
        return;
      }
      createdPublicIdRef.current = publicId;
      router.push(`/pedido/${publicId}`);
      // Keep orderBusy true after success to block double-submit while navigating.
    } catch {
      setError("No pudimos crear el pedido. Intentá de nuevo en un momento.");
      setOrderBusy(false);
    }
  }

  async function onExport(format: "png" | "svg" | "pdf") {
    if (!exportEnabled) {
      setError("La descarga de prueba no está habilitada en este entorno.");
      return;
    }
    const current = historyRef.current?.present;
    if (!current || exportBusy) return;
    const gate = validateForExport(current);
    if (!gate.ready) {
      setNotice(gate.errors[0]?.message ?? "El diseño todavía no está listo para exportar.");
      return;
    }
    setExportBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/studio/export/${format}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: serializeDesign(current),
      });
      if (!response.ok) {
        let message = "No pudimos generar el archivo.";
        try {
          const payload = (await response.json()) as { error?: string; issues?: { message: string }[] };
          message = payload.issues?.[0]?.message ?? message;
        } catch {
          /* keep default */
        }
        setError(message);
        return;
      }
      const blob = await response.blob();
      const header = response.headers.get("content-disposition") ?? "";
      const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(header);
      const filename = match
        ? decodeURIComponent(match[1] ?? match[2] ?? `atajolab-studio.${format}`)
        : `atajolab-studio.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setSaveLabel(`Descargamos ${filename} (prueba interna).`);
    } catch {
      setError("No pudimos generar el archivo. Probá de nuevo.");
    } finally {
      setExportBusy(false);
    }
  }

  useLayoutEffect(() => {
    historyRef.current = history;
    selectedIdRef.current = selectedId;
    handlers.current = { undo: onUndo, redo: onRedo, remove: onDelete };
  });

  const selected = history.present.elements.find((element) => element.id === selectedId) ?? null;
  const validation = useMemo(() => validateDesign(history.present), [history.present]);
  const exportValidation = useMemo(() => validateForExport(history.present), [history.present]);
  const toolbar = {
    templateId: history.present.templateId,
    canUndo: history.past.length > 0 || drafting,
    canRedo: history.future.length > 0,
    imageBusy,
    background: history.present.background,
    onUndo,
    onRedo,
    onTemplate,
    onApplyPalette,
    onAddText,
    onAddRect,
    onAddImage: () => {
      replaceId.current = null;
      fileRef.current?.click();
    },
    onBackground: (color: string) => {
      const current = historyRef.current?.present;
      if (current) commitDocument(setBackground(current, color));
    },
  };

  function startFrom(document: DesignDocumentV8, options?: { blank?: boolean; label?: string }) {
    const nextHistory = historyFrom(document);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setSelectedId(null);
    setStarted(true);
    setFromBlank(options?.blank === true);
    setShowInspiration(false);
    setNotice(null);
    setError(null);
    setSaveLabel(options?.label ?? "El diseño se guarda en esta sesión.");
    if (typeof window !== "undefined") writeDesign(window.sessionStorage, document);
  }

  function applyInspiration(id: InspirationId) {
    const source = getInspiration(id);
    if (!source) return;
    if (started) {
      const ok = window.confirm(
        "Esto reemplaza el diseño actual del lienzo. ¿Querés continuar?",
      );
      if (!ok) return;
    }
    const document = cloneInspirationDocument(source.document);
    startFrom(document, {
      label: `Empezamos con «${source.name}». Podés cambiar todo.`,
    });
    router.replace(`/crear?inspiracion=${id}`);
  }

  if (!started) {
    if (showInspiration) {
      return (
        <div className="studio-shell mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-10 sm:py-14">
          <InspirationGallery
            previews={inspirationPreviews}
            onPick={applyInspiration}
            onClose={() => setShowInspiration(false)}
          />
        </div>
      );
    }
    return (
      <div className="studio-shell mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-10 sm:py-14">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold text-accent">AtajoLab</p>
          <h1 className="mt-1 text-3xl text-foreground sm:text-4xl">Creá tu cartel QR</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Elegí un ejemplo o empezá desde cero. Después podés cambiar todo sobre el lienzo
            {checkoutEnabled ? ` y comprar por ${formatArs(PIECE_PRICE_ARS)} ${PIECE_CURRENCY}.` : "."}
          </p>
        </header>
        <div className="mt-6">
          <button
            type="button"
            className="text-sm font-semibold text-accent hover:text-accent-strong"
            onClick={() => setShowInspiration(true)}
          >
            Inspiración
          </button>
          <p className="mt-1 text-sm text-muted">Mirá diseños listos y usalos como punto de partida.</p>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {suggestedTemplates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="flex h-full w-full flex-col items-start rounded-3xl border border-line bg-card px-5 py-5 text-left hover:border-accent"
                onClick={() => startFrom(createDocument(template.id))}
              >
                <span className="text-lg font-semibold">{template.name}</span>
                <span className="mt-2 text-sm text-muted">{template.description}</span>
              </button>
            </li>
          ))}
          <li className="sm:col-span-2">
            <button
              type="button"
              className="flex w-full flex-col items-start rounded-3xl border border-dashed border-line bg-card px-5 py-5 text-left hover:border-accent"
              onClick={() => startFrom(createBlankDocument(), { blank: true })}
            >
              <span className="text-lg font-semibold">Desde cero</span>
              <span className="mt-2 text-sm text-muted">
                Lienzo blanco con un título y el código QR. Agregá y reorganizá lo que quieras.
              </span>
            </button>
          </li>
        </ul>
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Más estilos</summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {templateList
              .filter((template) => !suggestedTemplates.some((item) => item.id === template.id))
              .map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className="flex h-full w-full flex-col items-start rounded-3xl border border-line bg-card px-5 py-4 text-left hover:border-accent"
                    onClick={() => startFrom(createDocument(template.id))}
                  >
                    <span className="font-semibold">{template.name}</span>
                    <span className="mt-1 text-sm text-muted">{template.description}</span>
                  </button>
                </li>
              ))}
          </ul>
        </details>
      </div>
    );
  }

  const tips = contextualTips(exportValidation, fromBlank);

  if (showInspiration) {
    return (
      <div className="studio-shell mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-6">
        <InspirationGallery
          previews={inspirationPreviews}
          onPick={applyInspiration}
          onClose={() => setShowInspiration(false)}
        />
      </div>
    );
  }

  return (
    <div className="studio-shell mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground sm:text-3xl">Tu cartel</h1>
          <p className="mt-1 text-sm text-muted">
            Editá directo en el lienzo
            {checkoutEnabled ? ` · ${formatArs(PIECE_PRICE_ARS)} ${PIECE_CURRENCY}` : ""}
          </p>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-accent hover:text-accent-strong"
            onClick={() => setShowInspiration(true)}
          >
            Inspiración
          </button>
        </div>
        <p className="text-xs text-muted" role="status">
          {saveLabel}
          {imageBusy ? " Preparando imagen…" : ""}
        </p>
      </header>
      {tips.length > 0 ? (
        <ul className="mb-4 space-y-1 text-sm text-muted" role="status">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          <p>{error}</p>
          <button type="button" className="shrink-0 font-semibold" onClick={() => setError(null)}>
            Cerrar
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning" role="status">
          <p>{notice}</p>
          <button type="button" className="shrink-0 font-semibold" onClick={() => setNotice(null)}>
            Cerrar
          </button>
        </div>
      ) : null}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_17rem]">
        <aside className="hidden min-w-0 lg:block">
          <StudioToolbar layout="column" {...toolbar} />
        </aside>
        <div className="min-w-0">
          <div className="mb-3 min-w-0 lg:hidden">
            <StudioToolbar layout="row" {...toolbar} />
          </div>
          <StudioCanvas
            document={history.present}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onGeometry={onGeometry}
          />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-auto">
          <StudioProperties
            document={history.present}
            selected={selected}
            validation={validation}
            exportValidation={exportValidation}
            exportBusy={exportBusy}
            exportEnabled={exportEnabled}
            checkoutEnabled={checkoutEnabled}
            prepareBusy={prepareBusy}
            prepareProgress={prepareProgress}
            orderBusy={orderBusy}
            buyerEmail={buyerEmail}
            onBuyerEmailChange={setBuyerEmail}
            onSelect={setSelectedId}
            onCommit={onCommit}
            onEdit={editLive}
            onEditEnd={finishDraft}
            onLayer={(id, direction) => {
              const current = historyRef.current?.present;
              if (!current) return;
              const next = moveLayer(current, id, direction);
              if (elementsCoveringQr(next).length > 0) {
                setNotice("Ese cambio deja algo sobre el QR. El diseño no está listo para exportar.");
              }
              commitDocument(next);
            }}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onRestore={onRestore}
            onRestoreAll={onRestoreAll}
            onDiscard={(id) => {
              const current = historyRef.current?.present;
              if (current) commitDocument(discardParked(current, id));
            }}
            onReplaceImage={(id) => {
              replaceId.current = id;
              fileRef.current?.click();
            }}
            onBringQrForward={onBringQrForward}
            onExport={onExport}
            onCreateOrder={() => {
              void onCreateOrder();
            }}
          />
        </aside>
      </div>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
        aria-label="Subir imagen"
        onChange={onFile}
      />
    </div>
  );
}

function loadInitial(): {
  document: DesignDocumentV8;
  notice: string | null;
  persist: boolean;
  recovered: boolean;
  started: boolean;
  saveLabel: string;
} {
  if (typeof window === "undefined") {
    return {
      document: createDocument("clasico"),
      notice: null,
      persist: false,
      recovered: false,
      started: false,
      saveLabel: "El diseño se guarda en esta sesión.",
    };
  }

  const boot = resolveStudioBootstrap({
    search: window.location.search,
    storage: window.sessionStorage,
  });
  return {
    document: boot.document,
    notice: boot.notice,
    persist: boot.persist,
    recovered: boot.recovered,
    started: boot.started,
    saveLabel: boot.saveLabel,
  };
}

function contextualTips(exportValidation: ExportValidation, fromBlank: boolean): string[] {
  const tips: string[] = [];
  if (fromBlank) {
    tips.push("¿No sabés cómo empezar? Explorá diseños listos para personalizar.");
  }
  const codes = new Set(exportValidation.issues.map((issue) => issue.code));
  if (codes.has("qr-empty") || codes.has("qr-url")) {
    tips.push("El QR necesita un enlace http o https.");
  }
  if (codes.has("qr-covered")) {
    tips.push("Evitá tapar el QR con otros elementos.");
  }
  if (codes.has("qr-contrast")) {
    tips.push("Usá colores con buen contraste en el código QR.");
  }
  return tips;
}

function isField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function qrWasClamped(element: QrElement, raw: ElementBox, next: QrElement): boolean {
  const requested = Math.max(raw.width, raw.height);
  return (
    Math.abs(raw.width - raw.height) > 0.5 ||
    requested < QR_MIN_MM - 0.1 ||
    Math.abs(next.width - requested) > 0.5 ||
    Math.abs(next.x - element.x) > 0.5 ||
    Math.abs(next.y - element.y) > 0.5
  );
}

function qrPatchClamped(element: QrElement, patch: ElementPatch, next: QrElement): boolean {
  const requestedWidth = patch.width ?? element.width;
  const requestedHeight = patch.height ?? element.height;
  return (
    Math.abs(next.width - requestedWidth) > 0.05 ||
    Math.abs(next.height - requestedHeight) > 0.05 ||
    (patch.rotation !== undefined && next.width !== element.width)
  );
}

function studioOrderErrorMessage(code: string): string {
  if (code === "studio-checkout-disabled" || code === "checkout-unavailable") {
    return "El cobro de Studio no está habilitado en este momento.";
  }
  if (code === "studio-draft-key" || code === "origin-rejected") {
    return "La sesión del borrador no es válida. Recargá e intentá de nuevo.";
  }
  if (code === "studio-assets") {
    return "Alguna imagen del pedido no pertenece a esta sesión. Volvé a preparar las imágenes.";
  }
  if (code === "studio-idempotency-conflict") {
    return "Esta compra ya se inició con otro diseño. Prepará de nuevo e intentá otra vez.";
  }
  if (code === "studio-idempotency-key") {
    return "No pudimos validar el intento de compra. Prepará de nuevo e intentá otra vez.";
  }
  if (code === "invalid-email") return "Revisá el correo antes de continuar.";
  if (code === "rate-limited") return "Llegaste al límite de pedidos. Esperá un rato y reintentá.";
  if (code === "database-unavailable" || code === "order-failed") {
    return "No pudimos guardar el pedido. Intentá de nuevo en un momento.";
  }
  return "No pudimos crear el pedido. Intentá de nuevo.";
}
