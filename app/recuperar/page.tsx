import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Container } from "@/components/container";
import { RecoveryForm } from "@/components/recovery-form";
import { createMailSender } from "@/lib/mail";

export const metadata: Metadata = {
  title: "Recuperar mis descargas",
  description: "Pedí un enlace para volver a descargar los archivos de una compra confirmada.",
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
      <h1 className="mt-3 text-4xl font-semibold leading-tight">Recuperar mis descargas</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
        Escribí el correo que dejaste al comprar. Si tiene compras confirmadas, te enviamos un enlace para descargar
        los archivos en este dispositivo. No hace falta una cuenta.
      </p>
      {mail.mode === "dev-outbox" ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          El correo todavía no está conectado a un buzón real. En este entorno de desarrollo el enlace no sale de esta computadora.
        </p>
      ) : mail.mode === "resend" ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Si ese correo tiene compras confirmadas, el enlace llega solo a esa casilla.
        </p>
      ) : (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          El envío de correo todavía no está conectado a un proveedor, así que el enlace no sale hacia un buzón.
        </p>
      )}
      {estado === "enlace" ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed" role="status">
          Ese enlace no está disponible. Puede haber vencido o ya se usó. Pedí uno nuevo con el mismo correo.
        </p>
      ) : null}
      <RecoveryForm />
    </>
  );
}
