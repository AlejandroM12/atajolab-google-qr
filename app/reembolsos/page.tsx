import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalValue } from "@/components/legal-page";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de reembolsos",
  description: "Cómo pedir la revocación de una compra o un reembolso en AtajoLab.",
  alternates: { canonical: "/reembolsos" },
};

/** Commercial rules come from lib/legal.ts (business decisions, need legal review). */
export default function RefundsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de reembolsos"
      intro={<p>Queremos que el cartel te sirva. Si hay un problema, escribinos con tu número de pedido.</p>}
    >
      <LegalSection title="Revocación de la compra (arrepentimiento)">
        <p>
          La Ley 24.240 de Defensa del Consumidor te permite revocar una compra a distancia dentro de los 10 días
          corridos desde la compra. Podés hacerlo sin registrarte desde el{" "}
          <Link href="/arrepentimiento" className="underline">
            Botón de arrepentimiento
          </Link>
          .
        </p>
        <p>
          Alcance para piezas digitales ya descargadas:{" "}
          <LegalValue value={legal.refundDigitalScope} />.
        </p>
      </LegalSection>

      <LegalSection title="Problemas con los archivos">
        <p>
          Si un archivo no se descarga, no abre o el QR no lleva al enlace que cargaste, escribinos a{" "}
          <LegalValue value={legal.supportEmail} /> con tu número de pedido. Lo revisamos y te damos una solución:{" "}
          <LegalValue value={legal.refundProblemRemedy} />.
        </p>
      </LegalSection>

      <LegalSection title="Cómo se devuelve el dinero">
        <p>
          Los reembolsos se hacen por Mercado Pago, al mismo medio de pago que usaste. Los plazos de acreditación
          dependen de Mercado Pago y de tu banco o tarjeta.
        </p>
        <p>
          Plazo para procesar el reembolso de nuestro lado:{" "}
          <LegalValue value={legal.refundProcessingTime} />.
        </p>
      </LegalSection>

      <LegalSection title="Errores en el diseño">
        <p>
          Antes de pagar ves la vista previa del diseño y el enlace del QR. Si compraste con un error de tipeo o un
          enlace equivocado: <LegalValue value={legal.designErrorPolicy} />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
