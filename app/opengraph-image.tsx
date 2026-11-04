import { ImageResponse } from "next/og";
import { PIECE_PRICE_ARS, formatArs } from "@/lib/pricing";

export const alt = "AtajoLab: carteles QR para reseñas de Google";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Static share card, generated at build time. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "#f3f0e8",
          color: "#1d1a16",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#1f5f4a" }}>AtajoLab</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>
            Tu cartel QR para reseñas de Google
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#5b544b" }}>
            Diseñalo en minutos y descargalo listo para imprimir.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#5b544b" }}>
          {`A6 · PNG, SVG y PDF · ${formatArs(PIECE_PRICE_ARS)}`}
        </div>
      </div>
    ),
    size,
  );
}
