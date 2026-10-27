import type { ReactNode } from "react";
import { qrSlotWidth, templateSpec, type ArtworkFontId, type ProductArtworkV2 } from "@/lib/artwork";
import { isDarkColor } from "@/lib/color";

export function StudioPiece({
  artwork,
  children,
}: {
  artwork: ProductArtworkV2;
  children: ReactNode;
}) {
  const spec = templateSpec(artwork.templateId);
  const title = artwork.businessName || "Tu negocio";
  const subtitle = artwork.subtitle || "Una frase para quien escanea";
  const font = studioFontFamily(artwork.fontId);

  return (
    <div className="mx-auto flex w-full max-w-[22rem] flex-col items-center">
      {artwork.templateId === "minimal-elegance" ? (
        <Minimal artwork={artwork} title={title} subtitle={subtitle} font={font}>
          {children}
        </Minimal>
      ) : null}
      {artwork.templateId === "dark-premium" ? (
        <Dark artwork={artwork} title={title} subtitle={subtitle} font={font}>
          {children}
        </Dark>
      ) : null}
      {artwork.templateId === "brand-identity" ? (
        <Brand artwork={artwork} title={title} subtitle={subtitle} font={font}>
          {children}
        </Brand>
      ) : null}
      <p className="mt-3 text-center text-xs text-muted">
        {spec.name} · {spec.widthMm} × {spec.heightMm} mm
      </p>
    </div>
  );
}

function Minimal({
  artwork,
  title,
  subtitle,
  font,
  children,
}: PieceProps) {
  return (
    <article
      className="relative overflow-hidden rounded-[1.7rem] shadow-[0_22px_50px_rgba(28,25,21,0.16)]"
      style={{ ...pieceFrame(90, 140), background: artwork.surface, color: artwork.ink }}
    >
      <div className="absolute inset-[4.5%] rounded-[1.15rem] border" style={{ borderColor: artwork.accent }} />
      <div
        className="absolute inset-[6.2%] rounded-[0.9rem] border opacity-40"
        style={{ borderColor: artwork.accent }}
      />
      <div className="relative flex h-full flex-col items-center px-[14%] pt-[16%] pb-[12%] text-center">
        <Logo artwork={artwork} rounded="full" />
        <p className="text-[10px] font-medium tracking-[0.28em] uppercase" style={{ color: artwork.accent }}>
          {artwork.serviceLine}
        </p>
        <h3 className="mt-3 line-clamp-3 text-[1.65rem] leading-[1.05] font-medium" style={{ fontFamily: font }}>
          {title}
        </h3>
        <span className="mt-3 h-px w-10" style={{ background: artwork.accent }} />
        <p className="mt-3 line-clamp-3 text-sm leading-snug opacity-80">{subtitle}</p>
        <div className="mt-auto w-[68%] pt-4">
          <QrWell artwork={artwork}>{children}</QrWell>
        </div>
      </div>
    </article>
  );
}

function Dark({
  artwork,
  title,
  subtitle,
  font,
  children,
}: PieceProps) {
  return (
    <article
      className="relative overflow-hidden rounded-[1.25rem] shadow-[0_22px_50px_rgba(12,10,8,0.28)]"
      style={{ ...pieceFrame(105, 148), background: artwork.surface, color: artwork.ink }}
    >
      <div className="absolute top-0 left-0 h-full w-1.5" style={{ background: artwork.accent }} />
      <div className="flex h-full flex-col px-6 pt-7 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.24em] uppercase" style={{ color: artwork.accent }}>
              {artwork.serviceLine}
            </p>
            <h3 className="mt-3 line-clamp-3 text-[2rem] leading-[0.95] font-medium" style={{ fontFamily: font }}>
              {title}
            </h3>
          </div>
          <Logo artwork={artwork} rounded="2xl" stacked={false} />
        </div>
        <p className="mt-5 max-w-[15rem] line-clamp-4 text-sm leading-relaxed opacity-75">{subtitle}</p>
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <span className="mb-2 h-14 w-px" style={{ background: artwork.accent }} />
          <div className="w-[48%]">
            <QrWell artwork={artwork}>{children}</QrWell>
          </div>
        </div>
      </div>
    </article>
  );
}

