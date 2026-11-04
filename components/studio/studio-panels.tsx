"use client";

import { NumberField } from "@/components/studio/number-field";
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

  if (layout === "column") {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">{tools}</div>
        <div className="flex flex-col gap-2">{templates}</div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <div className="flex min-w-max gap-2">{tools}</div>
      </div>
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
  onCreateOrder: () => void;
}) {
  const index = selected ? document.elements.findIndex((element) => element.id === selected.id) : -1;
  const blockingIssues = exportValidation.issues.filter((issue) => issue.blocking);
  const busy = prepareBusy || orderBusy;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {checkoutEnabled ? (
        <section className="rounded-3xl border border-accent/30 bg-ok-bg p-4">
          <h2 className="text-sm font-semibold">Comprar · {formatPriceHint()}</h2>
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
          </label>
          <button
            type="button"
            className={`${primaryButton} mt-3`}
            disabled={!exportValidation.ready || busy || !buyerEmail.trim()}
            onClick={onCreateOrder}
          >
            {prepareBusy
              ? prepareProgress ?? "Preparando…"
              : orderBusy
                ? "Creando el pedido…"
                : "Comprar este diseño"}
          </button>
          {!exportValidation.ready && blockingIssues.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {blockingIssues.map((warning) => (
                <li key={`${warning.code}-${warning.elementId}-${warning.message}`}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-warning/30 bg-warning-bg px-3 py-2 text-left text-sm text-warning"
                    onClick={() => warning.elementId && onSelect(warning.elementId)}
                  >
                    {warning.message}
                  </button>
                </li>
              ))}
            </ul>
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
          <ul className="mt-3 flex flex-col gap-2">
            {blockingIssues.map((warning) => (
              <li key={`${warning.code}-${warning.elementId}-${warning.message}`}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-warning/30 bg-card px-3 py-2 text-left text-sm text-warning"
                  onClick={() => warning.elementId && onSelect(warning.elementId)}
                >
                  {warning.message}
                </button>
              </li>
            ))}
          </ul>
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
          <p className="mt-3 text-sm text-muted">Tocá un elemento del cartel para editarlo.</p>
        )}
      </section>

      {document.parked.length > 0 ? (
        <section className="rounded-3xl border border-warning/30 bg-warning-bg p-4">
          <h2 className="text-sm font-semibold text-warning">Fuera del lienzo</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {document.parked.map((element) => (
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
          {document.parked.length > 1 ? (
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
            max={24}
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
          <label className="block text-sm">
            <span className="text-xs font-semibold text-muted">Enlace o texto del QR</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm"
              maxLength={MAX_QR_VALUE}
              placeholder="https://"
              value={element.value}
              onChange={(event) => onEdit(element.id, { value: event.target.value })}
              onBlur={onEditEnd}
            />
          </label>
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
                : "Escribí qué tiene que abrir el código."}
          </p>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X (mm)" value={element.x} min={-40} max={105} onCommit={(x) => onCommit(element.id, { x })} />
        <NumberField label="Y (mm)" value={element.y} min={-40} max={148} onCommit={(y) => onCommit(element.id, { y })} />
        <NumberField
          label="Ancho (mm)"
          value={element.width}
          min={element.type === "qr" ? QR_MIN_MM : 4}
          max={105}
          onCommit={(width) => onCommit(element.id, { width })}
        />
        <NumberField
          label="Alto (mm)"
          value={element.height}
          min={element.type === "qr" ? QR_MIN_MM : 4}
          max={148}
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
        <p className="text-xs text-muted">El código se queda en el cartel. No se puede estirar ni achicar de menos de 22 mm.</p>
      ) : null}
    </div>
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

function formatPriceHint(): string {
  return `${formatArs(PIECE_PRICE_ARS)} ${PIECE_CURRENCY}`;
}
