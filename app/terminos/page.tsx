import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalValue } from "@/components/legal-page";
import { legal } from "@/lib/legal";
import { formatArs, PIECE_PRICE_ARS } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Condiciones de uso y de compra de los carteles QR digitales de AtajoLab.",
  alternates: { canonical: "/terminos" },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Términos y condiciones"
      intro={
        <p>
          Estos términos regulan el uso del sitio y la compra de piezas digitales de {legal.tradeName}. Al comprar,
          aceptás estas condiciones.
        </p>
      }
    >
      <LegalSection title="1. Quién vende">
        <p>
          El servicio lo presta <LegalValue value={legal.legalName} />, con base en{" "}
          <LegalValue value={legal.publicLocation} /> (ciudad y provincia, no es un domicilio). CUIT{" "}
          <LegalValue value={legal.taxId} />. Domicilio legal: <LegalValue value={legal.address} />. Contacto:{" "}
          <LegalValue value={legal.supportEmail} />.
        </p>
      </LegalSection>

      <LegalSection title="2. Qué se compra">
        <p>
          Una pieza digital: un diseño en el formato que elijas (por ejemplo, un cartel A6 de 105 × 148 mm) con un
          código QR que lleva el contenido que vos cargás: un enlace, los datos de una red Wi-Fi, un contacto o un
          texto. El código es estático: guarda ese contenido tal cual y no se puede cambiar después de la compra. Se
          entrega en archivos PNG, SVG y PDF para que lo imprimas o publiques por tu cuenta. No incluye impresión ni
          envío físico.
        </p>
        <p>
          El pedido guarda una copia del diseño al momento de crearlo. Los cambios que hagas después en el editor no
          modifican un pedido ya creado.
        </p>
      </LegalSection>

      <LegalSection title="3. Precio y pago">
        <p>
          El precio es {formatArs(PIECE_PRICE_ARS)} en pesos argentinos por pieza, pago único. Condición fiscal del
          vendedor: <LegalValue value={legal.taxCondition} />.
        </p>
        <p>
          El pago se procesa con Mercado Pago. {legal.tradeName} no recibe ni guarda datos de tarjetas. El pedido se
          confirma cuando Mercado Pago informa el pago como aprobado.
        </p>
      </LegalSection>

      <LegalSection title="4. Entrega">
        <p>
          Con el pago aprobado, las descargas se habilitan en la página del pedido, en el navegador donde lo creaste.
          Si dejaste tu correo, te enviamos un enlace de acceso. Desde otro dispositivo podés pedir un enlace nuevo en{" "}
          <Link href="/recuperar" className="underline">
            Recuperar descargas
          </Link>
          . Cada enlace vence a los 30 minutos y sirve una sola vez.
        </p>
      </LegalSection>

      <LegalSection title="5. Tu contenido y tu enlace">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Sos responsable de que el enlace cargado sea correcto y de tu negocio. Antes de comprar revisá que el QR
            abra la página que querés.
          </li>
          <li>
            Los textos, logos e imágenes que subas tienen que ser tuyos o tenés que tener permiso para usarlos.
          </li>
          <li>
            Google, Google Maps y las reseñas son servicios de terceros. {legal.tradeName} no está afiliado a Google
            y no controla esos servicios ni garantiza cambios en tus calificaciones.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Revocación, cambios y reembolsos">
        <p>
          Podés ejercer tu derecho de revocación según la Ley 24.240 de Defensa del Consumidor desde el{" "}
          <Link href="/arrepentimiento" className="underline">
            Botón de arrepentimiento
          </Link>
          . Las condiciones de reembolso están en la{" "}
          <Link href="/reembolsos" className="underline">
            política de reembolsos
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="7. Datos personales">
        <p>
          El tratamiento de tus datos se explica en la{" "}
          <Link href="/privacidad" className="underline">
            política de privacidad
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="8. Ley aplicable y reclamos">
        <p>
          Se aplican las leyes de la República Argentina. Para reclamos, escribinos primero a{" "}
          <LegalValue value={legal.supportEmail} />. Jurisdicción: <LegalValue value={legal.jurisdiction} />, sin
          perjuicio de los derechos que la ley de defensa del consumidor te reconoce.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
