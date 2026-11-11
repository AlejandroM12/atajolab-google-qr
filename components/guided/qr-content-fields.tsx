"use client";

import { useId } from "react";
import { guides } from "@/lib/product";
import {
  QR_TEXT_MAX,
  WHATSAPP_MESSAGE_MAX,
  socialNetworks,
  type QrContentInput,
  type WifiSecurity,
} from "@/lib/qr-content";

const inputClass =
  "mt-1.5 h-12 w-full rounded-xl border border-line bg-background px-3 text-base text-foreground placeholder:text-muted/70";
const areaClass =
  "mt-1.5 min-h-24 w-full rounded-xl border border-line bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted/70";
const chipClass =
  "inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors";

export type QrFieldError = { field: string; message: string } | null;

const WIFI_SECURITY: { id: WifiSecurity; name: string }[] = [
  { id: "WPA", name: "WPA / WPA2 / WPA3" },
  { id: "WEP", name: "WEP" },
  { id: "nopass", name: "Sin contraseña" },
];

/** The few fields each kind of QR content needs. Used by the guided flow and by the editor. */
export function QrContentFields({
  value,
  error,
  onChange,
}: {
  value: QrContentInput;
  error: QrFieldError;
  onChange: (next: QrContentInput) => void;
}) {
  const failed = (field: string) => (error?.field === field ? error.message : null);

  if (value.type === "url" || value.type === "event" || value.type === "menu") {
    return (
      <div className="flex flex-col gap-4">
        {value.type === "menu" ? (
          <Chips
            label="¿Qué vas a mostrar?"
            options={[
              { id: "menu", name: "Menú" },
              { id: "catalogo", name: "Catálogo" },
            ]}
            selected={value.kind}
            onSelect={(kind) => onChange({ ...value, kind })}
          />
        ) : null}
        <Field
          label={
            value.type === "menu"
              ? value.kind === "catalogo"
                ? "Enlace de tu catálogo"
                : "Enlace de tu menú"
              : value.type === "event"
                ? "Enlace del evento"
                : "Enlace"
          }
          hint={
            value.type === "menu"
              ? "La página, el PDF o la carpeta donde ya lo tenés publicado."
              : value.type === "event"
                ? "La página con la información, la inscripción o las entradas."
                : "Tu sitio, un formulario, un video: cualquier página."
          }
          error={failed("url")}
        >
          {(props) => (
            <input
              {...props}
              className={inputClass}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="tusitio.com"
              maxLength={600}
              value={value.url}
              onChange={(event) => onChange({ ...value, url: event.target.value })}
            />
          )}
        </Field>
      </div>
    );
  }

  if (value.type === "maps" || value.type === "review") {
    const guide = guides[value.type === "maps" ? "ubicacion" : "resena"];
    return (
      <div className="flex flex-col gap-4">
        <Field
          label={value.type === "maps" ? "Enlace de Google Maps" : "Enlace para dejar una reseña"}
          hint={guide.note}
          error={failed("url")}
        >
          {(props) => (
            <input
              {...props}
              className={inputClass}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={guide.examples[0]}
              maxLength={1600}
              value={value.url}
              onChange={(event) => onChange({ ...value, url: event.target.value })}
            />
          )}
        </Field>
        <details className="rounded-2xl border border-line bg-background px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">{guide.title}</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 leading-relaxed text-muted">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      </div>
    );
  }

  if (value.type === "social") {
    return (
      <div className="flex flex-col gap-4">
        <Chips
          label="Red"
          options={socialNetworks}
          selected={value.network}
          onSelect={(network) => onChange({ ...value, network })}
        />
        <Field
          label={value.network === "otra" ? "Enlace de tu perfil" : "Usuario o enlace de tu perfil"}
          error={failed("handle")}
        >
          {(props) => (
            <input
              {...props}
              className={inputClass}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={value.network === "otra" ? "https://" : "@tunegocio"}
              maxLength={600}
              value={value.handle}
              onChange={(event) => onChange({ ...value, handle: event.target.value })}
            />
          )}
        </Field>
      </div>
    );
  }

  if (value.type === "whatsapp") {
    return (
      <div className="flex flex-col gap-4">
        <Field label="Número de WhatsApp" hint="Con código de país. Por ejemplo: 54 9 11 2345 6789." error={failed("phone")}>
          {(props) => (
            <input
              {...props}
              className={inputClass}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="54 9 11 2345 6789"
              maxLength={30}
              value={value.phone}
              onChange={(event) => onChange({ ...value, phone: event.target.value })}
            />
          )}
        </Field>
        <Field
          label="Mensaje inicial (opcional)"
          hint="Aparece ya escrito cuando abren el chat."
          error={failed("message")}
        >
          {(props) => (
            <textarea
              {...props}
              className={areaClass}
              placeholder="¡Hola! Quiero hacer una consulta."
              maxLength={WHATSAPP_MESSAGE_MAX}
              value={value.message}
              onChange={(event) => onChange({ ...value, message: event.target.value })}
            />
          )}
        </Field>
      </div>
    );
  }

  if (value.type === "wifi") {
    return (
      <div className="flex flex-col gap-4">
        <Field label="Nombre de la red" hint="Tal cual aparece en el celular, con mayúsculas y espacios." error={failed("ssid")}>
          {(props) => (
            <input
              {...props}
              className={inputClass}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={32}
              value={value.ssid}
              onChange={(event) => onChange({ ...value, ssid: event.target.value })}
            />
          )}
        </Field>
        <Chips
          label="Seguridad"
          options={WIFI_SECURITY}
          selected={value.security}
          onSelect={(security) => onChange({ ...value, security })}
        />
        {value.security !== "nopass" ? (
          <Field
            label="Contraseña"
            hint="Queda guardada dentro del código: quien lo escanee se conecta."
            error={failed("password")}
          >
            {(props) => (
              <input
                {...props}
                className={inputClass}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                value={value.password}
                onChange={(event) => onChange({ ...value, password: event.target.value })}
              />
            )}
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={value.hidden}
            onChange={(event) => onChange({ ...value, hidden: event.target.checked })}
          />
          La red está oculta
        </label>
      </div>
    );
  }

  if (value.type === "vcard") {
    return (
      <div className="flex flex-col gap-4">
        <Field label="Nombre y apellido" error={failed("name")}>
          {(props) => (
            <input
              {...props}
              className={inputClass}
              type="text"
              autoComplete="name"
              maxLength={60}
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono" error={failed("phone")}>
            {(props) => (
              <input
                {...props}
                className={inputClass}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+54 9 11 2345 6789"
                maxLength={30}
                value={value.phone}
                onChange={(event) => onChange({ ...value, phone: event.target.value })}
              />
            )}
          </Field>
          <Field label="Correo" error={failed("email")}>
            {(props) => (
              <input
                {...props}
                className={inputClass}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={120}
                value={value.email}
                onChange={(event) => onChange({ ...value, email: event.target.value })}
              />
            )}
          </Field>
          <Field label="Empresa (opcional)" error={failed("org")}>
            {(props) => (
              <input
                {...props}
                className={inputClass}
                type="text"
                autoComplete="organization"
                maxLength={60}
                value={value.org}
                onChange={(event) => onChange({ ...value, org: event.target.value })}
              />
            )}
          </Field>
          <Field label="Sitio web (opcional)" error={failed("url")}>
            {(props) => (
              <input
                {...props}
                className={inputClass}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="tusitio.com"
                maxLength={300}
                value={value.url}
                onChange={(event) => onChange({ ...value, url: event.target.value })}
              />
            )}
          </Field>
        </div>
      </div>
    );
  }

  return (
    <Field
      label="Texto"
      hint={`${value.text.length}/${QR_TEXT_MAX} · Se muestra en pantalla al escanear, sin conexión.`}
      error={failed("text")}
    >
      {(props) => (
        <textarea
          {...props}
          className={areaClass}
          maxLength={QR_TEXT_MAX}
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        />
      )}
    </Field>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error: string | null;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => React.ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": note ? noteId : undefined })}
      {note ? (
        <p
          id={noteId}
          role={error ? "alert" : undefined}
          className={`mt-1.5 text-sm leading-5 ${error ? "font-semibold text-danger" : "text-muted"}`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Chips<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly { id: T; name: string }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected === option.id}
            className={`${chipClass} ${
              selected === option.id
                ? "border-accent bg-accent text-white"
                : "border-line bg-card text-foreground hover:border-accent"
            }`}
            onClick={() => onSelect(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
