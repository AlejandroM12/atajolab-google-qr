import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { templateList } from "@/lib/studio/templates";

export function Designs() {
  return (
    <section id="disenos" className="scroll-mt-24 border-t border-line bg-card py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Plantillas" title="Empezá con un ejemplo o desde cero">
          Las plantillas son puntos de partida. Podés cambiar textos, colores, tipografías e imágenes a gusto.
        </SectionHeading>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {templateList.map((template) => (
            <li key={template.id} className="rounded-3xl border border-line bg-background p-6">
              <h3 className="text-lg font-semibold">{template.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{template.description}</p>
            </li>
          ))}
          <li className="rounded-3xl border border-dashed border-line bg-background p-6 sm:col-span-2">
            <h3 className="text-lg font-semibold">Desde cero</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Lienzo en blanco con un título y el código QR. Agregá y reorganizá lo que necesites.
            </p>
          </li>
        </ul>
        <div className="mt-8">
          <ButtonLink href="/crear">Crear mi cartel QR</ButtonLink>
        </div>
      </Container>
    </section>
  );
}
