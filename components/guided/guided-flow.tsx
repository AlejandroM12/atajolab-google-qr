"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { QrContentFields, type QrFieldError } from "@/components/guided/qr-content-fields";
import { trackEvent } from "@/lib/analytics";
import {
  buildQrContent,
  describeQrPayload,
  emptyQrContent,
  qrContentTypes,
  type QrContentInput,
  type QrContentType,
} from "@/lib/qr-content";
import { formatList, formatSpec, type FormatId, type FormatSpec } from "@/lib/studio/formats";
import {
  GUIDED_STEPS,
  GUIDED_STORAGE_KEY,
  handoffProposal,
  reachableStep,
  readGuidedState,
  selectedProposal,
  serializeGuidedState,
  type GuidedState,
  type GuidedStep,
} from "@/lib/studio/guided";
import {
  PROPOSAL_NAME_MAX,
  recommendedStyle,
  styleList,
  styleSpec,
  type StyleId,
  type StyleSpec,
  type StyleTone,
} from "@/lib/studio/proposal-options";

type ProposalCard = { id: string; name: string; preview: string; document: unknown };

/** The answer for one request key. Anything with another key is stale and counts as loading. */
type ProposalsState =
  | { status: "idle" }
  | { status: "ready"; key: string; proposals: ProposalCard[] }
  | { status: "error"; key: string; message: string };

type StylePreviews = { key: string; previews: Partial<Record<StyleId, string>> };

const primaryButton =
  "inline-flex h-14 items-center justify-center rounded-full bg-accent px-7 text-base font-semibold text-white shadow-[0_8px_20px_rgba(15,110,98,0.28)] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-accent/50 disabled:shadow-none";
const backButton =
  "inline-flex h-14 shrink-0 items-center justify-center rounded-full border border-line bg-card px-5 text-base font-semibold text-foreground transition-colors hover:border-accent";
const cardBase =
  "relative flex h-full w-full flex-col rounded-3xl border-2 bg-card text-left transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.98]";
const cardIdle = "border-line hover:border-accent/60";
const cardSelected = "border-accent shadow-[0_10px_24px_rgba(15,110,98,0.16)]";

