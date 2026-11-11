import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { inspirationDesigns } from "@/lib/studio/inspiration";
import { inspirationPreviewSize, inspirationPreviewUrls } from "@/lib/studio/inspiration-preview-url";

export function Inspiration() {
  const previews = inspirationPreviewUrls();

  return (
    <section id="ejemplos" className="scroll-mt-24 border-t border-line bg-card py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Ejemplos" title="Un diseño para cada uso">
          Hechos con el mismo editor que vas a usar. Abrí cualquiera y poné tus datos.
        </SectionHeading>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {inspirationDesigns.map((item) => {
            const size = inspirationPreviewSize(item.id);
            return (
              <li key={item.id} className="flex flex-col rounded-3xl border border-line bg-background p-3 sm:p-4">
                <div className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-card p-3 sm:p-5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt same-origin WebP (app/previews), already sized */}
                  <img
                    src={previews[item.id]}
                    width={size.width}
                    height={size.height}
                    loading="lazy"
                    decoding="async"
                    alt={`Ejemplo de ${item.name.toLowerCase()}: ${item.business}`}
                    className="max-h-full w-auto max-w-full rounded-md shadow-[0_10px_24px_rgba(20,34,31,0.16)]"
                  />
                </div>
                <h3 className="mt-4 text-base font-semibold leading-snug sm:text-lg">{item.name}</h3>
                <p className="mt-1 text-xs font-semibold text-accent">{item.format}</p>
                <p className="mt-2 hidden text-sm leading-6 text-muted sm:block">{item.description}</p>
                <div className="mt-4 pt-0 sm:mt-auto sm:pt-4">
                  <ButtonLink href={`/crear?inspiracion=${item.id}`} variant="secondary" className="w-full sm:w-auto">
                    Usar este diseño
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-10">
          <ButtonLink href="/empezar">Crear el mío paso a paso</ButtonLink>
        </div>
      </Container>
    </section>
  );
}
