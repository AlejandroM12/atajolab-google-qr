import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { formatList } from "@/lib/studio/formats";

export function Formats() {
  return (
    <section id="formatos" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Formatos" title="Un tamaño para cada lugar">
          Recibís archivos digitales en tamaño real. No enviamos un producto físico a domicilio.
        </SectionHeading>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {formatList.map((format) => (
            <li key={format.id} className="rounded-3xl border border-line bg-card p-5">
              <h3 className="text-base font-semibold leading-snug">{format.use}</h3>
              <p className="mt-1 text-sm text-muted">{format.name}</p>
              <p className="mt-3 text-sm font-semibold">{format.size}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
