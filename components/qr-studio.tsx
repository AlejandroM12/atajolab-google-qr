"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StudioPiece } from "@/components/studio-piece";
import { QrSlot, type QrPayload } from "@/components/qr-slot";
import {
  BUSINESS_NAME_MAX,
  SUBTITLE_MAX,
  artworkFonts,
  buildStudioArtwork,
  defaultHeadline,
  phraseLibrary,
  studioTemplates,
  type ArtworkFontId,
  type ArtworkLogo,
  type StudioTemplateId,
} from "@/lib/artwork";
import { assessContrast, formatContrastRatio, isHexColor } from "@/lib/color";
import {
  isIncompleteHttpsPrefix,
  linkIssueMessage,
  validateGoogleLink,
  type GoogleLinkGoal,
  type LinkIssue,
} from "@/lib/google-link";
import { parseBuyerEmail } from "@/lib/buyer-email";
import { prepareLogoFile } from "@/lib/logo-prepare";
import { formatArs, PIECE_PRICE_ARS } from "@/lib/pricing";
import { QR_DEFAULTS, QR_SIZES, goals, guides, type QrSize } from "@/lib/product";

const palettes: Record<
  StudioTemplateId,
  {
    surface: string;
    ink: string;
    accent: string;
    foreground: string;
    background: string;
    fontId: ArtworkFontId;
  }
> = {
  "minimal-elegance": {
    surface: "#f7f4ee",
    ink: "#1c1915",
    accent: "#8d7350",
    foreground: "#1c1915",
    background: "#ffffff",
    fontId: "fraunces",
  },
  "dark-premium": {
    surface: "#161311",
    ink: "#f6f1e7",
    accent: "#c6a36a",
    foreground: "#1a1612",
    background: "#f7f1e6",
    fontId: "sora",
  },
  "brand-identity": {
    surface: "#fbfaf7",
    ink: "#14221f",
    accent: "#0f6e62",
    foreground: "#14221f",
    background: "#ffffff",
    fontId: "sora",
  },
};

