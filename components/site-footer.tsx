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
            <p className="text-sm font-semibold">AtajoLab Google QR</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Herramienta para diseñar una tarjeta o un cartel a partir de un enlace de Google que pegás
            vos. La vista previa se arma en tu navegador. Si continuás al pago, el pedido queda
            pendiente hasta que Mercado Pago lo confirme. Esta versión no tiene cuentas ni habilita
            cobros reales.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            AtajoLab no está afiliado a Google. Google Maps y el Perfil de Empresa son servicios de
            Google.
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
            Diseñar la pieza
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
