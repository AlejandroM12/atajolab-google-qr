import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { DEMO_BUSINESS_NAME, designSampleSvg } from "@/components/landing/samples";
import { SectionHeading } from "@/components/section-heading";
import { premiumTemplates } from "@/lib/artwork";

export function Designs() {
  return (
    <section id="disenos" className="scroll-mt-24 border-t border-line bg-card py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Diseños" title="Un diseño para cada negocio">
          Elegí entre cuatro estilos y personalizalos a tu manera.
        </SectionHeading>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {premiumTemplates.map((template) => (
            <li key={template.id} className="flex flex-col rounded-3xl border border-line bg-background p-4">
              <div
                className="overflow-hidden rounded-2xl bg-card [&_svg]:h-auto [&_svg]:w-full"
                role="img"
                aria-label={`Ejemplo del diseño ${template.name} para ${DEMO_BUSINESS_NAME}`}
                dangerouslySetInnerHTML={{ __html: designSampleSvg(template.id) }}
              />
              <h3 className="mt-4 text-lg font-semibold">{template.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{template.description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">Los ejemplos usan el nombre «{DEMO_BUSINESS_NAME}» y un enlace de prueba.</p>
        <div className="mt-8">
          <ButtonLink href="/crear">Crear mi cartel QR</ButtonLink>
        </div>
      </Container>
    </section>
  );
}