export function QrStudio() {
  const [goal, setGoal] = useState<GoogleLinkGoal>("ubicacion");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [templateId, setTemplateId] = useState<StudioTemplateId>("minimal-elegance");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [subtitle, setSubtitle] = useState(defaultHeadline("ubicacion"));
  const [subtitleEdited, setSubtitleEdited] = useState(false);
  const [fontId, setFontId] = useState<ArtworkFontId>(palettes["minimal-elegance"].fontId);
  const [surface, setSurface] = useState(palettes["minimal-elegance"].surface);
  const [ink, setInk] = useState(palettes["minimal-elegance"].ink);
  const [accent, setAccent] = useState(palettes["minimal-elegance"].accent);
  const [foreground, setForeground] = useState(palettes["minimal-elegance"].foreground);
  const [background, setBackground] = useState(palettes["minimal-elegance"].background);
  const [size, setSize] = useState<QrSize>(QR_DEFAULTS.size);
  const [logo, setLogo] = useState<ArtworkLogo | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [qrPhase, setQrPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const result = useMemo(() => validateGoogleLink(url, goal), [url, goal]);
  const qrContrast = assessContrast(foreground, background);
  const textContrast = assessContrast(ink, surface);
  const visibleIssue = revealIssue(url, touched, result.ok ? null : result.issue);

  const payload = useMemo<QrPayload | null>(() => {
    if (!result.ok || !qrContrast.sufficient) return null;
    return {
      key: `${result.href}|${foreground}|${background}|${size}`,
      href: result.href,
      foreground,
      background,
      size,
    };
  }, [result, qrContrast.sufficient, foreground, background, size]);

  const artwork = useMemo(
    () =>
      buildStudioArtwork({
        templateId,
        goal,
        businessName,
        subtitle,
        fontId,
        ink,
        accent,
        surface,
        foreground,
        background,
        qrSize: size,
        href: payload?.href ?? null,
        logo,
      }),
    [templateId, goal, businessName, subtitle, fontId, ink, accent, surface, foreground, background, size, payload, logo],
  );

  const nameReady = businessName.trim().length > 0;
  const subtitleReady = subtitle.trim().length > 0;
  const emailReady = parseBuyerEmail(email) !== null;
  const canOrder =
    Boolean(payload) && nameReady && subtitleReady && emailReady && textContrast.sufficient && !submitting && !logoBusy;
  const checkoutHint = !nameReady
    ? "Escribí el nombre del negocio para crear el pedido."
    : !subtitleReady
      ? "Elegí o escribí el subtítulo de la pieza."
      : !emailReady
        ? email.trim().length === 0
          ? "Dejá un correo para recuperar las descargas en otro dispositivo."
          : "Revisá el correo. Tiene que ser una dirección válida."
        : !textContrast.sufficient
        ? "El título y el fondo de la pieza necesitan más contraste."
        : !payload
          ? "El pedido se habilita cuando el enlace es válido y el QR tiene contraste."
          : "El pedido queda pendiente hasta que el pago de prueba quede confirmado.";

  function chooseTemplate(next: StudioTemplateId) {
    setTemplateId(next);
    const palette = palettes[next];
    setSurface(palette.surface);
    setInk(palette.ink);
    setAccent(palette.accent);
    setForeground(palette.foreground);
    setBackground(palette.background);
    setFontId(palette.fontId);
    setResetToken((token) => token + 1);
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    setLogoBusy(true);
    const prepared = await prepareLogoFile(file);
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
          goal,
          url,
          templateId,
          businessName,
          subtitle,
          fontId,
          ink,
          accent,
          surface,
          foreground,
          background,
          qrSize: size,
          logo: logo ? { data: logo.data } : null,
          email,
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
  const previewMessage =
    result.ok && !qrContrast.sufficient
      ? "El contraste del QR no alcanza. Oscurecé los módulos o aclará su fondo."
      : !textContrast.sufficient
        ? "El título no se distingue del fondo de la pieza."
        : qrPhase === "error"
          ? "No se pudo armar el QR. Si el enlace es muy largo, copiá el enlace corto de Compartir."
          : qrPhase === "ready"
            ? "Vista previa de la pieza, lista para escanear."
            : "La pieza muestra el QR cuando el enlace es válido.";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div className="order-1 lg:sticky lg:top-24 lg:order-2">
        <section aria-labelledby="vista-previa-title" className="rounded-[2rem] border border-line bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="vista-previa-title" className="text-base font-semibold">
              Pieza completa
            </h2>
            <p className="text-xs text-muted">{studioTemplates.find((item) => item.id === templateId)?.name}</p>
          </div>
          <p aria-live="polite" className="mt-2 min-h-10 text-sm leading-relaxed text-muted">
            {previewMessage}
          </p>
          <div className="mt-4 rounded-[1.6rem] bg-[radial-gradient(circle_at_center,#efe7d8,transparent_70%)] px-3 py-8">
            <StudioPiece artwork={artwork}>
              <QrSlot payload={payload} onPhase={setQrPhase} />
            </StudioPiece>
          </div>
        </section>
        {result.ok ? (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            El QR abre este enlace:{" "}
            <code className="mt-1 block break-all rounded-xl bg-card px-3 py-2 text-xs text-foreground">{result.href}</code>
          </p>
        ) : null}
      </div>

      <div className="order-2 space-y-6 lg:order-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Editor</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">Diseñá la pieza</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
            Elegí una plantilla, escribí el texto y mirá la tarjeta o el cartel completo, con el QR integrado.
          </p>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Plantilla</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {studioTemplates.map((template) => {
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
                  <TemplateThumb id={template.id} />
                  <span className="mt-3 block text-sm font-semibold">{template.name}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{template.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">Para qué es el QR</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {goals.map((item) => {
              const selected = goal === item.id;
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
                        setGoal(item.id);
                        if (!subtitleEdited) setSubtitle(defaultHeadline(item.id));
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
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm leading-relaxed text-muted">{guide.note}</p>
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
            Pegá un enlace HTTPS. La vista previa se arma en este navegador.
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
                  : "Enlace admitido para el formulario de reseña."
                : "La vista previa del QR aparece cuando el enlace es válido."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="nombre-negocio" className="text-sm font-semibold">
              Título
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
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="subtitulo" className="text-sm font-semibold">
              Subtítulo
            </label>
            <textarea
              id="subtitulo"
              value={subtitle}
              onChange={(event) => {
                setSubtitle(event.target.value.slice(0, SUBTITLE_MAX));
                setSubtitleEdited(true);
              }}
              maxLength={SUBTITLE_MAX}
              rows={2}
              className="mt-2 w-full resize-y rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-relaxed"
            />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Frases para {goal === "ubicacion" ? "ubicación" : "reseñas"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {phraseLibrary[goal].map((phrase) => (
              <button
                key={phrase}
                type="button"
                aria-pressed={subtitle === phrase}
                onClick={() => {
                  setSubtitle(phrase);
                  setSubtitleEdited(true);
                }}
                className={`rounded-full border px-3 py-1.5 text-left text-sm ${
                  subtitle === phrase ? "border-accent bg-ok-bg font-semibold" : "border-line bg-card"
                }`}
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>

        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-sm font-semibold">Logo del negocio</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Opcional. PNG, JPG o WebP de hasta 2 MB. Se recorta en cuadrado y se guarda como PNG, sin el archivo original.
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
          <legend className="text-sm font-semibold">Tipografía</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipografía">
            {artworkFonts.map((font) => {
              const selected = fontId === font.id;
              return (
                <label
                  key={font.id}
                  className={`cursor-pointer rounded-2xl border px-3 py-3 ${
                    selected ? "border-accent bg-ok-bg" : "border-line bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="tipografia"
                    value={font.id}
                    checked={selected}
                    onChange={() => setFontId(font.id)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold">{font.name}</span>
                  <span className="mt-1 block text-xs text-muted">{font.detail}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-line bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Colores</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <ColorField key={`surface-${resetToken}`} label="Fondo" value={surface} onChange={setSurface} />
            <ColorField key={`ink-${resetToken}`} label="Tinta" value={ink} onChange={setInk} />
            <ColorField key={`accent-${resetToken}`} label="Acento" value={accent} onChange={setAccent} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ColorField key={`frente-${resetToken}`} label="Módulos del QR" value={foreground} onChange={setForeground} />
            <ColorField key={`fondo-${resetToken}`} label="Fondo del QR" value={background} onChange={setBackground} />
          </div>
          <ContrastNotes
            qr={qrContrast}
            text={textContrast}
            active={result.ok}
          />
          <div className="mt-5">
            <p id="tamano-label" className="text-sm font-semibold">
              Tamaño del QR
            </p>
            <div role="radiogroup" aria-labelledby="tamano-label" className="mt-2 grid grid-cols-3 gap-2">
              {QR_SIZES.map((option) => {
                const selected = size === option.value;
                return (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-xl border px-2 py-3 text-center text-sm ${
                      selected ? "border-accent bg-ok-bg font-semibold" : "border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tamano"
                      value={option.value}
                      checked={selected}
                      onChange={() => setSize(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => chooseTemplate(templateId)}
            className="mt-5 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-accent"
          >
            Restaurar estilo de la plantilla
          </button>
        </fieldset>

        <section className="rounded-2xl border border-line bg-[#f7f3ea] p-5">
          <h2 className="text-sm font-semibold">Sobre Google</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            La pieza nombra «{artwork.serviceLine}» con texto. No usa el logo de Google, no inventa estrellas ni
            calificaciones y no presenta a AtajoLab como un producto oficial de Google.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            El símbolo NFC no entra en esta pieza digital. Queda reservado para un kit físico que tenga NFC de verdad.
          </p>
        </section>

        <section aria-labelledby="entrega-title" className="rounded-2xl border border-dashed border-line p-5">
          <h2 id="entrega-title" className="text-base font-semibold">
            Pedido
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pieza digital · {formatArs(PIECE_PRICE_ARS)} ARS. El precio lo define el servidor.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            El pedido guarda esta composición. Cuando el pago queda confirmado, vas a poder descargar PNG, SVG y PDF.
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

function TemplateThumb({ id }: { id: StudioTemplateId }) {
  if (id === "dark-premium") {
    return (
      <span className="flex h-16 items-end justify-end rounded-xl bg-[#161311] p-2" aria-hidden="true">
        <span className="size-6 rounded-md bg-[#f7f1e6]" />
      </span>
    );
  }
  if (id === "brand-identity") {
    return (
      <span className="flex h-16 overflow-hidden rounded-xl border border-line" aria-hidden="true">
        <span className="w-1/3 bg-accent" />
        <span className="flex flex-1 items-end justify-center bg-white p-2">
          <span className="size-6 bg-[#14221f]" />
        </span>
      </span>
    );
  }
  return (
    <span className="flex h-16 items-center justify-center rounded-xl border border-[#8d7350]/50 bg-[#f7f4ee]" aria-hidden="true">
      <span className="size-6 border border-[#8d7350]" />
    </span>
  );
}

function ContrastNotes({
  qr,
  text,
  active,
}: {
  qr: ReturnType<typeof assessContrast>;
  text: ReturnType<typeof assessContrast>;
  active: boolean;
}) {
  const notes = [
    text.sufficient ? null : `El título y el fondo contrastan ${formatContrastRatio(text.ratio)}. Hace falta 3:1.`,
    active && !qr.sufficient ? `El QR contrasta ${formatContrastRatio(qr.ratio)}. Hace falta 3:1.` : null,
    active && qr.low ? `El QR contrasta ${formatContrastRatio(qr.ratio)}. Conviene reforzarlo.` : null,
    active && qr.inverted ? "El fondo del QR quedó más oscuro que los módulos." : null,
  ].filter((note): note is string => Boolean(note));
  if (notes.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {notes.map((note) => (
        <p key={note} role="status" className="rounded-xl bg-warning-bg px-3 py-2 text-sm leading-relaxed text-warning">
          {note}
        </p>
      ))}
    </div>
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
  if (code === "invalid-text") return "Completá el título y el subtítulo.";
  if (code === "invalid-logo") return "El logo no pasó la validación. Subilo de nuevo.";
  if (code === "invalid-email") return "Revisá el correo antes de continuar.";
  if (code === "invalid-font" || code === "invalid-template") return "Elegí una plantilla del editor.";
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
