import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Container } from "@/components/container";
import { RecoveryForm } from "@/components/recovery-form";
import { createMailSender } from "@/lib/mail";

export const metadata: Metadata = {
  title: "Recuperar descargas",
  description: "Pedí un enlace privado para entrar a las descargas de un pedido pagado.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default function RecoveryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
          <RecoveryContent searchParams={searchParams} />
        </Suspense>
      </Container>
    </main>
  );
}

async function RecoveryContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const query = await searchParams;
  const estado = Array.isArray(query.estado) ? query.estado[0] : query.estado;
  const mail = createMailSender();

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Acceso</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight">Recuperar descargas</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
        Escribí el correo que dejaste antes de pagar. Si tiene compras pagadas, preparamos un enlace privado para
        este dispositivo. No hace falta una cuenta.
      </p>
      {mail.mode === "dev-outbox" ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          El envío a un buzón real no está conectado. En este desarrollo, el enlace queda en{" "}
          <span className="font-mono">.data/mail-outbox.jsonl</span> y no sale de esta computadora.
        </p>
      ) : mail.mode === "resend" ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Si ese correo tiene compras pagadas, el enlace sale solo hacia esa casilla.
        </p>
      ) : (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          El envío de correo todavía no está conectado a un proveedor, así que el enlace no sale hacia un buzón.
        </p>
      )}
      {estado === "enlace" ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed" role="status">
          Ese enlace no está disponible. Puede haber vencido o ya se usó. Pedí uno nuevo con el correo de la compra.
        </p>
      ) : null}
      <RecoveryForm />
    </>
  );
}