const TYPE_EXAMPLES: Record<QrContentType, string> = {
  url: "tusitio.com",
  social: "@tunegocio",
  whatsapp: "Chat con mensaje listo",
  review: "Que opinen de vos",
  maps: "Cómo llegar",
  menu: "Tu carta, siempre al día",
  event: "Invitación o entradas",
  wifi: "Conectarse sin clave",
  vcard: "Guardar tu contacto",
  text: "Un mensaje corto",
};

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
  const [state, setState] = useState<GuidedState>(loadState);
  const [error, setError] = useState<QrFieldError>(null);
  const [proposals, setProposals] = useState<ProposalsState>({ status: "idle" });
  const [stylePreviews, setStylePreviews] = useState<StylePreviews>({ key: "", previews: {} });
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const request = useRef(0);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(GUIDED_STORAGE_KEY, serializeGuidedState(state));
    } catch {
      /* The flow still works without storage; it just does not survive a reload. */
    }
  }, [state]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [state.step]);

  const built = state.content ? buildQrContent(state.content) : null;
  const contentKey = state.content ? JSON.stringify([state.content, state.name]) : "";
  const proposalsKey = state.content ? JSON.stringify([contentKey, state.styleId, state.formatId, attempt]) : "";
  const answered = proposals.status !== "idle" && proposals.key === proposalsKey;

  // Samples of each style with the user's own content, for the style step.
  useEffect(() => {
    if (state.step !== 2 || !state.content || stylePreviews.key === contentKey) return;
    const controller = new AbortController();
    void postProposals(
      { content: state.content, name: state.name, styleId: state.styleId, formatId: state.formatId, preview: "styles" },
      controller.signal,
    ).then((result) => {
      if (!result.ok || !Array.isArray(result.payload.styles)) return;
      const previews: Partial<Record<StyleId, string>> = {};
      for (const item of result.payload.styles as { styleId?: StyleId; preview?: unknown }[]) {
        if (item.styleId && isPreview(item.preview)) previews[item.styleId] = item.preview;
      }
      setStylePreviews({ key: contentKey, previews });
    });
    return () => controller.abort();
    // contentKey covers the content and the name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, contentKey, stylePreviews.key]);

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
  const ready = !loading && proposals.status === "ready" ? proposals.proposals : [];
  const selected = selectedProposal(ready, state.proposalId);
  const type = state.content?.type ?? null;
  const reached = reachableStep(state);

  function go(step: GuidedStep) {
    setError(null);
    setState((value) => ({ ...value, step }));
  }

  function pickType(next: QrContentType) {
    setError(null);
    setState((value) => ({
      ...value,
      step: 1,
      content: value.content?.type === next ? value.content : emptyQrContent(next),
      styleId: value.stylePicked ? value.styleId : recommendedStyle(next),
    }));
  }

  function submitData() {
    if (!state.content) return;
    const result = buildQrContent(state.content);
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return;
    }
    go(2);
  }

  function openDesign() {
    if (!selected || opening) return;
    const saved = handoffProposal(window.sessionStorage, selected.document);
    if (!saved.ok) {
      setProposals({
        status: "error",
        key: proposalsKey,
        message:
          saved.reason === "storage"
            ? "Tu navegador no nos deja guardar el diseño. Salí del modo privado y probá de nuevo."
            : "No pudimos abrir ese diseño. Probá de nuevo.",
      });
      return;
    }
    setOpening(true);
    trackEvent("guided_proposal_picked", {
      content: type ?? "",
      format: state.formatId,
      style: state.styleId,
      design: selected.id.split("-").pop() ?? "",
    });
    router.push("/crear?origen=guiado");
  }

  let primary: { label: string; onClick?: () => void; submit?: boolean; disabled?: boolean } | null = null;
  if (state.step === 0) primary = state.content ? { label: "Continuar", onClick: () => go(1) } : null;
  else if (state.step === 1) primary = { label: "Continuar", submit: true };
  else if (state.step === 2) primary = { label: "Continuar", onClick: () => go(3) };
  else if (state.step === 3) primary = { label: "Ver mis diseños", onClick: () => go(4) };
  else {
    primary = {
      label: opening ? "Abriendo el editor…" : "Usar este diseño",
      onClick: openDesign,
      disabled: !selected || opening,
    };
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-36 pt-6 sm:pt-10 lg:pb-16">
      <nav aria-label="Pasos" className="mb-7 sm:mb-10">
        <ol className="flex items-center gap-1.5">
          {GUIDED_STEPS.map((label, index) => {
            const available = index <= reached && index !== state.step;
            return (
              <li key={label} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={!available}
                  aria-current={index === state.step ? "step" : undefined}
                  aria-label={`Paso ${index + 1}: ${label}`}
                  onClick={() => go(index as GuidedStep)}
                  className="group block w-full py-2 disabled:cursor-default"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-colors duration-300 ${
                      index <= state.step ? "bg-accent" : "bg-line"
                    } ${available ? "group-hover:bg-accent-strong" : ""}`}
                  />
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-1 text-xs font-semibold text-muted" aria-hidden="true">
          Paso {state.step + 1} de {GUIDED_STEPS.length} · <span className="text-foreground">{GUIDED_STEPS[state.step]}</span>
        </p>
      </nav>

      <div key={state.step} className="guided-step">
        {state.step === 0 ? (
          <section aria-labelledby="paso-titulo">
            <StepHeading ref={headingRef} title="¿Qué querés compartir?">
              {priceNote ?? "Elegí una opción."}
            </StepHeading>
            <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {qrContentTypes.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={type === item.id}
                    className={`${cardBase} min-h-36 items-start p-4 ${type === item.id ? cardSelected : cardIdle}`}
                    onClick={() => pickType(item.id)}
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-ok-bg text-accent-strong">
                      <TypeIcon type={item.id} />
                    </span>
                    <span className="mt-3 text-base font-semibold leading-snug">{item.name}</span>
                    <span className="mt-1 text-sm leading-5 text-muted">{TYPE_EXAMPLES[item.id]}</span>
                    {type === item.id ? <SelectedMark /> : null}
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
          <section aria-labelledby="paso-titulo">
            <StepHeading ref={headingRef} title={DATA_TITLES[state.content.type]} />
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
              <form
                id="guiado-datos"
                className="flex flex-col gap-5 rounded-3xl border border-line bg-card p-5 sm:p-6"
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
                      {state.content.type === "event" ? "Nombre del evento" : "Nombre de tu negocio o marca"}{" "}
                      <span className="font-normal text-muted">(opcional)</span>
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
                  </div>
                ) : null}
              </form>
              <CodePreview value={built?.ok ? built.value : null} />
            </div>
          </section>
        ) : null}

        {state.step === 2 ? (
          <section aria-labelledby="paso-titulo">
            <StepHeading ref={headingRef} title="Elegí un estilo">
              Después podés cambiar cada color.
            </StepHeading>
            <ul className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {styleList.map((style) => {
                const active = state.styleId === style.id;
                const preview = stylePreviews.key === contentKey ? stylePreviews.previews[style.id] : undefined;
                return (
                  <li key={style.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      className={`${cardBase} p-3 ${active ? cardSelected : cardIdle}`}
                      onClick={() => setState((value) => ({ ...value, styleId: style.id, stylePicked: true, step: 3 }))}
                    >
                      <span
                        className="flex w-full items-center justify-center overflow-hidden rounded-2xl bg-background"
                        style={{ aspectRatio: "105 / 148" }}
                      >
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data: URL drawn by the export engine
                          <img src={preview} alt="" className="block h-full w-full object-cover" />
                        ) : (
                          <StyleSwatch style={style} />
                        )}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center gap-2 px-1 text-base font-semibold">
                        {style.name}
                        {type && recommendedStyle(type) === style.id ? (
                          <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-accent-strong">
                            Sugerido
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 px-1 pb-1 text-sm leading-5 text-muted max-sm:hidden">{style.description}</span>
                      {active ? <SelectedMark /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {state.step === 3 ? (
          <section aria-labelledby="paso-titulo">
            <StepHeading ref={headingRef} title="¿Dónde lo vas a usar?" />
            {(["print", "screen"] as const).map((medium) => (
              <div key={medium} className="mt-7">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
                  {medium === "print" ? "Para imprimir" : "Para redes"}
                </h2>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {formatList
                    .filter((format) => format.medium === medium)
                    .map((format) => {
                      const active = state.formatId === format.id;
                      return (
                        <li key={format.id}>
                          <button
                            type="button"
                            aria-pressed={active}
                            className={`${cardBase} p-3 ${active ? cardSelected : cardIdle}`}
                            onClick={() => setState((value) => ({ ...value, formatId: format.id, step: 4 }))}
                          >
                            <span className="flex h-28 w-full items-center justify-center rounded-2xl bg-background">
                              <FormatShape format={format} tone={styleSpec(state.styleId).tones[0]} />
                            </span>
                            <span className="mt-3 px-1 text-base font-semibold leading-snug">{format.use}</span>
                            <span className="mt-0.5 px-1 pb-1 text-sm leading-5 text-muted">
                              {format.name} · {format.size}
                            </span>
                            {active ? <SelectedMark /> : null}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        {state.step === 4 ? (
          <section aria-labelledby="paso-titulo" aria-busy={loading}>
            <StepHeading ref={headingRef} title="Elegí tu diseño">
              Tocá uno para verlo en grande. Después podés cambiar todo.
            </StepHeading>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm [-webkit-overflow-scrolling:touch]">
              <SummaryChip label="Estilo" value={styleSpec(state.styleId).name} onClick={() => go(2)} />
              <SummaryChip label="Formato" value={formatSpec(state.formatId).name} onClick={() => go(3)} />
            </div>

            {!loading && proposals.status === "error" ? (
              <div className="mt-6 rounded-3xl border border-danger/30 bg-danger-bg p-5 text-danger" role="alert">
                <p className="text-base font-semibold">{proposals.message}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className={primaryButton} onClick={() => setAttempt((value) => value + 1)}>
                    Reintentar
                  </button>
                  <button type="button" className={backButton} onClick={() => go(3)}>
                    Cambiar formato
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
                <div className="max-lg:order-2 lg:sticky lg:top-24">
                  <div
                    className="flex items-center justify-center rounded-3xl border border-line bg-card p-4 sm:p-6"
                    style={{ minHeight: "min(40vh, 24rem)" }}
                  >
                    {selected ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data: URL drawn by the export engine
                      <img
                        key={selected.id}
                        src={selected.preview}
                        alt={`Diseño ${selected.name} con tu código`}
                        data-testid="diseno-elegido"
                        className="guided-step block h-auto max-h-[38vh] w-auto max-w-full rounded-lg shadow-[0_16px_36px_rgba(20,34,31,0.2)] lg:max-h-[52vh]"
                        style={{ aspectRatio: aspect(state.formatId) }}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-muted" role="status">
                        <span className="size-9 animate-spin rounded-full border-4 border-line border-t-accent motion-reduce:animate-none" />
                        <span className="text-sm font-semibold">Armando tus diseños…</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 max-lg:order-1">
                  {/* On large screens the main action sits beside the preview, above the fold. */}
                  <div className="mb-5 hidden items-center justify-between gap-5 rounded-3xl border border-accent/30 bg-ok-bg p-4 lg:flex">
                    <p className="min-w-0 text-base">
                      <span className="block text-sm text-muted">Diseño elegido</span>
                      <span className="block truncate font-semibold">{selected ? selected.name : "Armando…"}</span>
                    </p>
                    <button
                      type="button"
                      data-testid="usar-diseno-escritorio"
                      className={`${primaryButton} min-w-72 shrink-0`}
                      disabled={!selected || opening}
                      onClick={openDesign}
                    >
                      {opening ? "Abriendo el editor…" : "Usar este diseño"}
                    </button>
                  </div>
                  <ul
                    role="radiogroup"
                    aria-label="Diseños"
                    className="flex gap-2.5 overflow-x-auto px-0.5 pb-2 pt-0.5 [-webkit-overflow-scrolling:touch] sm:gap-3 lg:grid lg:grid-cols-3 lg:overflow-visible lg:p-0"
                  >
                    {loading
                      ? [0, 1, 2, 3, 4, 5].map((index) => (
                          <li key={index} aria-hidden="true" className="w-[27%] shrink-0 lg:w-auto">
                            <div
                              className="w-full animate-pulse rounded-2xl bg-line/60 motion-reduce:animate-none"
                              style={{ aspectRatio: aspect(state.formatId) }}
                            />
                          </li>
                        ))
                      : ready.map((card) => {
                          const active = selected?.id === card.id;
                          return (
                            <li key={card.id} className="w-[27%] shrink-0 lg:w-auto">
                              <button
                                type="button"
                                role="radio"
                                aria-checked={active}
                                aria-label={`Diseño ${card.name}`}
                                className={`${cardBase} rounded-2xl p-1.5 sm:p-2 ${active ? cardSelected : cardIdle}`}
                                onClick={() => setState((value) => ({ ...value, proposalId: card.id }))}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL drawn by the export engine */}
                                <img
                                  src={card.preview}
                                  alt=""
                                  className="block h-auto w-full rounded-lg"
                                  style={{ aspectRatio: aspect(state.formatId) }}
                                />
                                <span className="mt-1.5 block truncate px-1 pb-0.5 text-center text-xs font-semibold sm:text-sm">
                                  {card.name}
                                </span>
                                {active ? <SelectedMark /> : null}
                              </button>
                            </li>
                          );
                        })}
                  </ul>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>

      {primary || state.step > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
            {state.step > 0 ? (
              <button type="button" className={backButton} onClick={() => go((state.step - 1) as GuidedStep)}>
                <span aria-hidden="true">←</span>
                <span className="ml-2 max-sm:sr-only">Atrás</span>
              </button>
            ) : null}
            {primary ? (
              <button
                type={primary.submit ? "submit" : "button"}
                form={primary.submit ? "guiado-datos" : undefined}
                data-testid="accion-principal"
                className={`${primaryButton} min-w-0 flex-1 lg:min-w-64 lg:flex-none ${state.step === 4 ? "lg:hidden" : ""}`}
                disabled={primary.disabled}
                onClick={primary.onClick}
              >
                {primary.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function loadState(): GuidedState {
  if (typeof window === "undefined") return readGuidedState(null);
  try {
    return readGuidedState(window.sessionStorage.getItem(GUIDED_STORAGE_KEY));
  } catch {
    return readGuidedState(null);
  }
}

type ProposalBody = {
  content: QrContentInput;
  name: string;
  styleId: StyleId;
  formatId: FormatId;
  preview?: "styles";
};

async function postProposals(
  body: ProposalBody,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  try {
    const response = await fetch("/api/studio/proposals", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const payload = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: {} };
  }
}

type LoadResult =
  | { ok: true; proposals: ProposalCard[] }
  | { ok: false; field: string | null; message: string };

async function loadProposals(body: ProposalBody, signal: AbortSignal): Promise<LoadResult> {
  const failure = "No pudimos armar tus diseños. Revisá tu conexión y probá de nuevo.";
  const { ok, status, payload } = await postProposals(body, signal);
  if (status === 429) {
    return { ok: false, field: null, message: "Pediste muchos diseños seguidos. Esperá unos minutos y probá de nuevo." };
  }
  if (status === 422 && typeof payload.message === "string") {
    return { ok: false, field: typeof payload.field === "string" ? payload.field : null, message: payload.message };
  }
  if (!ok || !Array.isArray(payload.proposals)) return { ok: false, field: null, message: failure };
  const proposals: ProposalCard[] = [];
  for (const item of payload.proposals as Record<string, unknown>[]) {
    if (typeof item?.id !== "string" || typeof item.name !== "string" || !isPreview(item.preview)) continue;
    if (typeof item.document !== "object" || item.document === null) continue;
    proposals.push({ id: item.id, name: item.name, preview: item.preview, document: item.document });
  }
  return proposals.length > 0 ? { ok: true, proposals } : { ok: false, field: null, message: failure };
}

function isPreview(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/png;base64,");
}

function aspect(formatId: FormatId): string {
  const format = formatSpec(formatId);
  return `${format.widthMm} / ${format.heightMm}`;
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
      <h1
        id="paso-titulo"
        ref={ref}
        tabIndex={-1}
        className="text-3xl font-semibold leading-tight text-foreground outline-none sm:text-4xl"
      >
        {title}
      </h1>
      {children ? <p className="mt-2 text-base leading-relaxed text-muted">{children}</p> : null}
    </header>
  );
}

function SelectedMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-accent text-white shadow"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function SummaryChip({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-card px-4 hover:border-accent"
      onClick={onClick}
    >
      <span className="text-muted">{label}:</span>
      <span className="font-semibold">{value}</span>
      <span className="font-semibold text-accent">Cambiar</span>
    </button>
  );
}

/** The code being built, big enough to try with a phone camera before going on. */
function CodePreview({ value }: { value: string | null }) {
  const [picture, setPicture] = useState<{ value: string; url: string } | null>(null);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 2, width: 360, errorCorrectionLevel: "M", color: { dark: "#14221f", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setPicture({ value, url });
      })
      .catch(() => {
        if (!cancelled) setPicture(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const shown = value && picture?.value === value ? picture.url : null;
  return (
    <aside className="rounded-3xl border border-line bg-card p-5 max-lg:flex max-lg:items-center max-lg:gap-4" aria-live="polite">
      <div className="flex aspect-square w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-background lg:w-full">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL generated in the browser
          <img src={shown} alt="Tu código QR" className="block h-full w-full" />
        ) : (
          <span className="px-3 text-center text-xs leading-5 text-muted">Tu código aparece acá</span>
        )}
      </div>
      <div className="min-w-0 lg:mt-4">
        <p className="text-sm font-semibold">{shown ? "Tu código ya funciona" : "Tu código"}</p>
        <p className="mt-1 break-words text-sm leading-5 text-muted">
          {shown && value ? `${describeQrPayload(value)}. Probalo con la cámara del celular.` : "Completá los datos para verlo."}
        </p>
      </div>
    </aside>
  );
}

/** Fallback for the style cards while the real samples load: the style's colors on a tiny poster. */
function StyleSwatch({ style }: { style: StyleSpec }) {
  const tone = style.tones[0];
  return (
    <span aria-hidden="true" className="relative block h-full w-full" style={{ background: tone.paper }}>
      <span className="absolute inset-x-0 top-0 block h-[28%]" style={{ background: tone.primary }} />
      <span className="absolute left-[12%] top-[36%] block h-[4%] w-1/2 rounded-full" style={{ background: tone.ink }} />
      <span className="absolute left-[12%] top-[44%] block h-[3%] w-1/4 rounded-full" style={{ background: tone.accent }} />
      <span className="absolute bottom-[10%] left-1/2 block aspect-square w-[38%] -translate-x-1/2 rounded-md bg-white p-[5%]">
        <span className="block size-full rounded-sm" style={{ background: "#14221f" }} />
      </span>
    </span>
  );
}

/** The sheet's proportions with the chosen style's colors, at most 84 px on its long side. */
function FormatShape({ format, tone }: { format: FormatSpec; tone: StyleTone }) {
  const scale = 84 / Math.max(format.widthMm, format.heightMm);
  const width = Math.round(format.widthMm * scale);
  const height = Math.round(format.heightMm * scale);
  const landscape = width > height * 1.15;
  return (
    <span
      aria-hidden="true"
      className="relative block overflow-hidden rounded-[4px] shadow-[0_4px_10px_rgba(20,34,31,0.18)]"
      style={{ width, height, background: tone.paper }}
    >
      <span
        className="absolute block"
        style={landscape ? { inset: "0 55% 0 0", background: tone.primary } : { inset: "0 0 68% 0", background: tone.primary }}
      />
      <span
        className="absolute block rounded-[2px] bg-white p-[3px]"
        style={
          landscape
            ? { right: "10%", top: "50%", height: "56%", aspectRatio: "1", transform: "translateY(-50%)" }
            : { left: "50%", bottom: "12%", width: "44%", aspectRatio: "1", transform: "translateX(-50%)" }
        }
      >
        <span className="block size-full rounded-[1px]" style={{ background: "#14221f" }} />
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
    review: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5z" />,
    menu: <path d="M7 3.5v7a2.5 2.5 0 0 0 5 0v-7M9.5 3.5v17M17 20.5v-17c-2 1.5-3 4-3 7.5h3" />,
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
        <path d="M5.8 16c.6-1.5 1.8-2.2 3.2-2.2s2.6.7 3.2 2.2M15 10h3M15 13.5h3" />
      </>
    ),
    text: <path d="M5 6.5h14M5 11h14M5 15.5h9" />,
  };
  return (
    <svg
      width="26"
      height="26"
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
