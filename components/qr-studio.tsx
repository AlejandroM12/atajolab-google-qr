"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScenePreview } from "@/components/scene-preview";
import { type QrPayload } from "@/components/qr-slot";
import {
  BUSINESS_NAME_MAX,
  PREMIUM_ARTWORK_VERSION,
  PREMIUM_MESSAGE_MAX,
  premiumDefaultMessage,
  premiumMessagePresets,
  premiumPhrases,
  premiumTemplates,
  signageFormats,
  signageGoal,
  type ArtworkLogo,
  type PremiumTemplateId,
  type SignageFormat,
  type SignageObjective,
} from "@/lib/artwork";
import { assessContrast, formatContrastRatio, isHexColor, shopStripeReadable } from "@/lib/color";
import {
  isIncompleteHttpsPrefix,
  linkIssueMessage,
  validateGoogleLink,
  type LinkIssue,
} from "@/lib/google-link";
import { parseBuyerEmail } from "@/lib/buyer-email";
import { prepareLogoFile } from "@/lib/logo-prepare";
import { commercialIssueMessage, isCommercialIssue } from "@/lib/print/commercial-issues";
import { formatArs, PIECE_PRICE_ARS } from "@/lib/pricing";
import { guides, objectives } from "@/lib/product";

const SHOP_STRIPE = "#1c1915";
const SHOP_PAPER = "#f7f1e8";

