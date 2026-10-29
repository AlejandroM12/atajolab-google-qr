import Link from "next/link";
import { Container } from "@/components/container";
import { LogoMark } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-card">
      <Container className="grid gap-8 py-10 sm:grid-cols-[minmax(0,1.4fr)_auto]">
        <div className="max-w-xl">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <p className="text-sm font-semibold">AtajoLab</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Creá carteles y stickers QR personalizados para tu negocio. Descargalos listos para imprimir.
          </p>
        </div>
        <nav aria-label="Pie de página" className="flex flex-col gap-2 text-sm font-semibold">
          <Link href="/#como-funciona" className="hover:text-accent-strong">
            Cómo funciona
          </Link>
          <Link href="/#formatos" className="hover:text-accent-strong">
            Formatos
          </Link>
          <Link href="/crear" className="hover:text-accent-strong">
            Crear mi cartel QR
          </Link>
          <Link href="/recuperar" className="hover:text-accent-strong">
            Recuperar descargas
          </Link>
        </nav>
      </Container>
      <div className="border-t border-line">
        <Container className="py-4 text-sm text-muted">© 2026 AtajoLab</Container>
      </div>
    </footer>
  );
}