function Brand({
  artwork,
  title,
  subtitle,
  font,
  children,
}: PieceProps) {
  const onAccent = isDarkColor(artwork.accent) ? "#f8f6f1" : "#14221f";

  return (
    <article
      className="flex overflow-hidden rounded-[1.35rem] shadow-[0_22px_50px_rgba(20,34,31,0.16)]"
      style={{ ...pieceFrame(100, 150), background: artwork.surface, color: artwork.ink }}
    >
      <aside
        className="flex w-[36%] flex-col items-center justify-between px-3 py-6 text-center"
        style={{ background: artwork.accent, color: onAccent }}
      >
        <Logo artwork={artwork} rounded="full" onBand />
        <h3 className="line-clamp-5 text-sm leading-tight font-semibold" style={{ fontFamily: font }}>
          {title}
        </h3>
        <p className="text-[9px] tracking-[0.16em] uppercase opacity-80">{artwork.serviceLine}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col px-4 py-6">
        <p className="text-[10px] tracking-[0.18em] uppercase" style={{ color: artwork.accent }}>
          Escaneá
        </p>
        <p className="mt-3 line-clamp-5 text-sm leading-snug">{subtitle}</p>
        <div className="mt-auto pt-4">
          <QrWell artwork={artwork}>{children}</QrWell>
        </div>
      </div>
    </article>
  );
}

function Logo({
  artwork,
  rounded,
  onBand = false,
  stacked = true,
}: {
  artwork: ProductArtworkV2;
  rounded: "full" | "2xl";
  onBand?: boolean;
  stacked?: boolean;
}) {
  const initial = artwork.businessName.trim().charAt(0).toUpperCase() || "A";
  const radius = rounded === "full" ? "999px" : "1rem";

  if (artwork.logo) {
    return (
      <span
        aria-hidden="true"
        className={`${stacked ? "mb-3" : ""} size-12 shrink-0 bg-cover bg-center ${onBand ? "ring-2 ring-white/70" : ""}`}
        style={{
          borderRadius: radius,
          backgroundImage: `url("data:image/png;base64,${artwork.logo.data}")`,
        }}
      />
    );
  }

  if (artwork.templateId === "minimal-elegance") return null;

  return (
    <span
      aria-hidden="true"
      className={`${stacked ? "mb-3" : ""} grid size-12 shrink-0 place-items-center text-lg font-semibold`}
      style={{
        borderRadius: radius,
        border: `1px solid ${onBand ? "transparent" : artwork.accent}`,
        background: onBand ? "rgba(255,255,255,0.16)" : "transparent",
        color: onBand ? "inherit" : artwork.accent,
      }}
    >
      {initial}
    </span>
  );
}

function QrWell({
  artwork,
  children,
}: {
  artwork: ProductArtworkV2;
  children: ReactNode;
}) {
  return (
    <div
      className="mx-auto aspect-square p-1.5"
      style={{ background: artwork.background, width: qrSlotWidth(100, artwork.qrSize) }}
    >
      {children}
    </div>
  );
}

function pieceFrame(widthMm: number, heightMm: number): { aspectRatio: string; width: string } {
  return {
    aspectRatio: `${widthMm} / ${heightMm}`,
    width: `min(100%, calc((100dvh - 16rem) * ${widthMm} / ${heightMm}))`,
  };
}

export function studioFontFamily(fontId: ArtworkFontId): string {
  if (fontId === "fraunces") return "var(--font-fraunces), Georgia, serif";
  if (fontId === "source") return "var(--font-source), sans-serif";
  return "var(--font-sora), sans-serif";
}

type PieceProps = {
  artwork: ProductArtworkV2;
  title: string;
  subtitle: string;
  font: string;
  children: ReactNode;
};
