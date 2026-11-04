import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { inspirationDesigns } from "@/lib/studio/inspiration";
import { renderInspirationPreviewSvg } from "@/lib/studio/inspiration-preview";

export function Inspiration() {
  return (
    <section id="inspiracion" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Inspiración" title="Mirá lo que podés crear">
          Diseños listos para personalizar. Elegí uno, cambiá textos y colores, y comprá tu cartel.
        </SectionHeading>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inspirationDesigns.map((item) => {
            const svg = renderInspirationPreviewSvg(item.document).replace(/^\s*<\?xml[^>]*>\s*/, "");
            return (
              <li key={item.id} className="flex flex-col rounded-3xl border border-line bg-card p-4">
                <div
                  className="overflow-hidden rounded-2xl bg-background [&_svg]:h-auto [&_svg]:w-full"
                  role="img"
                  aria-label={`Ejemplo ${item.name}: ${item.business}`}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <h3 className="mt-4 text-lg font-semibold">{item.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
                <div className="mt-4">
                  <ButtonLink href={`/crear?inspiracion=${item.id}`} variant="secondary">
                    Usar este diseño
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
