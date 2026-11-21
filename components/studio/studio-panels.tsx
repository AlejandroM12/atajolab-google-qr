"use client";

import Link from "next/link";
import { useState } from "react";
import { QrContentFields, type QrFieldError } from "@/components/guided/qr-content-fields";
import { DesignThumb } from "@/components/studio/design-thumb";
import { NumberField } from "@/components/studio/number-field";
import {
  buildQrContent,
  decodeQrContent,
  describeQrPayload,
  emptyQrContent,
  qrContentTypes,
  type QrContentInput,
  type QrContentType,
} from "@/lib/qr-content";
import { cornerMaxMm, fontMaxMm, formatList, qrMaxMm, type FormatId, type Sheet } from "@/lib/studio/formats";
import { recoverableElements } from "@/lib/studio/canvas-space";
import { elementLabel } from "@/lib/studio/document";
import { formatArs, PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { accessProblem, closedProblem, type AccessState } from "@/lib/studio/get-qr";
import { qrContrastIssue } from "@/lib/studio/qr-rules";
import { templateList } from "@/lib/studio/templates";
import {
  MAX_QR_VALUE,
  MAX_TEXT,
  QR_MIN_MM,
  RECT_MIN_MM,
  studioFontList,
  type DesignDocumentV8,
  type ElementPatch,
  type StudioElement,
  type TemplateId,
} from "@/lib/studio/types";
import type { ExportValidation } from "@/lib/studio/export/validate";
import type { DesignValidation } from "@/lib/studio/validation";

const toolButton =
  "inline-flex h-10 items-center justify-center rounded-xl border border-line bg-card px-3 text-sm font-semibold text-foreground hover:border-accent disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "inline-flex h-11 w-full items-center justify-center rounded-xl border border-transparent bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass = "mt-1 h-10 w-full rounded-xl border border-line bg-background px-3 text-sm";
const panelTitle = "text-xs font-semibold uppercase tracking-[0.14em] text-muted";

/** Undo and redo, always at hand in the editor header. */
export function HistoryButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button type="button" className={toolButton} onClick={onUndo} disabled={!canUndo}>
        Deshacer
      </button>
      <button type="button" className={toolButton} onClick={onRedo} disabled={!canRedo}>
        Rehacer
      </button>
    </div>
  );
}

