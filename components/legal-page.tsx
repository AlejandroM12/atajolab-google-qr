import type { ReactNode } from "react";
import { Container } from "@/components/container";
import { isPending, legal, legalDataComplete } from "@/lib/legal";

/** Text that may still be a lib/legal.ts placeholder; placeholders are highlighted. */
export function LegalValue({ value }: { value: string }) {
  if (isPending(value)) {
    return <mark className="rounded bg-warning-bg px-1 font-semibold text-warning">{value}</mark>;
  }
  return <>{value}</>;
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main>
      <Container className="py-10 sm:py-14">
        <article className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">{title}</h1>
          {!legalDataComplete() ? (
            <p role="note" className="mt-6 rounded-2xl bg-warning-bg px-4 py-3 text-sm leading-relaxed text-warning">
              Borrador: faltan datos del titular del comercio. Los campos marcados como “COMPLETAR” se van a
              reemplazar antes de habilitar las ventas.
            </p>
          ) : null}
          {intro ? <div className="mt-6 text-lg leading-relaxed text-muted">{intro}</div> : null}
          <div className="legal-body mt-8 space-y-8 text-[0.95rem] leading-7">{children}</div>
          <p className="mt-12 text-sm text-muted">
            Última actualización: <LegalValue value={legal.lastUpdated} />
          </p>
        </article>
      </Container>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold leading-snug">{title}</h2>
      {children}
    </section>
  );
}
