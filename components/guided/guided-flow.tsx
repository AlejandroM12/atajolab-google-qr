"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { QrContentFields, type QrFieldError } from "@/components/guided/qr-content-fields";
import { trackEvent } from "@/lib/analytics";
import {
  buildQrContent,
  emptyQrContent,
  qrContentTypes,
  readQrContentInput,
  type QrContentInput,
  type QrContentType,
} from "@/lib/qr-content";
import { DEFAULT_FORMAT_ID, formatList, formatSpec, isFormatId, type FormatId } from "@/lib/studio/formats";
import { readDesign, writeDesign } from "@/lib/studio/persistence";
import {
  PROPOSAL_NAME_MAX,
  isStyleId,
  recommendedStyle,
  styleList,
  styleSpec,
  type StyleId,
  type StyleSpec,
} from "@/lib/studio/proposal-options";
import { parseDesign } from "@/lib/studio/serialize";
import type { DesignDocumentV8 } from "@/lib/studio/types";

const STORAGE_KEY = "atajolab.guiado.v1";
const STEPS = ["Contenido", "Datos", "Estilo", "Formato", "Propuestas"] as const;

type Step = 0 | 1 | 2 | 3 | 4;

type FlowState = {
  step: Step;
  content: QrContentInput | null;
  name: string;
  styleId: StyleId;
  /** True once the user picked a style, so a new content type stops changing it. */
  stylePicked: boolean;
  formatId: FormatId;
};

type ProposalCard = { id: string; name: string; preview: string; document: DesignDocumentV8 };

/** The answer for one request key. Anything with another key is stale and counts as loading. */
type ProposalsState =
  | { status: "idle" }
  | { status: "ready"; key: string; proposals: ProposalCard[] }
  | { status: "error"; key: string; message: string };

const primaryButton =
  "inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50";
const tileClass =
  "flex h-full w-full flex-col items-start rounded-3xl border bg-card p-4 text-left transition-colors hover:border-accent";

const DATA_TITLES: Record<QrContentType, string> = {
  url: "¿A dónde lleva el código?",
  social: "¿Cuál es tu perfil?",
  whatsapp: "¿A qué WhatsApp escriben?",
  maps: "Tu ubicación en Google Maps",
  review: "Tu enlace de reseñas de Google",
  menu: "¿Dónde está tu menú o catálogo?",
  event: "¿Dónde está la información del evento?",
  wifi: "Datos de tu Wi-Fi",
  vcard: "Datos de contacto",
  text: "¿Qué texto querés mostrar?",
};