/** The six compositions, drawn with the current design so the choice shows its result. */
export function TemplatePanel({
  templateId,
  previews,
  onTemplate,
  onApplyPalette,
}: {
  templateId: TemplateId;
  previews: Record<TemplateId, DesignDocumentV8>;
  onTemplate: (id: TemplateId) => void;
  onApplyPalette: () => void;
}) {
  return (
    <section aria-label="Plantilla">
      <h2 className={panelTitle}>Plantilla</h2>
      <ul className="mt-2 grid grid-cols-3 gap-2 lg:grid-cols-2">
        {templateList.map((template) => {
          const active = templateId === template.id;
          return (
            <li key={template.id}>
              <button
                type="button"
                aria-pressed={active}
                title={template.description}
                className={`flex w-full flex-col items-center rounded-2xl border-2 bg-card p-1.5 text-center transition-colors ${
                  active ? "border-accent" : "border-line hover:border-accent/60"
                }`}
                onClick={() => onTemplate(template.id)}
              >
                <DesignThumb document={previews[template.id]} />
                <span className="mt-1.5 block w-full truncate text-xs font-semibold">{template.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className={`${toolButton} mt-2 w-full`} onClick={onApplyPalette}>
        Usar los colores de la plantilla
      </button>
    </section>
  );
}

export function FormatPanel({ formatId, onFormat }: { formatId: FormatId; onFormat: (id: FormatId) => void }) {
  return (
    <section aria-label="Formato">
      <h2 className={panelTitle}>Formato</h2>
      <ul className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
        {formatList.map((format) => {
          const active = formatId === format.id;
          return (
            <li key={format.id}>
              <button
                type="button"
                aria-pressed={active}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 bg-card px-3 py-2 text-left transition-colors ${
                  active ? "border-accent" : "border-line hover:border-accent/60"
                }`}
                onClick={() => onFormat(format.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{format.name}</span>
                  <span className="block truncate text-xs text-muted">{format.size}</span>
                </span>
                <FormatGlyph widthMm={format.widthMm} heightMm={format.heightMm} active={active} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FormatGlyph({ widthMm, heightMm, active }: { widthMm: number; heightMm: number; active: boolean }) {
  const scale = 22 / Math.max(widthMm, heightMm);
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 rounded-[2px] border-2 ${active ? "border-accent bg-ok-bg" : "border-muted/60"}`}
      style={{ width: Math.round(widthMm * scale), height: Math.round(heightMm * scale) }}
    />
  );
}

export function AddPanel({
  imageBusy,
  background,
  onAddText,
  onAddRect,
  onAddImage,
  onBackground,
}: {
  imageBusy: boolean;
  background: string;
  onAddText: () => void;
  onAddRect: () => void;
  onAddImage: () => void;
  onBackground: (color: string) => void;
}) {
  return (
    <section aria-label="Agregar">
      <h2 className={panelTitle}>Agregar</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={toolButton} onClick={onAddText}>
          + Texto
        </button>
        <button type="button" className={toolButton} onClick={onAddImage} disabled={imageBusy}>
          {imageBusy ? "Preparando…" : "+ Imagen o logo"}
        </button>
        <button type="button" className={toolButton} onClick={onAddRect}>
          + Forma
        </button>
        <label className={`${toolButton} cursor-pointer gap-2`}>
          Fondo
          <input
            aria-label="Color de fondo"
            className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
            type="color"
            value={background}
            onChange={(event) => onBackground(event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

/** Everything about getting the files: the order form, what still blocks it, and the test export. */
export function StudioDownloadPanel({
  validation,
  exportValidation,
  exportBusy,
  exportEnabled,
  checkoutEnabled,
  freeAvailable = false,
  access,
  onRetryAccess,
  prepareBusy,
  prepareProgress,
  orderBusy,
  buyerEmail,
  onBuyerEmailChange,
  onSelect,
  onBringQrForward,
  onExport,
  onCreateOrder,
}: {
  validation: DesignValidation;
  exportValidation: ExportValidation;
  exportBusy: boolean;
  exportEnabled: boolean;
  checkoutEnabled: boolean;
  /** The server confirmed this browser can still get its free QR. */
  freeAvailable?: boolean;
  /** What the server said this browser can get; explains the closed state. */
  access: AccessState;
  onRetryAccess: () => void;
  prepareBusy: boolean;
  prepareProgress: string | null;
  orderBusy: boolean;
  buyerEmail: string;
  onBuyerEmailChange: (value: string) => void;
  onSelect: (id: string | null) => void;
  onBringQrForward: () => void;
  onExport: (format: "png" | "svg" | "pdf") => void;
  onCreateOrder: (acceptedTerms: boolean) => void;
}) {
  const blockingIssues = exportValidation.issues.filter((issue) => issue.blocking);
  const busy = prepareBusy || orderBusy;
  const [termsAccepted, setTermsAccepted] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {checkoutEnabled || freeAvailable ? (
        <section className="rounded-3xl border border-accent/30 bg-ok-bg p-4">
          {freeAvailable ? (
            <>
              <h2 className="text-sm font-semibold">Tu primer QR es gratis</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                Descargalo completo en PNG, SVG y PDF, sin pagar. Es uno por navegador y por correo.
                {checkoutEnabled ? ` Los siguientes cuestan ${formatPriceHint()}.` : ""}
              </p>
            </>
          ) : (
            <h2 className="text-sm font-semibold">Comprar · {formatPriceHint()}</h2>
          )}
          <label className="mt-3 block text-sm">
            <span className="font-semibold">Tu correo</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={254}
              value={buyerEmail}
              onChange={(event) => onBuyerEmailChange(event.target.value)}
              disabled={busy}
              required
              className="mt-2 h-11 w-full rounded-xl border border-line bg-background px-3 text-sm"
            />
            <span className="mt-1 block text-xs leading-5 text-muted">
              {freeAvailable
                ? "Lo usamos para que puedas recuperar tus archivos."
                : "Te enviamos ahí el acceso a tus archivos. Lo usamos solo para esta compra."}
            </span>
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs leading-5">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Acepto los{" "}
              <Link href="/terminos" target="_blank" className="underline">
                términos y condiciones
              </Link>{" "}
              y la{" "}
              <Link href="/privacidad" target="_blank" className="underline">
                política de privacidad
              </Link>
              {freeAvailable
                ? ". Es un producto digital: los archivos se habilitan al instante."
                : ". Es un producto digital: los archivos se habilitan al confirmarse el pago."}
            </span>
          </label>
          <button
            type="button"
            className={`${primaryButton} mt-3`}
            disabled={!exportValidation.ready || busy || !buyerEmail.trim() || !termsAccepted}
            onClick={() => onCreateOrder(termsAccepted)}
          >
            {prepareBusy
              ? prepareProgress ?? "Preparando…"
              : orderBusy
                ? "Creando el pedido…"
                : freeAvailable
                  ? "Descargar gratis"
                  : "Comprar este diseño"}
          </button>
          {!exportValidation.ready && blockingIssues.length > 0 ? (
            <BlockingIssueList issues={blockingIssues} onSelect={onSelect} tone="bg-warning-bg" />
          ) : null}
          {validation.coveredBy.length > 0 ? (
            <button type="button" className={`${toolButton} mt-3 w-full`} onClick={onBringQrForward}>
              Traer QR al frente
            </button>
          ) : null}
        </section>
      ) : blockingIssues.length > 0 ? (
        <section className="rounded-3xl border border-warning/30 bg-warning-bg p-4">
          <h2 className="text-sm font-semibold text-warning">Para continuar</h2>
          <BlockingIssueList issues={blockingIssues} onSelect={onSelect} tone="bg-card" />
          {validation.coveredBy.length > 0 ? (
            <button type="button" className={`${toolButton} mt-3 w-full`} onClick={onBringQrForward}>
              Traer QR al frente
            </button>
          ) : null}
        </section>
      ) : null}

      {exportEnabled ? (
        <section className="rounded-3xl border border-line bg-card p-4">
          <h2 className="text-sm font-semibold">Descarga de prueba</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["png", "svg", "pdf"] as const).map((format) => (
              <button
                key={format}
                type="button"
                className={`${toolButton} uppercase`}
                disabled={!exportValidation.ready || exportBusy}
                onClick={() => onExport(format)}
              >
                {format}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {!checkoutEnabled && !freeAvailable && blockingIssues.length === 0 ? (
        <UnavailableNotice access={access} onRetry={onRetryAccess} />
      ) : null}
    </div>
  );
}

export function StudioProperties({
  document,
  selected,
  onSelect,
  onCommit,
  onEdit,
  onEditEnd,
  onLayer,
  onDuplicate,
  onDelete,
  onRestore,
  onRestoreAll,
  onDiscard,
  onReplaceImage,
}: {
  document: DesignDocumentV8;
  selected: StudioElement | null;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, patch: ElementPatch) => void;
  onEdit: (id: string, patch: ElementPatch) => void;
  onEditEnd: () => void;
  onLayer: (id: string, direction: "up" | "down") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onRestoreAll: () => void;
  onDiscard: (id: string) => void;
  onReplaceImage: (id: string) => void;
}) {
  const index = selected ? document.elements.findIndex((element) => element.id === selected.id) : -1;
  const recoverable = recoverableElements(document);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="rounded-3xl border border-line bg-card p-4">
        <h2 className="text-sm font-semibold">{selected ? "Editar" : "Editar: tocá un elemento"}</h2>
        {selected ? (
          <ElementFields
            element={selected}
            sheet={document.format}
            canForward={index >= 0 && index < document.elements.length - 1}
            canBackward={index > 0}
            onCommit={onCommit}
            onEdit={onEdit}
            onEditEnd={onEditEnd}
            onLayer={onLayer}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onReplaceImage={onReplaceImage}
          />
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {document.elements
              .filter((element) => element.type !== "rect")
              .map((element) => (
                <li key={element.id}>
                  <button
                    type="button"
                    className={`${toolButton} h-auto min-h-10 w-full justify-start gap-2 py-2 text-left`}
                    onClick={() => onSelect(element.id)}
                  >
                    <span className="shrink-0 text-xs font-normal text-muted">
                      {element.type === "qr" ? "Código" : element.type === "image" ? "Imagen" : "Texto"}
                    </span>
                    <span className="min-w-0 truncate">{elementLabel(element)}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      {recoverable.length > 0 ? (
        <section className="rounded-3xl border border-warning/30 bg-warning-bg p-4">
          <h2 className="text-sm font-semibold text-warning">Fuera del lienzo</h2>
          <p className="mt-1 text-xs leading-5 text-muted">Quedaron fuera del área que se imprime.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {recoverable.map((element) => (
              <li key={element.id} className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{elementLabel(element)}</span>
                <button type="button" className={toolButton} onClick={() => onRestore(element.id)}>
                  Recuperar
                </button>
                <button type="button" className={toolButton} onClick={() => onDiscard(element.id)}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          {recoverable.length > 1 ? (
            <button type="button" className={`${toolButton} mt-3`} onClick={onRestoreAll}>
              Recuperar todos
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ElementFields({
  element,
  sheet,
  canForward,
  canBackward,
  onCommit,
  onEdit,
  onEditEnd,
  onLayer,
  onDuplicate,
  onDelete,
  onReplaceImage,
}: {
  element: StudioElement;
  sheet: Sheet;
  canForward: boolean;
  canBackward: boolean;
  onCommit: (id: string, patch: ElementPatch) => void;
  onEdit: (id: string, patch: ElementPatch) => void;
  onEditEnd: () => void;
  onLayer: (id: string, direction: "up" | "down") => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReplaceImage: (id: string) => void;
}) {
  const qrIssue = element.type === "qr" ? qrContrastIssue(element.foreground, element.background) : null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm font-semibold">{elementLabel(element)}</p>
      {element.type === "text" ? (
        <>
          <label className="block text-sm">
            <span className="text-xs font-semibold text-muted">Texto</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm"
              maxLength={MAX_TEXT}
              value={element.text}
              onChange={(event) => onEdit(element.id, { text: event.target.value })}
              onBlur={onEditEnd}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-semibold text-muted">Tipografía</span>
            <select
              className={fieldClass}
              value={element.font}
              onChange={(event) => onCommit(element.id, { font: event.target.value as ElementPatch["font"] })}
            >
              {studioFontList.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Tamaño (mm)"
            value={element.fontSize}
            min={2}
            max={fontMaxMm(sheet)}
            onCommit={(fontSize) => onCommit(element.id, { fontSize })}
          />
          <ColorField label="Color" value={element.fill} onChange={(fill) => onCommit(element.id, { fill })} />
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["left", "Izquierda"],
                ["center", "Centro"],
                ["right", "Derecha"],
              ] as const
            ).map(([align, label]) => (
              <button
                key={align}
                type="button"
                aria-pressed={element.align === align}
                className={`${toolButton} ${element.align === align ? "border-accent bg-ok-bg" : ""}`}
                onClick={() => onCommit(element.id, { align })}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {element.type === "rect" ? (
        <>
          <ColorField label="Color" value={element.fill} onChange={(fill) => onCommit(element.id, { fill })} />
          <NumberField
            label="Esquinas (mm)"
            value={element.cornerRadius}
            min={0}
            max={cornerMaxMm(sheet)}
            onCommit={(cornerRadius) => onCommit(element.id, { cornerRadius })}
          />
        </>
      ) : null}
      {element.type === "image" ? (
        <>
          <label className="block text-sm">
            <span className="text-xs font-semibold text-muted">Descripción</span>
            <input
              className={fieldClass}
              value={element.alt}
              maxLength={80}
              onChange={(event) => onEdit(element.id, { alt: event.target.value })}
              onBlur={onEditEnd}
            />
          </label>
          <button type="button" className={toolButton} onClick={() => onReplaceImage(element.id)}>
            Cambiar imagen
          </button>
        </>
      ) : null}
      {element.type === "qr" ? (
        <>
          <QrContentEditor
            key={`${element.id}:${element.value}`}
            value={element.value}
            onApply={(value) => onCommit(element.id, { value })}
          />
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-muted">Editar el contenido como texto</summary>
            <textarea
              aria-label="Contenido del QR como texto"
              className="mt-2 min-h-20 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm"
              maxLength={MAX_QR_VALUE}
              placeholder="https://"
              value={element.value}
              onChange={(event) => onEdit(element.id, { value: event.target.value })}
              onBlur={onEditEnd}
            />
          </details>
          <ColorField
            label="Color del código"
            value={element.foreground}
            onChange={(foreground) => onCommit(element.id, { foreground })}
          />
          <ColorField
            label="Fondo del código"
            value={element.background}
            onChange={(background) => onCommit(element.id, { background })}
          />
          <p className={`text-sm ${qrIssue || !element.value.trim() ? "text-warning" : "text-muted"}`} role="status">
            {qrIssue
              ? qrIssue.message
              : element.value.trim()
                ? "El contraste alcanza para escanear. El margen claro es la zona de seguridad."
                : "Cargá qué tiene que abrir el código."}
          </p>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X (mm)" value={element.x} min={-40} max={sheet.widthMm} onCommit={(x) => onCommit(element.id, { x })} />
        <NumberField label="Y (mm)" value={element.y} min={-40} max={sheet.heightMm} onCommit={(y) => onCommit(element.id, { y })} />
        <NumberField
          label="Ancho (mm)"
          value={element.width}
          min={element.type === "qr" ? QR_MIN_MM : element.type === "rect" ? RECT_MIN_MM : 4}
          max={element.type === "qr" ? qrMaxMm(sheet) : sheet.widthMm}
          onCommit={(width) => onCommit(element.id, { width })}
        />
        <NumberField
          label="Alto (mm)"
          value={element.height}
          min={element.type === "qr" ? QR_MIN_MM : element.type === "rect" ? RECT_MIN_MM : 4}
          max={element.type === "qr" ? qrMaxMm(sheet) : sheet.heightMm}
          onCommit={(height) => onCommit(element.id, { height })}
        />
      </div>
      <NumberField
        label="Rotación (°)"
        value={element.rotation}
        min={-180}
        max={180}
        onCommit={(rotation) => onCommit(element.id, { rotation })}
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={toolButton} disabled={!canForward} onClick={() => onLayer(element.id, "up")}>
          Adelante
        </button>
        <button type="button" className={toolButton} disabled={!canBackward} onClick={() => onLayer(element.id, "down")}>
          Atrás
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={element.type === "qr"}
          onClick={() => onDuplicate(element.id)}
        >
          Duplicar
        </button>
        <button type="button" className={toolButton} disabled={element.type === "qr"} onClick={() => onDelete(element.id)}>
          Eliminar
        </button>
      </div>
      {element.type === "qr" ? (
        <p className="text-xs text-muted">El código se queda en el diseño. No se puede estirar ni achicar de menos de 22 mm.</p>
      ) : null}
    </div>
  );
}

/** What the code opens, with the same short forms as the guided flow. */
function QrContentEditor({ value, onApply }: { value: string; onApply: (value: string) => void }) {
  const [open, setOpen] = useState(value.trim().length === 0);
  const [draft, setDraft] = useState<QrContentInput>(() => decodeQrContent(value));
  const [error, setError] = useState<QrFieldError>(null);

  if (!open) {
    return (
      <div className="rounded-xl border border-line bg-background px-3 py-2.5">
        <p className="text-xs font-semibold text-muted">El código abre</p>
        <p className="mt-0.5 break-words text-sm font-semibold">{describeQrPayload(value)}</p>
        <button type="button" className={`${toolButton} mt-2 w-full`} onClick={() => setOpen(true)}>
          Cambiar contenido
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line bg-background p-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const built = buildQrContent(draft);
        if (!built.ok) {
          setError({ field: built.field, message: built.message });
          return;
        }
        setError(null);
        if (built.value === value) setOpen(false);
        else onApply(built.value);
      }}
    >
      <label className="block text-sm">
        <span className="text-xs font-semibold text-muted">¿Qué abre el código?</span>
        <select
          className={fieldClass}
          value={draft.type}
          onChange={(event) => {
            setError(null);
            setDraft(emptyQrContent(event.target.value as QrContentType));
          }}
        >
          {qrContentTypes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <QrContentFields
        value={draft}
        error={error}
        onChange={(next) => {
          setError(null);
          setDraft(next);
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" className={primaryButton}>
          Aplicar
        </button>
        {value.trim() ? (
          <button type="button" className={`${toolButton} h-11`} onClick={() => setOpen(false)}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input
        className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-line bg-background px-2"
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** Blocking design issues; each one selects the element it refers to. */
function BlockingIssueList({
  issues,
  onSelect,
  tone,
}: {
  issues: ExportValidation["issues"];
  onSelect: (id: string | null) => void;
  tone: "bg-warning-bg" | "bg-card";
}) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {issues.map((warning) => (
        <li key={`${warning.code}-${warning.elementId}-${warning.message}`}>
          <button
            type="button"
            className={`w-full rounded-xl border border-warning/30 ${tone} px-3 py-2 text-left text-sm text-warning`}
            onClick={() => warning.elementId && onSelect(warning.elementId)}
          >
            {warning.message}
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatPriceHint(): string {
  return `${formatArs(PIECE_PRICE_ARS)} ${PIECE_CURRENCY}`;
}

/** Why nothing can be obtained right now, in the words of the real cause. */
function UnavailableNotice({ access, onRetry }: { access: AccessState; onRetry: () => void }) {
  if (access.kind === "checking") {
    return (
      <section className="rounded-3xl border border-line bg-card p-4" role="status">
        <h2 className="text-sm font-semibold">Comprobando qué tenés disponible…</h2>
      </section>
    );
  }
  const problem =
    access.kind === "error"
      ? accessProblem(access.reason)
      : access.kind === "closed"
        ? closedProblem(access.reason)
        : null;
  if (!problem) return null;
  return (
    <section
      className="rounded-3xl border border-line bg-card p-4"
      data-testid="descarga-no-disponible"
      data-kind={problem.kind}
    >
      <h2 className="text-sm font-semibold">{problem.title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">{problem.message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {problem.action === "retry" ? (
          <button type="button" className={toolButton} onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
        {problem.action === "reload" ? (
          <button type="button" className={toolButton} onClick={() => window.location.reload()}>
            Recargar la página
          </button>
        ) : null}
        {problem.action === "recover" ? (
          <Link href="/recuperar" className={toolButton}>
            Recuperar mis descargas
          </Link>
        ) : null}
        {problem.action === "support" || problem.action === "recover" ? (
          <Link href="/contacto" className={toolButton}>
            Contacto
          </Link>
        ) : null}
      </div>
    </section>
  );
}
