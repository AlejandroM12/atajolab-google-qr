import type { ReactNode } from "react";
import { qrSlotWidth, templateSpec, type ProductArtworkV1 } from "@/lib/artwork";
import { isDarkColor } from "@/lib/color";

const PAPER = "#fffcf8";

export function ProductArtworkView({
  artwork,
  children,
}: {
  artwork: ProductArtworkV1;
  children: ReactNode;
}) {
  const spec = templateSpec(artwork.templateId);
  const name = artwork.businessName || "Tu negocio";
  const headline = artwork.headline || "Escaneá el código";
  const nameIsPlaceholder = artwork.businessName.length === 0;

  return (
    <div className="mx-auto w-full max-w-[17.5rem]">
      {artwork.templateId === "tarjeta-resena" ? (
        <ReviewCard
          artwork={artwork}
          name={name}
          headline={headline}
          nameIsPlaceholder={nameIsPlaceholder}
        >
          {children}
        </ReviewCard>
      ) : null}
      {artwork.templateId === "cartel-ubicacion" ? (
        <LocationSign
          artwork={artwork}
          name={name}
          headline={headline}
          nameIsPlaceholder={nameIsPlaceholder}
        >
          {children}
        </LocationSign>
      ) : null}
      {artwork.templateId === "sticker" ? (
        <QrSticker
          artwork={artwork}
          name={name}
          headline={headline}
          nameIsPlaceholder={nameIsPlaceholder}
        >
          {children}
        </QrSticker>
      ) : null}
      <p className="mt-3 text-center text-xs text-muted">
        {spec.name} · {spec.widthMm} × {spec.heightMm} mm
      </p>
    </div>
  );
}

function ReviewCard({
  artwork,
  name,
  headline,
  nameIsPlaceholder,
  children,
}: PieceProps) {
  const ink = artwork.foreground;
  const onInk = isDarkColor(ink) ? "#ffffff" : "#14221f";
  const onPaper = isDarkColor(ink) ? ink : "#14221f";

  return (
    <article
      className="relative w-full overflow-hidden rounded-[1.35rem] shadow-[0_18px_40px_rgba(20,34,31,0.14)]"
      style={{ aspectRatio: "90 / 140", backgroundColor: PAPER }}
    >
      <div className="absolute inset-0 flex flex-col">
        <header className="shrink-0 px-4 py-4" style={{ backgroundColor: ink, color: onInk }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Reseña</p>
          <p
            className={`mt-1 line-clamp-2 text-lg font-semibold leading-tight ${
              nameIsPlaceholder ? "opacity-60" : ""
            }`}
            style={{ fontFamily: "var(--font-sora), sans-serif" }}
          >
            {name}
          </p>
        </header>
        <div
          className="flex min-h-0 flex-1 flex-col items-center px-4 pt-3 pb-3 text-center"
          style={{ color: onPaper }}
        >
          <p className="line-clamp-3 shrink-0 text-sm font-semibold leading-snug">{headline}</p>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center py-2">
            <QrFrame artwork={artwork} basePercent={78}>
              {children}
            </QrFrame>
          </div>
          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
            Escaneá el código
          </p>
        </div>
      </div>
    </article>
  );
}

function LocationSign({
  artwork,
  name,
  headline,
  nameIsPlaceholder,
  children,
}: PieceProps) {
  const ink = artwork.foreground;
  const onPaper = isDarkColor(ink) ? ink : "#14221f";

  return (
    <article
      className="relative w-full overflow-hidden rounded-[1.15rem] shadow-[0_18px_40px_rgba(20,34,31,0.14)]"
      style={{ aspectRatio: "105 / 148", backgroundColor: PAPER }}
    >
      <div className="absolute inset-2.5 flex flex-col border-[3px] px-3 pt-4 pb-3" style={{ borderColor: ink, color: onPaper }}>
        <div className="flex shrink-0 items-center justify-center gap-1.5">
          <MapPin />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Ubicación</p>
        </div>
        <p
          className={`mt-2 line-clamp-2 shrink-0 text-center text-xl font-semibold leading-tight ${
            nameIsPlaceholder ? "opacity-60" : ""
          }`}
          style={{ fontFamily: "var(--font-sora), sans-serif" }}
        >
          {name}
        </p>
        <p className="mt-2 line-clamp-3 shrink-0 text-center text-sm font-medium leading-snug">{headline}</p>
        <div className="mt-2 flex min-h-0 w-full flex-1 items-center justify-center">
          <QrFrame artwork={artwork} basePercent={84}>
            {children}
          </QrFrame>
        </div>
      </div>
    </article>
  );
}

function QrSticker({
  artwork,
  name,
  headline,
  nameIsPlaceholder,
  children,
}: PieceProps) {
  const ink = artwork.foreground;
  const onPaper = isDarkColor(ink) ? ink : "#14221f";

  return (
    <article className="relative aspect-square w-full">
      <div className="absolute inset-0 rounded-full border border-dashed border-[#8d8474] p-1.5">
        <div
          className="flex h-full flex-col items-center px-[12%] pt-[11%] pb-[10%] text-center"
          style={{
            borderColor: ink,
            backgroundColor: PAPER,
            color: onPaper,
            borderWidth: 7,
            borderStyle: "solid",
            borderRadius: "9999px",
          }}
        >
          <p
            className={`line-clamp-2 shrink-0 text-sm font-semibold leading-tight ${
              nameIsPlaceholder ? "opacity-60" : ""
            }`}
            style={{ fontFamily: "var(--font-sora), sans-serif" }}
          >
            {name}
          </p>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center py-1">
            <QrFrame artwork={artwork} basePercent={88}>
              {children}
            </QrFrame>
          </div>
          <p className="line-clamp-2 shrink-0 text-[11px] font-medium leading-tight">{headline}</p>
        </div>
      </div>
    </article>
  );
}

function QrFrame({
  artwork,
  basePercent,
  children,
}: {
  artwork: ProductArtworkV1;
  basePercent: number;
  children: ReactNode;
}) {
  return (
    <div
      className="relative aspect-square max-h-full max-w-full"
      style={{ width: qrSlotWidth(basePercent, artwork.qrSize) }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: artwork.background }}>
        {children}
      </div>
    </div>
  );
}

function MapPin() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.5a4.2 4.2 0 0 0-4.2 4.2c0 3.2 4.2 8.8 4.2 8.8s4.2-5.6 4.2-8.8A4.2 4.2 0 0 0 8 1.5Zm0 5.7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
      />
    </svg>
  );
}

type PieceProps = {
  artwork: ProductArtworkV1;
  name: string;
  headline: string;
  nameIsPlaceholder: boolean;
  children: ReactNode;
};