export function GuidedFlow({ priceNote }: { priceNote: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<FlowState>(loadState);
  const [error, setError] = useState<QrFieldError>(null);
  const [proposals, setProposals] = useState<ProposalsState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const request = useRef(0);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* The flow still works without storage; it just does not survive a reload. */
    }
  }, [state]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const proposalsKey = state.content
    ? JSON.stringify([state.content, state.name, state.styleId, state.formatId, attempt])
    : "";
  const answered = proposals.status !== "idle" && proposals.key === proposalsKey;

  useEffect(() => {
    if (state.step !== 4 || !state.content || answered) return;
    const current = ++request.current;
    const controller = new AbortController();
    void loadProposals(
      { content: state.content, name: state.name, styleId: state.styleId, formatId: state.formatId },
      controller.signal,
    ).then((result) => {
      if (current !== request.current) return;
      if (result.ok) {
        setProposals({ status: "ready", key: proposalsKey, proposals: result.proposals });
      } else if (result.field && result.field !== "format") {
        // The server found a problem with the data: show it on the field it belongs to.
        setError({ field: result.field, message: result.message });
        setProposals({ status: "idle" });
        setState((value) => ({ ...value, step: 1 }));
      } else {
        setProposals({ status: "error", key: proposalsKey, message: result.message });
      }
    });
    return () => controller.abort();
    // proposalsKey covers every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, proposalsKey, answered]);

  const loading = state.step === 4 && !answered;
  const failure = (message: string) => setProposals({ status: "error", key: proposalsKey, message });

  function go(step: Step) {
    setError(null);
    setState((value) => ({ ...value, step }));
  }

  function pickType(type: QrContentType) {
    setError(null);
    setState((value) => ({
      ...value,
      step: 1,
      content: value.content?.type === type ? value.content : emptyQrContent(type),
      styleId: value.stylePicked ? value.styleId : recommendedStyle(type),
    }));
  }

  function submitData() {
    if (!state.content) return;
    const built = buildQrContent(state.content);
    if (!built.ok) {
      setError({ field: built.field, message: built.message });
      return;
    }
    go(2);
  }

  function retry() {
    setAttempt((value) => value + 1);
  }

  function customize(card: ProposalCard) {
    const parsed = parseDesign(JSON.stringify(card.document));
    if (!parsed) {
      failure("No pudimos abrir esa propuesta. Probá de nuevo.");
      return;
    }
    const existing = readDesign(window.sessionStorage);
    if (existing && !sameQr(existing.document, parsed.document)) {
      const ok = window.confirm("Ya tenés un diseño en el editor. Esta propuesta lo reemplaza. ¿Querés continuar?");
      if (!ok) return;
    }
    const saved = writeDesign(window.sessionStorage, parsed.document);
    if (!saved.ok) {
      failure("Tu navegador no nos deja guardar el diseño. Revisá que no estés en modo privado y probá de nuevo.");
      return;
    }
    trackEvent("guided_proposal_picked", {
      content: state.content?.type ?? "",
      format: state.formatId,
      style: state.styleId,
      design: card.id.split("-").pop() ?? "",
    });
    router.push("/crear?origen=guiado");
  }

  const type = state.content?.type ?? null;
  const reached = state.content ? (buildQrContent(state.content).ok ? 4 : 1) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <nav aria-label="Pasos" className="mb-8">
        <ol className="flex items-center gap-1.5 sm:gap-2">
          {STEPS.map((label, index) => {
            const current = index === state.step;
            const available = index <= reached && index !== state.step;
            return (
              <li key={label} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={!available}
                  aria-current={current ? "step" : undefined}
                  onClick={() => go(index as Step)}
                  className="group block w-full text-left disabled:cursor-default"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-colors ${
                      index <= state.step ? "bg-accent" : "bg-line"
                    } ${available ? "group-hover:bg-accent-strong" : ""}`}
                  />
                  <span
                    className={`mt-2 block truncate text-xs font-semibold max-sm:sr-only ${
                      current ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {index + 1}. {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs font-semibold text-muted sm:hidden" aria-hidden="true">
          Paso {state.step + 1} de {STEPS.length} · <span className="text-foreground">{STEPS[state.step]}</span>
        </p>
      </nav>

      {state.step === 0 ? (
        <section aria-labelledby="paso-titulo">
          <StepHeading ref={headingRef} title="¿Qué querés compartir?">
            Elegí una opción y armamos el código y el diseño por vos.{priceNote ? ` ${priceNote}` : ""}
          </StepHeading>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {qrContentTypes.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${tileClass} ${type === item.id ? "border-accent" : "border-line"}`}
                  onClick={() => pickType(item.id)}
                >
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-ok-bg text-accent-strong">
                    <TypeIcon type={item.id} />
                  </span>
                  <span className="mt-3 text-sm font-semibold leading-snug">{item.name}</span>
                  <span className="mt-1 text-xs leading-5 text-muted">{item.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-muted">
            ¿Preferís diseñar desde cero?{" "}
            <Link href="/crear" className="font-semibold text-accent underline-offset-4 hover:underline">
              Abrir el editor avanzado
            </Link>
          </p>
        </section>
      ) : null}

      {state.step === 1 && state.content ? (
        <section aria-labelledby="paso-titulo" className="mx-auto max-w-xl">
          <StepHeading ref={headingRef} title={DATA_TITLES[state.content.type]} />
          <form
            className="mt-6 flex flex-col gap-5 rounded-3xl border border-line bg-card p-5 sm:p-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submitData();
            }}
          >
            <QrContentFields
              value={state.content}
              error={error}
              onChange={(content) => {
                setError(null);
                setState((value) => ({ ...value, content }));
              }}
            />
            {state.content.type !== "vcard" ? (
              <div className="border-t border-line pt-5">
                <label htmlFor="guiado-nombre" className="text-sm font-semibold">
                  {state.content.type === "event" ? "Nombre del evento (opcional)" : "Nombre de tu negocio o marca (opcional)"}
                </label>
                <input
                  id="guiado-nombre"
                  className="mt-1.5 h-12 w-full rounded-xl border border-line bg-background px-3 text-base"
                  type="text"
                  autoComplete="organization"
                  maxLength={PROPOSAL_NAME_MAX}
                  value={state.name}
                  onChange={(event) => setState((value) => ({ ...value, name: event.target.value }))}
                />
                <p className="mt-1.5 text-sm text-muted">Aparece en el diseño. Después lo podés cambiar.</p>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <BackButton onClick={() => go(0)} />
              <button type="submit" className={primaryButton}>
                Continuar
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {state.step === 2 ? (
        <section aria-labelledby="paso-titulo">
          <StepHeading ref={headingRef} title="Elegí un estilo">
            Define los colores de las propuestas. En el editor podés cambiar cada color.
          </StepHeading>
          <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {styleList.map((style) => (
              <li key={style.id}>
                <button
                  type="button"
                  aria-pressed={state.styleId === style.id}
                  className={`${tileClass} ${state.styleId === style.id ? "border-accent" : "border-line"}`}
                  onClick={() => setState((value) => ({ ...value, styleId: style.id, stylePicked: true, step: 3 }))}
                >
                  <StyleSwatch style={style} />
                  <span className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {style.name}
                    {type && recommendedStyle(type) === style.id ? (
                      <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-accent-strong">
                        Sugerido
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 text-xs leading-5 text-muted">{style.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <BackButton onClick={() => go(1)} />
          </div>
        </section>
      ) : null}

      {state.step === 3 ? (
        <section aria-labelledby="paso-titulo">
          <StepHeading ref={headingRef} title="¿Dónde lo vas a usar?">
            Cada formato se descarga en PNG, SVG y PDF, en su tamaño real.
          </StepHeading>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {formatList.map((format) => (
              <li key={format.id}>
                <button
                  type="button"
                  aria-pressed={state.formatId === format.id}
                  className={`${tileClass} ${state.formatId === format.id ? "border-accent" : "border-line"}`}
                  onClick={() => setState((value) => ({ ...value, formatId: format.id, step: 4 }))}
                >
                  <span className="flex h-20 w-full items-center justify-center rounded-2xl bg-background">
                    <span
                      aria-hidden="true"
                      className="block rounded-[3px] border-2 border-accent bg-card"
                      style={shapeStyle(format.widthMm, format.heightMm)}
                    />
                  </span>
                  <span className="mt-3 text-sm font-semibold leading-snug">{format.use}</span>
                  <span className="mt-1 text-xs leading-5 text-muted">
                    {format.name} · {format.size}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <BackButton onClick={() => go(2)} />
          </div>
        </section>
      ) : null}

      {state.step === 4 ? (
        <section aria-labelledby="paso-titulo" aria-busy={loading}>
          <StepHeading ref={headingRef} title="Elegí tu propuesta">
            Son diseños reales con tu código. Elegí uno y cambiá lo que quieras en el editor.
          </StepHeading>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <SummaryChip label="Estilo" value={styleSpec(state.styleId).name} onClick={() => go(2)} />
            <SummaryChip label="Formato" value={formatSpec(state.formatId).name} onClick={() => go(3)} />
          </div>

          {!loading && proposals.status === "error" ? (
            <div className="mt-8 rounded-3xl border border-danger/30 bg-danger-bg p-5 text-sm text-danger" role="alert">
              <p className="font-semibold">{proposals.message}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className={primaryButton} onClick={retry}>
                  Reintentar
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 items-center rounded-full border border-line bg-card px-5 font-semibold text-foreground hover:border-accent"
                  onClick={() => go(3)}
                >
                  Cambiar formato
                </button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <>
              <p className="sr-only" role="status">
                Armando las propuestas…
              </p>
              <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <li key={index} className="rounded-3xl border border-line bg-card p-3">
                    <div
                      className="w-full animate-pulse rounded-lg bg-line/60 motion-reduce:animate-none"
                      style={{ aspectRatio: aspect(state.formatId) }}
                    />
                    <div className="mt-3 h-4 w-24 rounded-full bg-line/60" />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {!loading && proposals.status === "ready" ? (
            <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {proposals.proposals.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    className="group flex h-full w-full flex-col rounded-3xl border border-line bg-card p-3 text-left transition-colors hover:border-accent"
                    onClick={() => customize(card)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- data: URL drawn by the export engine */}
                    <img
                      src={card.preview}
                      alt={`Propuesta ${card.name}`}
                      className="block h-auto w-full rounded-lg border border-line/70"
                      style={{ aspectRatio: aspect(state.formatId) }}
                    />
                    <span className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{card.name}</span>
                      <span className="text-sm font-semibold text-accent group-hover:text-accent-strong">
                        Personalizar →
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-8">
            <BackButton onClick={() => go(3)} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function loadState(): FlowState {
  const fallback: FlowState = {
    step: 0,
    content: null,
    name: "",
    styleId: "clasico",
    stylePicked: false,
    formatId: DEFAULT_FORMAT_ID,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const content = readQrContentInput(saved.content);
    if (!content) return fallback;
    const step = typeof saved.step === "number" && [0, 1, 2, 3, 4].includes(saved.step) ? (saved.step as Step) : 1;
    return {
      // Never land past the data step with data that no longer validates.
      step: step > 1 && !buildQrContent(content).ok ? 1 : step,
      content,
      name: typeof saved.name === "string" ? saved.name.slice(0, PROPOSAL_NAME_MAX) : "",
      styleId: isStyleId(saved.styleId) ? saved.styleId : recommendedStyle(content.type),
      stylePicked: saved.stylePicked === true,
      formatId: isFormatId(saved.formatId) ? saved.formatId : DEFAULT_FORMAT_ID,
    };
  } catch {
    return fallback;
  }
}

type LoadResult =
  | { ok: true; proposals: ProposalCard[] }
  | { ok: false; field: string | null; message: string };

async function loadProposals(
  body: { content: QrContentInput; name: string; styleId: StyleId; formatId: FormatId },
  signal: AbortSignal,
): Promise<LoadResult> {
  const failure = "No pudimos armar las propuestas. Revisá tu conexión y probá de nuevo.";
  try {
    const response = await fetch("/api/studio/proposals", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.status === 429) {
      return { ok: false, field: null, message: "Pediste muchas propuestas seguidas. Esperá unos minutos y probá de nuevo." };
    }
    if (response.status === 422 && typeof payload?.message === "string") {
      return { ok: false, field: typeof payload.field === "string" ? payload.field : null, message: payload.message };
    }
    if (!response.ok || !Array.isArray(payload?.proposals)) return { ok: false, field: null, message: failure };
    const proposals: ProposalCard[] = [];
    for (const item of payload.proposals as Record<string, unknown>[]) {
      if (typeof item?.id !== "string" || typeof item.name !== "string" || typeof item.preview !== "string") continue;
      if (!item.preview.startsWith("data:image/png;base64,") || typeof item.document !== "object") continue;
      proposals.push({ id: item.id, name: item.name, preview: item.preview, document: item.document as DesignDocumentV8 });
    }
    return proposals.length > 0 ? { ok: true, proposals } : { ok: false, field: null, message: failure };
  } catch {
    return { ok: false, field: null, message: failure };
  }
}

function sameQr(a: DesignDocumentV8, b: DesignDocumentV8): boolean {
  const value = (document: DesignDocumentV8) => document.elements.find((element) => element.type === "qr")?.value ?? "";
  return value(a) === value(b);
}

function aspect(formatId: FormatId): string {
  const format = formatSpec(formatId);
  return `${format.widthMm} / ${format.heightMm}`;
}

/** A small outline with the proportions of the sheet, at most 56 px on its long side. */
function shapeStyle(widthMm: number, heightMm: number): { width: number; height: number } {
  const scale = 56 / Math.max(widthMm, heightMm);
  return { width: Math.round(widthMm * scale), height: Math.round(heightMm * scale) };
}

function StepHeading({
  ref,
  title,
  children,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="max-w-2xl">
      <h1 id="paso-titulo" ref={ref} tabIndex={-1} className="text-3xl font-semibold text-foreground outline-none sm:text-4xl">
        {title}
      </h1>
      {children ? <p className="mt-3 text-base leading-relaxed text-muted">{children}</p> : null}
    </header>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-12 items-center rounded-full px-2 text-sm font-semibold text-muted hover:text-foreground"
      onClick={onClick}
    >
      ← Volver
    </button>
  );
}

function SummaryChip({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-4 hover:border-accent"
      onClick={onClick}
    >
      <span className="text-muted">{label}:</span>
      <span className="font-semibold">{value}</span>
      <span className="font-semibold text-accent">Cambiar</span>
    </button>
  );
}

/** The style's own colors on a tiny poster, so the choice shows what it does. */
function StyleSwatch({ style }: { style: StyleSpec }) {
  const tone = style.tones[0];
  return (
    <span
      aria-hidden="true"
      className="relative block h-24 w-full overflow-hidden rounded-2xl border border-line/70"
      style={{ background: tone.paper }}
    >
      <span className="absolute inset-x-0 top-0 block h-7" style={{ background: tone.primary }} />
      <span className="absolute left-3 top-10 block h-1.5 w-1/2 rounded-full" style={{ background: tone.ink }} />
      <span className="absolute left-3 top-14 block h-1.5 w-1/4 rounded-full" style={{ background: tone.accent }} />
      <span className="absolute bottom-3 right-3 block size-8 rounded-[4px] bg-white p-1">
        <span className="block size-full rounded-[2px]" style={{ background: "#14221f" }} />
      </span>
    </span>
  );
}

function TypeIcon({ type }: { type: QrContentType }) {
  const paths: Record<QrContentType, ReactNode> = {
    url: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </>
    ),
    social: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17" cy="7" r="0.6" fill="currentColor" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M4 20l1.3-4.2A8 8 0 1 1 8.3 19L4 20z" />
        <path d="M9.5 9.2c0 3 2.3 5.3 5.3 5.3" />
      </>
    ),
    maps: (
      <>
        <path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
        <circle cx="12" cy="10.5" r="2.3" />
      </>
    ),
    review: <path d="M12 3.5l2.6 5.3 5.9.900-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5z" />,
    menu: (
      <>
        <path d="M7 3.5v7a2.5 2.5 0 0 0 5 0v-7M9.5 3.5v17M17 20.5v-17c-2 1.5-3 4-3 7.5h3" />
      </>
    ),
    event: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
    wifi: (
      <>
        <path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.6a9.2 9.2 0 0 1 12.4 0M9 16a4.5 4.5 0 0 1 6 0" />
        <circle cx="12" cy="19.3" r="0.7" fill="currentColor" />
      </>
    ),
    vcard: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <circle cx="9" cy="11" r="2" />
        <path d="M5.8 16c.6-1.5 1.8-2.2 3.2-2.2s2.6.700 3.2 2.2M15 10h3M15 13.5h3" />
      </>
    ),
    text: <path d="M5 6.5h14M5 11h14M5 15.5h9" />,
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type]}
    </svg>
  );
}
