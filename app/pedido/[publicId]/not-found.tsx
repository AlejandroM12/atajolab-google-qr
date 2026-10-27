import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";

export default function OrderNotFound() {
  return (
    <main>
      <Container className="py-20">
        <h1 className="text-4xl font-semibold">No encontramos ese pedido</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
          El identificador no corresponde a un pedido de esta aplicación.
        </p>
        <div className="mt-8">
          <ButtonLink href="/crear">Volver al editor</ButtonLink>
        </div>
      </Container>
    </main>
  );
}
