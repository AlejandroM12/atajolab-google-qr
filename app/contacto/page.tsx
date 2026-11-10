import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalValue } from "@/components/legal-page";
import { isPending, legal, supportMailbox } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Cómo contactar a AtajoLab por consultas, pedidos y reclamos.",
  alternates: { canonical: "/contacto" },
};

export default function ContactPage() {
  const mailbox = supportMailbox();
  return (
    <LegalPage
      eyebrow="Ayuda"
      title="Contacto"
      intro={<p>Escribinos con tu número de pedido (está en la página de tu compra) y te respondemos.</p>}
    >
      <LegalSection title="Atención al cliente">
        <ul className="space-y-2">
          <li>
            Correo:{" "}
            {mailbox ? (
              <a className="underline" href={`mailto:${mailbox}`}>
                {mailbox}
              </a>
            ) : (
              <LegalValue value={legal.supportEmail} />
            )}
          </li>
          {legal.supportPhone ? <li>Teléfono / WhatsApp: {legal.supportPhone}</li> : null}
          <li>
            Horario: <LegalValue value={legal.supportHours} />
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Datos del comercio">
        <ul className="space-y-2">
          <li>
            Titular: <LegalValue value={legal.legalName} />
          </li>
          <li>
            Ubicación: <LegalValue value={legal.publicLocation} /> (ciudad y provincia, no es un domicilio)
          </li>
          <li>
            Contacto: <LegalValue value={legal.supportEmail} />
          </li>
          <li>
            CUIT: <LegalValue value={legal.taxId} />
          </li>
          <li>
            Condición frente al IVA: <LegalValue value={legal.taxCondition} />
          </li>
          <li>
            Domicilio legal: <LegalValue value={legal.address} />
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Atajos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Link href="/recuperar" className="underline">
              Recuperar mis descargas
            </Link>{" "}
            desde otro dispositivo.
          </li>
          <li>
            <Link href="/arrepentimiento" className="underline">
              Botón de arrepentimiento
            </Link>{" "}
            para revocar una compra.
          </li>
          <li>
            <Link href="/preguntas-frecuentes" className="underline">
              Preguntas frecuentes
            </Link>
            .
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Defensa del consumidor">
        <p>
          Si no resolvemos tu reclamo, podés acudir a la autoridad de defensa del consumidor de tu jurisdicción.{" "}
          {isPending(legal.consumerAuthorityUrl) ? (
            <LegalValue value={legal.consumerAuthorityUrl} />
          ) : (
            <a className="underline" href={legal.consumerAuthorityUrl} rel="noopener noreferrer" target="_blank">
              Defensa del Consumidor
            </a>
          )}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
