import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { WithdrawalForm } from "@/components/withdrawal-form";
import { supportMailbox } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento",
  description: "Revocá tu compra en AtajoLab sin registrarte, según la Ley 24.240.",
  alternates: { canonical: "/arrepentimiento" },
};

export default function WithdrawalPage() {
  return (
    <LegalPage
      eyebrow="Defensa del consumidor"
      title="Botón de arrepentimiento"
      intro={
        <p>
          Podés revocar tu compra dentro de los 10 días corridos desde que la hiciste, sin registrarte y sin dar
          explicaciones (Ley 24.240, art. 34; Código Civil y Comercial, art. 1110; Disposición 954/2025 de la
          Subsecretaría de Defensa del Consumidor y Lealtad Comercial).
        </p>
      }
    >
      <LegalSection title="Pedir la revocación">
        <WithdrawalForm enabled={supportMailbox() !== null} />
      </LegalSection>
      <LegalSection title="Qué pasa después">
        <p>
          Te mostramos un código de solicitud al instante y, si tu correo es válido, te lo enviamos también (la
          Disposición 954/2025 exige entregarlo dentro de las 24 horas). Te
          escribimos para continuar el trámite. Las condiciones están en la{" "}
          <Link href="/reembolsos" className="underline">
            política de reembolsos
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