export function QrStudio() {
  const [objective, setObjective] = useState<SignageObjective>("review");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [formatId, setFormatId] = useState<SignageFormat>("poster");
  const [templateId, setTemplateId] = useState<PremiumTemplateId>("stand-classic");
  const [businessName, setBusinessName] = useState("");
  const [messageChoice, setMessageChoice] = useState(premiumDefaultMessage("stand-classic"));
  const [customMessage, setCustomMessage] = useState("");
  const [messageCustom, setMessageCustom] = useState(false);
  const [messageTouched, setMessageTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [reviewChecked, setReviewChecked] = useState(false);
  const [accent, setAccent] = useState(SHOP_STRIPE);
  const [logo, setLogo] = useState<ArtworkLogo | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [thumbs, setThumbs] = useState<{ key: string; images: Partial<Record<PremiumTemplateId, string>> }>({
    key: "",
    images: {},
  });
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewKeyReady, setPreviewKeyReady] = useState<string | null>(null);
  const [compositionIssue, setCompositionIssue] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const goal = signageGoal(objective);
  const result = useMemo(() => validateGoogleLink(url, goal), [url, goal]);
  const stripeOnWhite = assessContrast("#ffffff", accent);
  const stripeOnPaper = assessContrast(accent, SHOP_PAPER);
  const shopReady = templateId !== "stand-shop" || shopStripeReadable(accent, SHOP_PAPER);
  const visibleIssue = revealIssue(url, touched, result.ok ? null : result.issue);
  const draftMessage = (messageCustom ? customMessage.trim() : messageChoice) || premiumDefaultMessage(templateId);
  const messageReady = objective !== "review" || (messageCustom ? customMessage.trim().length > 0 : messageChoice.length > 0);
  const phrases = premiumPhrases(templateId, objective, draftMessage);

  const payload = useMemo<QrPayload | null>(() => {
    if (!result.ok) return null;
    return {
      key: result.href,
      href: result.href,
      foreground: "#1c1915",
      background: "#ffffff",
      size: 256,
    };
  }, [result]);

  const emailReady = parseBuyerEmail(email) !== null;
  const reviewReady = objective !== "review" || reviewChecked;
  const previewKey =
    payload && shopReady && messageReady
      ? JSON.stringify({
          version: PREMIUM_ARTWORK_VERSION,
          objective,
          url,
          businessName,
          message: draftMessage,
          logo: logo ? { data: logo.data } : null,
          format: formatId,
          templateId,
          accent,
        })
      : "";
  const previewCurrent = previewKey.length > 0 && previewKey === previewKeyReady;
  const shownSvg = previewCurrent ? previewSvg : null;
  const shownIssue = previewCurrent ? compositionIssue : null;
  const compositionReady = shownSvg !== null && shownIssue === null;
  const canOrder =
    Boolean(payload) &&
    emailReady &&
    reviewReady &&
    shopReady &&
    compositionReady &&
    !submitting &&
    !logoBusy;
  const checkoutHint = shownIssue
    ? shownIssue
    : !reviewReady
      ? "Abrí el enlace y confirmá que muestra el formulario de reseña."
      : !emailReady
        ? email.trim().length === 0
          ? "Dejá un correo para recuperar las descargas en otro dispositivo."
          : "Revisá el correo. Tiene que ser una dirección válida."
        : !shopReady
          ? "La franja de Mi negocio necesita contrastar con el texto blanco y con el papel."
          : !messageReady
          ? "Elegí un mensaje o escribí uno propio."
          : !payload
            ? "El pedido se habilita cuando el enlace es válido."
            : !previewCurrent
              ? "Estamos comprobando que el texto entre en la plantilla."
              : "El pedido queda pendiente hasta que Mercado Pago confirme el pago.";

  useEffect(() => {
    if (!previewKey) return;
    const key = previewKey;
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch("/api/artwork/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: key,
      })
        .then(async (response) => {
          if (cancelled) return;
          const body = (await response.json()) as { svg?: unknown; error?: unknown };
          if (!response.ok || typeof body.svg !== "string") {
            const code = typeof body.error === "string" ? body.error : "composition";
            setPreviewSvg(null);
            setCompositionIssue(
              isCommercialIssue(code) ? commercialIssueMessage(code) : "No pudimos armar la vista previa de la pieza.",
            );
            setPreviewKeyReady(key);
            return;
          }
          setPreviewSvg(body.svg);
          setCompositionIssue(null);
          setPreviewKeyReady(key);
        })
        .catch((error: unknown) => {
          if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
          setPreviewSvg(null);
          setCompositionIssue("No pudimos armar la vista previa de la pieza.");
          setPreviewKeyReady(key);
        });
    }, 220);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [previewKey]);

  const thumbKey = result.ok
    ? JSON.stringify({
        version: PREMIUM_ARTWORK_VERSION,
        objective,
        url,
        businessName,
        message: draftMessage,
        logo: logo ? { data: logo.data } : null,
        format: formatId,
        accent,
      })
    : "";

  const shownThumbs = thumbs.key === thumbKey ? thumbs.images : {};

  useEffect(() => {
    if (!thumbKey) return;
    const controller = new AbortController();
    let cancelled = false;
    const base = JSON.parse(thumbKey) as Record<string, unknown>;
    for (const template of premiumTemplates) {
      void fetch("/api/artwork/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ ...base, templateId: template.id }),
      })
        .then(async (response) => {
          if (cancelled) return;
          const body = (await response.json()) as { svg?: unknown };
          if (!response.ok || typeof body.svg !== "string") {
            setThumbs((current) => {
              const images = current.key === thumbKey ? { ...current.images } : {};
              delete images[template.id];
              return { key: thumbKey, images };
            });
            return;
          }
          setThumbs((current) => ({
            key: thumbKey,
            images: {
              ...(current.key === thumbKey ? current.images : {}),
              [template.id]: body.svg as string,
            },
          }));
        })
        .catch((error: unknown) => {
          if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        });
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [thumbKey]);

  function chooseTemplate(next: PremiumTemplateId) {
    setTemplateId(next);
    setAccent(SHOP_STRIPE);
    setResetToken((token) => token + 1);
    if (!messageTouched) setMessageChoice(premiumDefaultMessage(next));
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    setLogoBusy(true);
    const prepared = await prepareLogoFile(file, "contain");
    setLogoBusy(false);
    if (!prepared.ok) {
      setLogoError(logoErrorMessage(prepared.error));
      return;
    }
    setLogo(prepared.logo);
  }

  async function continueToPayment() {
    if (!canOrder) return;
    setOrderError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: PREMIUM_ARTWORK_VERSION,
          objective,
          url,
          businessName,
          message: draftMessage,
          logo: logo ? { data: logo.data } : null,
          format: formatId,
          templateId,
          accent,
          email,
          reviewChecked,
        }),
      });
      const body = (await response.json()) as { publicId?: unknown; error?: unknown };
      const publicId = typeof body.publicId === "string" ? body.publicId : "";
      if (!response.ok || !/^[A-Za-z0-9_-]{24}$/.test(publicId)) {
        setOrderError(orderErrorMessage(typeof body.error === "string" ? body.error : ""));
        setSubmitting(false);
        return;
      }
      router.push(`/pedido/${publicId}`);
    } catch {
      setOrderError("No pudimos guardar el pedido. Intentá de nuevo en un momento.");
      setSubmitting(false);
    }
  }

  const guide = guides[goal];
  const previewMessage = shownIssue
    ? shownIssue
    : !shopReady
      ? "La franja de Mi negocio necesita contrastar con el texto blanco y con el papel."
      : shownSvg
        ? "Esta vista es la misma pieza que se exporta en PNG, SVG y PDF."
        : previewKey
          ? "Estamos armando la pieza con la tipografía de impresión."
          : "La pieza muestra el QR cuando el enlace es válido.";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div className="order-2 lg:sticky lg:top-24">
        <section aria-labelledby="vista-previa-title" className="rounded-[2rem] border border-line bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="vista-previa-title" className="text-base font-semibold">
              Pieza completa
            </h2>
            <p className="text-xs text-muted">
              {premiumTemplates.find((item) => item.id === templateId)?.name} · {signageFormats.find((item) => item.id === formatId)?.widthMm} × {signageFormats.find((item) => item.id === formatId)?.heightMm} mm
            </p>
          </div>
          <p aria-live="polite" className="mt-2 min-h-10 text-sm leading-relaxed text-muted">
            {previewMessage}
          </p>
          <div className="mt-4 rounded-[1.6rem] bg-[radial-gradient(circle_at_center,#efe7d8,transparent_70%)] px-3 py-8">
            {shownSvg ? (
              <ScenePreview svg={shownSvg} />
            ) : (
              <p className="mx-auto max-w-xs py-16 text-center text-sm leading-relaxed text-muted">
                La vista previa aparece cuando el enlace es válido y el texto entra en la plantilla.
              </p>
            )}
          </div>
        </section>
        {result.ok ? (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            El QR abre este enlace:{" "}
            <code className="mt-1 block break-all rounded-xl bg-card px-3 py-2 text-xs text-foreground">{result.href}</code>
          </p>
        ) : null}
      </div>

      <div className="order-1 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Editor</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">Diseñá el cartel o el sticker</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
            El objetivo define el enlace. La plantilla solo cambia el dibujo.
          </p>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Qué abre el QR</legend>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {objective === "review"
              ? "Para reseñas, el QR lleva a Google para dejar una opinión. No pide una valoración ni solo comentarios positivos."
              : "Para ubicación, el QR abre el mapa. No abre el formulario de reseña."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {objectives.map((item) => {
              const selected = objective === item.id;
              return (
                <label
                  key={item.id}
                  className={`cursor-pointer rounded-2xl border p-4 ${
                    selected ? "border-accent bg-ok-bg" : "border-line bg-card"
                  }`}
                >
                  <span className="flex gap-3">
                    <input
                      type="radio"
                      name="objetivo"
                      value={item.id}
                      checked={selected}
                      onChange={() => {
                        setObjective(item.id);
                        setReviewChecked(false);
                        setTouched(false);
                      }}
                      className="mt-1 size-4 accent-[#0f6e62]"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{item.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-muted">{item.description}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="guia-enlace">
          <h2 id="guia-enlace" className="text-base font-semibold">
            {guide.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">{guide.note}</p>
          {guide.profileUrl ? (
            <p className="mt-3 text-sm leading-relaxed">
              <a
                href={guide.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent-strong underline decoration-accent/40 underline-offset-2"
              >
                Abrir el Perfil de Empresa
              </a>
            </p>
          ) : null}
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-semibold">Formatos de referencia</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Sirven para reconocer el enlace. No son direcciones reales para copiar.
            </p>
            <ul className="mt-3 space-y-2">
              {guide.examples.map((example) => (
                <li
                  key={example}
                  className="break-all rounded-xl bg-background px-3 py-2 font-mono text-sm leading-relaxed"
                >
                  {example}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div>
          <label htmlFor="enlace-google" className="text-sm font-semibold">
            Enlace de Google
          </label>
          <textarea
            id="enlace-google"
            name="enlace"
            value={url}
            onChange={(event) => setUrl(event.target.value.slice(0, 4000))}
            onBlur={() => setTouched(true)}
            onPaste={() => setTouched(true)}
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder={goal === "ubicacion" ? "https://maps.app.goo.gl/…" : "https://g.page/r/…/review"}
            aria-invalid={visibleIssue ? true : undefined}
            aria-describedby="enlace-ayuda enlace-estado"
            className="mt-2 w-full resize-y rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-relaxed outline-none"
          />
          <p id="enlace-ayuda" className="mt-2 text-sm leading-relaxed text-muted">
            Pegá un enlace HTTPS. La pieza se arma con la misma escena que se descarga.
          </p>
          <p
            id="enlace-estado"
            role={visibleIssue ? "alert" : "status"}
            className={`mt-2 text-sm leading-relaxed ${
              visibleIssue ? "text-danger" : result.ok ? "text-accent-strong" : "text-muted"
            }`}
          >
            {visibleIssue
              ? linkIssueMessage[visibleIssue]
              : result.ok
                ? goal === "ubicacion"
                  ? "Enlace admitido para compartir la ubicación."
                  : "El enlace tiene la forma de un formulario de reseña. Abrilo para comprobar el destino."
                : "La vista previa aparece cuando el enlace es válido."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="nombre-negocio" className="text-sm font-semibold">
              Nombre del negocio
            </label>
            <input
              id="nombre-negocio"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value.slice(0, BUSINESS_NAME_MAX))}
              maxLength={BUSINESS_NAME_MAX}
              autoComplete="organization"
              placeholder="Nombre del negocio"
              className="mt-2 h-11 w-full rounded-2xl border border-line bg-card px-4 text-sm"
            />
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Opcional. Si lo dejás vacío, la pieza no reserva un hueco. Debajo del código se lee «{phrases.instruction}».
            </p>
          </div>
        </div>

        {objective === "review" ? (
          <fieldset>
            <legend className="text-sm font-semibold">Mensaje</legend>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Invita a dejar una reseña, sin pedir que sea positiva. En el sticker tiene que entrar sin achicar el QR.
            </p>
            <div className="mt-3 grid gap-2">
              {premiumMessagePresets.map((preset) => {
                const selected = !messageCustom && messageChoice === preset;
                return (
                  <label
                    key={preset}
                    className={`cursor-pointer rounded-2xl border px-4 py-3 text-sm ${
                      selected ? "border-accent bg-ok-bg" : "border-line bg-card"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mensaje"
                      value={preset}
                      checked={selected}
                      onChange={() => {
                        setMessageCustom(false);
                        setMessageChoice(preset);
                        setMessageTouched(true);
                      }}
                      className="sr-only"
                    />
                    {preset}
                  </label>
                );
              })}
              <label
                className={`cursor-pointer rounded-2xl border px-4 py-3 text-sm ${
                  messageCustom ? "border-accent bg-ok-bg" : "border-line bg-card"
                }`}
              >
                <input
                  type="radio"
                  name="mensaje"
                  value="propio"
                  checked={messageCustom}
                  onChange={() => {
                    setMessageCustom(true);
                    setMessageTouched(true);
                  }}
                  className="sr-only"
                />
                Escribir otro
              </label>
            </div>
            {messageCustom ? (
              <input
                id="mensaje-propio"
                value={customMessage}
                onChange={(event) => setCustomMessage(event.target.value.slice(0, PREMIUM_MESSAGE_MAX))}
                maxLength={PREMIUM_MESSAGE_MAX}
                placeholder="Una frase breve"
                aria-label="Mensaje propio"
                className="mt-3 h-11 w-full rounded-2xl border border-line bg-card px-4 text-sm"
              />
            ) : null}
          </fieldset>
        ) : null}

        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-sm font-semibold">Logo del negocio</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Opcional. Si no hay logo, la pieza no inventa uno. PNG, JPG o WebP de hasta 2 MB.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {logo ? (
              <span
                role="img"
                aria-label="Logo cargado"
                className="size-14 rounded-2xl bg-cover bg-center"
                style={{ backgroundImage: `url("data:image/png;base64,${logo.data}")` }}
              />
            ) : (
              <span className="grid size-14 place-items-center rounded-2xl border border-dashed border-line text-xs text-muted">
                Logo
              </span>
            )}
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onLogo(file);
              }}
            />
            <button
              type="button"
              onClick={() => logoInput.current?.click()}
              disabled={logoBusy}
              className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold enabled:hover:border-accent disabled:opacity-50"
            >
              {logoBusy ? "Procesando…" : logo ? "Cambiar logo" : "Subir logo"}
            </button>
            {logo ? (
              <button
                type="button"
                onClick={() => {
                  setLogo(null);
                  setLogoError(null);
                }}
                className="inline-flex h-10 items-center rounded-full px-3 text-sm text-muted hover:text-foreground"
              >
                Quitar
              </button>
            ) : null}
          </div>
          {logoError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {logoError}
            </p>
          ) : null}
        </section>

        <fieldset>
          <legend className="text-sm font-semibold">Formato de impresión</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {signageFormats.map((format) => {
              const selected = formatId === format.id;
              return (
                <label
                  key={format.id}
                  className={`cursor-pointer rounded-2xl border p-4 ${
                    selected ? "border-accent bg-ok-bg" : "border-line bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="formato"
                    value={format.id}
                    checked={selected}
                    onChange={() => setFormatId(format.id)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold">{format.name}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{format.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">Plantilla</legend>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Cambia el dibujo. El enlace, el nombre, el logo y el mensaje se mantienen.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {premiumTemplates.map((template) => {
              const selected = templateId === template.id;
              return (
                <label
                  key={template.id}
                  className={`cursor-pointer rounded-2xl border p-3 ${
                    selected ? "border-accent bg-ok-bg" : "border-line bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="plantilla"
                    value={template.id}
                    checked={selected}
                    onChange={() => chooseTemplate(template.id)}
                    className="sr-only"
                  />
                  <TemplateThumb svg={shownThumbs[template.id]} />
                  <span className="mt-3 block text-sm font-semibold">{template.name}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{template.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {templateId === "stand-shop" ? (
          <fieldset className="rounded-2xl border border-line bg-card p-5">
            <legend className="px-1 text-sm font-semibold">Franja</legend>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              El texto de la franja es blanco. El color tiene que leerse sobre el papel crema.
            </p>
            <div className="mt-4">
              <ColorField key={`franja-${resetToken}`} label="Color de la franja" value={accent} onChange={setAccent} />
            </div>
            {!shopReady ? (
              <p role="status" className="mt-4 rounded-xl bg-warning-bg px-3 py-2 text-sm leading-relaxed text-warning">
                Blanco sobre la franja contrasta {formatContrastRatio(stripeOnWhite.ratio)} y la franja sobre el papel{" "}
                {formatContrastRatio(stripeOnPaper.ratio)}. Hacen falta 4,5:1 y 3:1.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => chooseTemplate(templateId)}
              className="mt-5 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-accent"
            >
              Restaurar el negro de la franja
            </button>
          </fieldset>
        ) : null}

        <section className="rounded-2xl border border-line bg-[#f7f3ea] p-5">
          <h2 className="text-sm font-semibold">Sobre Google</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            No usa el logo de Google. La palabra queda en el color de la pieza y lleva un subrayado azul, amarillo y verde. En las piezas de reseña, las estrellas invitan a escribir; no son una calificación y no van junto a la palabra Google. AtajoLab no es un producto oficial de Google.
          </p>
          {objective === "review" && result.ok ? (
            <label className="mt-4 flex gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={reviewChecked}
                onChange={(event) => setReviewChecked(event.target.checked)}
                className="mt-1 size-4 accent-[#0f6e62]"
              />
              <span>
                Abrí el enlace y comprobé que muestra el formulario para escribir una reseña. No podemos verificar el
                destino sin abrirlo.
              </span>
            </label>
          ) : null}
        </section>

        <section aria-labelledby="entrega-title" className="rounded-2xl border border-dashed border-line p-5">
          <h2 id="entrega-title" className="text-base font-semibold">
            Pedido
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pieza digital · {formatArs(PIECE_PRICE_ARS)} ARS. El precio lo define el servidor.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            El pedido guarda esta composición. La descarga es un archivo para imprimir, de {signageFormats.find((item) => item.id === formatId)?.widthMm} × {signageFormats.find((item) => item.id === formatId)?.heightMm} mm. No incluye un chip NFC. Cuando el pago queda confirmado, vas a poder descargar PNG, SVG y PDF.
          </p>
          <div className="mt-4">
            <label htmlFor="correo-pedido" className="text-sm font-semibold">
              Correo electrónico
            </label>
            <input
              id="correo-pedido"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 h-11 w-full rounded-xl border border-line bg-background px-3 text-sm"
            />
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Lo guardamos con el pedido para recuperar las descargas en otro dispositivo. No crea una cuenta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void continueToPayment()}
            disabled={!canOrder}
            className="mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white enabled:hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creando el pedido…" : "Continuar al pago"}
          </button>
          <p className="mt-3 text-sm leading-relaxed text-muted" role={orderError ? "alert" : "status"}>
            {orderError ?? checkoutHint}
          </p>
        </section>
      </div>
    </div>
  );
}

function TemplateThumb({ svg }: { svg?: string }) {
  if (!svg) {
    return <span className="block h-28 rounded-xl border border-dashed border-line bg-background" aria-hidden="true" />;
  }
  const markup = svg.replace(/^\s*<\?xml[^>]*>\s*/, "");
  return (
    <span
      className="block h-28 overflow-hidden rounded-xl bg-background [&_svg]:h-full [&_svg]:w-full"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  const invalid = draft.length > 0 && !isHexColor(draft);

  return (
    <div>
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          value={isHexColor(value) ? value : "#14221f"}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
          aria-label={`${label}, selector`}
          className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1"
        />
        <input
          id={inputId}
          value={draft}
          onChange={(event) => {
            const next = event.target.value.trim();
            setDraft(next);
            if (isHexColor(next)) onChange(next);
          }}
          spellCheck={false}
          autoCapitalize="none"
          maxLength={7}
          aria-invalid={invalid || undefined}
          className="h-11 w-full rounded-xl border border-line bg-background px-3 font-mono text-sm uppercase"
        />
      </div>
    </div>
  );
}

function logoErrorMessage(code: "type" | "size" | "read"): string {
  if (code === "size") return "El logo es demasiado pesado. Probá con una imagen más chica.";
  if (code === "read") return "No pudimos leer esa imagen.";
  return "Usá un PNG, JPG o WebP.";
}

function orderErrorMessage(code: string): string {
  if (code === "invalid-link") return "Revisá el enlace de Google antes de continuar.";
  if (code === "insufficient-contrast") return "Revisá el contraste del QR y del texto.";
  if (code === "invalid-text") return "Completá el nombre del negocio.";
  if (code === "review-unverified") return "Confirmá que el enlace abre el formulario de reseña.";
  if (code === "invalid-logo") return "El logo no pasó la validación. Subilo de nuevo.";
  if (code === "invalid-email") return "Revisá el correo antes de continuar.";
  if (code === "invalid-font" || code === "invalid-template") return "Elegí una plantilla del editor.";
  if (isCommercialIssue(code)) return commercialIssueMessage(code);
  if (code === "database-unavailable" || code === "order-failed") {
    return "No pudimos guardar el pedido. Intentá de nuevo en un momento.";
  }
  return "No se pudo crear el pedido.";
}

function revealIssue(url: string, touched: boolean, issue: LinkIssue | null): LinkIssue | null {
  if (!issue) return null;
  const trimmed = url.trim();
  if (!trimmed) return touched ? "empty" : null;
  if (isIncompleteHttpsPrefix(trimmed)) return touched ? issue : null;
  return issue;
}
