import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { DEMO_BUSINESS_NAME, SAMPLE_HEIGHT_PX, SAMPLE_WIDTH_PX, sampleImageUrl } from "@/lib/landing-samples";
import { SectionHeading } from "@/components/section-heading";
import { premiumTemplates } from "@/lib/artwork";

export function Designs() {
  return (
    <section id="disenos" className="scroll-mt-24 border-t border-line bg-card py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Diseños" title="Un diseño para cada negocio">
          Estos son ejemplos para reseñas de Google. Abrí cualquiera en el editor y cambialo a tu manera.
        </SectionHeading>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {premiumTemplates.map((template) => (
            <li key={template.id} className="flex flex-col rounded-3xl border border-line bg-background p-4">
              <div className="overflow-hidden rounded-2xl bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt same-origin WebP (app/previews), already sized */}
                <img
                  src={sampleImageUrl(template.id)}
                  width={SAMPLE_WIDTH_PX}
                  height={SAMPLE_HEIGHT_PX}
                  loading="lazy"
                  decoding="async"
                  alt={`Ejemplo del diseño ${template.name} para ${DEMO_BUSINESS_NAME}`}
                  className="block h-auto w-full"
                />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{template.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{template.description}</p>
              <div className="mt-4">
                <ButtonLink href={`/crear?plantilla=${premiumToStudio(template.id)}`} variant="secondary">
                  Usar {template.name}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Los ejemplos usan el nombre «{DEMO_BUSINESS_NAME}» y un enlace de prueba. En el editor podés cambiarlo todo.
        </p>
        <div className="mt-8">
          <ButtonLink href="/empezar">Crear mi QR</ButtonLink>
        </div>
      </Container>
    </section>
  );
}

function premiumToStudio(id: (typeof premiumTemplates)[number]["id"]): string {
  if (id === "stand-classic") return "clasico";
  if (id === "stand-vivid") return "vivo";
  if (id === "stand-dark") return "nocturno";
  return "negocio";
}
