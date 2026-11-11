"use client";

import Link from "next/link";
import { useState } from "react";
import { QrContentFields, type QrFieldError } from "@/components/guided/qr-content-fields";
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
import { fontMaxMm, formatList, qrMaxMm, type FormatId, type Sheet } from "@/lib/studio/formats";
import { recoverableElements } from "@/lib/studio/canvas-space";
import { elementLabel } from "@/lib/studio/document";
import { formatArs, PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { qrContrastIssue } from "@/lib/studio/qr-rules";
import { templateList } from "@/lib/studio/templates";
import {
  MAX_QR_VALUE,
  MAX_TEXT,
  QR_MIN_MM,
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

export function StudioToolbar({
  layout,
  templateId,
  formatId,
  onFormat,
  canUndo,
  canRedo,
  imageBusy,
  background,
  onUndo,
  onRedo,
  onTemplate,
  onApplyPalette,
  onAddText,
  onAddRect,
  onAddImage,
  onBackground,
}: {
  layout: "row" | "column";
  templateId: TemplateId;
  formatId: FormatId;
  onFormat: (id: FormatId) => void;
  canUndo: boolean;
  canRedo: boolean;
  imageBusy: boolean;
  background: string;
  onUndo: () => void;
  onRedo: () => void;
  onTemplate: (id: TemplateId) => void;
  onApplyPalette: () => void;
  onAddText: () => void;
  onAddRect: () => void;
  onAddImage: () => void;
  onBackground: (color: string) => void;
}) {
  const tools = (
    <>
      <button type="button" className={toolButton} onClick={onUndo} disabled={!canUndo}>
        Deshacer
      </button>
      <button type="button" className={toolButton} onClick={onRedo} disabled={!canRedo}>
        Rehacer
      </button>
      <button type="button" className={toolButton} onClick={onAddText}>
        Texto
      </button>
      <button type="button" className={toolButton} onClick={onAddRect}>
        Rectángulo
      </button>
      <button type="button" className={toolButton} onClick={onAddImage} disabled={imageBusy}>
        {imageBusy ? "Preparando…" : "Imagen"}
      </button>
      <label className={`${toolButton} gap-2`}>
        Fondo
        <input
          aria-label="Color de fondo"
          className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
          type="color"
          value={background}
          onChange={(event) => onBackground(event.target.value)}
        />
      </label>
    </>
  );

  const templates = (
    <>
      {templateList.map((template) => (
        <button
          key={template.id}
          type="button"
          aria-pressed={templateId === template.id}
          className={`${toolButton} h-auto min-w-0 flex-col items-start px-3 py-2 text-left ${templateId === template.id ? "border-accent bg-ok-bg" : ""}`}
          onClick={() => onTemplate(template.id)}
        >
          <span>{template.name}</span>
          <span className="text-xs font-normal text-muted">{template.description}</span>
        </button>
      ))}
      <button type="button" className={`${toolButton} h-auto min-w-0 px-3 py-2 text-left text-sm`} onClick={onApplyPalette}>
        Aplicar colores sugeridos
      </button>
    </>
  );

  const format = (
    <label className="block text-sm">
      <span className="text-xs font-semibold text-muted">Formato</span>
      <select
        className={fieldClass}
        value={formatId}
        onChange={(event) => onFormat(event.target.value as FormatId)}
      >
        {formatList.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.size}
          </option>
        ))}
      </select>
    </label>
  );

  if (layout === "column") {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">{tools}</div>
        {format}
        <div className="flex flex-col gap-2">{templates}</div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <div className="flex min-w-max gap-2">{tools}</div>
      </div>
      {format}
      <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{templates}</div>
    </div>
  );
}

export function StudioProperties({
  document,
  selected,
  validation,
  exportValidation,
  exportBusy,
  exportEnabled,
  checkoutEnabled,
  freeAvailable = false,
  prepareBusy,
  prepareProgress,
  orderBusy,
  buyerEmail,
  onBuyerEmailChange,
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
  onBringQrForward,
  onExport,
  onCreateOrder,
}: {
  document: DesignDocumentV8;
  selected: StudioElement | null;
  validation: DesignValidation;
  exportValidation: ExportValidation;
  exportBusy: boolean;
  exportEnabled: boolean;
  checkoutEnabled: boolean;
  /** The server confirmed this browser can still get its free QR. */
  freeAvailable?: boolean;
  prepareBusy: boolean;
  prepareProgress: string | null;
  orderBusy: boolean;
  buyerEmail: string;
  onBuyerEmailChange: (value: string) => void;
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
  onBringQrForward: () => void;
  onExport: (format: "png" | "svg" | "pdf") => void;
  onCreateOrder: (acceptedTerms: boolean) => void;
}) {
  const index = selected ? document.elements.findIndex((element) => element.id === selected.id) : -1;
  const blockingIssues = exportValidation.issues.filter((issue) => issue.blocking);
  const busy = prepareBusy || orderBusy;
  const recoverable = recoverableElements(document);
  const [termsAccepted, setTermsAccepted] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {checkoutEnabled || freeAvailable ? (
        <section className="rounded-3xl border border-accent/30 bg-ok-bg p-4">
          {freeAvailable ? (
            <>
              <h2 className="text-sm font-semibold">Tu primer QR es gratis</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                Descargalo completo en PNG, SVG y PDF, sin pagar. Es uno por navegador y por correo. Los
                siguientes cuestan {formatPriceHint()}.
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

      <section className="rounded-3xl border border-line bg-card p-4">
        <h2 className="text-sm font-semibold">{selected ? "Seleccionado" : "Propiedades"}</h2>
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
          <p className="mt-3 text-sm text-muted">Tocá un elemento del diseño para editarlo.</p>
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
              <option value="source">Source Sans 3</option>
              <option value="sora">Sora</option>
              <option value="fraunces">Fraunces</option>
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
            max={20}
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
          min={element.type === "qr" ? QR_MIN_MM : element.type === "rect" ? 1 : 4}
          max={element.type === "qr" ? qrMaxMm(sheet) : sheet.widthMm}
          onCommit={(width) => onCommit(element.id, { width })}
        />
        <NumberField
          label="Alto (mm)"
          value={element.height}
          min={element.type === "qr" ? QR_MIN_MM : element.type === "rect" ? 1 : 4}
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
