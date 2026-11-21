import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "AtajoLab QR: códigos QR con diseño listo para usar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Official AtajoLab logo, shared with atajolab.dev.
const logoSrc = `data:image/svg+xml;base64,${await readFile(join(process.cwd(), "public/brand/atajolab-logo.svg"), "base64")}`;

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
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain img */}
          <img src={logoSrc} alt="AtajoLab" width={335} height={60} />
          <div style={{ display: "flex", width: 2, height: 40, background: "#e4dccb" }} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#0f6e62" }}>QR</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>
            Tu código QR, con diseño listo para usar
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#5b544b" }}>
            Enlaces, redes, WhatsApp, Wi-Fi y reseñas de Google.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#5b544b" }}>
          PNG, SVG y PDF
        </div>
      </div>
    ),
    size,
  );
}
