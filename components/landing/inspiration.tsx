import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { inspirationDesigns } from "@/lib/studio/inspiration";
import { renderInspirationPreviewDataUrl } from "@/lib/studio/inspiration-preview";

export async function Inspiration() {
  const previews = Object.fromEntries(
    await Promise.all(
      inspirationDesigns.map(async (item) => [item.id, await renderInspirationPreviewDataUrl(item.document)] as const),
    ),
  );

  return (
    <section id="inspiracion" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Inspiración" title="Mirá lo que podés crear">
          Diseños listos para personalizar. Elegí uno, cambiá textos y colores, y comprá tu cartel.
        </SectionHeading>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inspirationDesigns.map((item) => (
            <li key={item.id} className="flex flex-col rounded-3xl border border-line bg-card p-4">
              <div className="rounded-2xl bg-background p-1" style={{ aspectRatio: "105 / 148" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- preview is a same-origin data URL from Studio export */}
                <img
                  src={previews[item.id]}
                  alt={`Ejemplo ${item.name}: ${item.business}`}
                  className="h-full w-full rounded-xl object-contain"
                />
              </div>
              <h3 className="mt-4 text-lg font-semibold leading-snug">{item.name}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{item.description}</p>
              <div className="mt-4">
                <ButtonLink href={`/crear?inspiracion=${item.id}`} variant="secondary">
                  Usar este diseño
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
