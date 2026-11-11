import Link from "next/link";
import { Container } from "@/components/container";
import { BrandLogo } from "@/components/logo";

const linkClass = "hover:text-accent-strong";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-card">
      <Container className="grid gap-8 py-10 sm:grid-cols-[minmax(0,1.4fr)_auto_auto]">
        <div className="max-w-xl">
          <div className="flex items-center gap-2.5">
            <BrandLogo height={24} />
            <span aria-hidden="true" className="h-4 w-px bg-line" />
            <p className="font-display text-sm font-semibold text-accent">QR</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Creá códigos QR con diseño para tu sitio, tus redes, WhatsApp, Wi-Fi, tu menú o tus reseñas de Google.
            Descargalos listos para imprimir.
          </p>
        </div>
        <nav aria-label="Producto" className="flex flex-col gap-2 text-sm font-semibold">
          <Link href="/#como-funciona" className={linkClass}>
            Cómo funciona
          </Link>
          <Link href="/empezar" className={linkClass}>
            Crear mi QR
          </Link>
          <Link href="/crear" className={linkClass}>
            Editor avanzado
          </Link>
          <Link href="/preguntas-frecuentes" className={linkClass}>
            Preguntas frecuentes
          </Link>
          <Link href="/recuperar" className={linkClass}>
            Recuperar descargas
          </Link>
          <Link href="/contacto" className={linkClass}>
            Contacto
          </Link>
        </nav>
        <nav aria-label="Legal" className="flex flex-col gap-2 text-sm">
          <Link href="/terminos" className={linkClass}>
            Términos y condiciones
          </Link>
          <Link href="/privacidad" className={linkClass}>
            Privacidad
          </Link>
          <Link href="/reembolsos" className={linkClass}>
            Reembolsos
          </Link>
          <Link
            href="/arrepentimiento"
            className="mt-1 inline-flex w-fit items-center rounded-full border border-line px-3 py-1 font-semibold hover:border-accent hover:text-accent-strong"
          >
            Botón de arrepentimiento
          </Link>
        </nav>
      </Container>
      <div className="border-t border-line">
        <Container className="py-4 text-sm text-muted">© 2026 AtajoLab</Container>
      </div>
    </footer>
  );
}
