import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";

export default function NotFound() {
  return (
    <main>
      <Container className="py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">404</p>
        <h1 className="mt-3 text-4xl font-semibold">Esta página no existe</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
          El enlace no corresponde a una pantalla de AtajoLab Google QR.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/">Volver al inicio</ButtonLink>
          <ButtonLink href="/crear" variant="secondary">
            Crear mi cartel QR
          </ButtonLink>
        </div>
      </Container>
    </main>
  );
}
