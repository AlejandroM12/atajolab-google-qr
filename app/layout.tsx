import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Sans_3, Sora } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AtajoLab Google QR",
    template: "%s · AtajoLab Google QR",
  },
  description:
    "Creá un QR con el enlace de tu ubicación en Google Maps o con el enlace para que tus clientes dejen una reseña. Vista previa escaneable, sin cuenta.",
  applicationName: "AtajoLab Google QR",
};

export const viewport: Viewport = {
  themeColor: "#f3f0e8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${sourceSans.variable} ${sora.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#contenido"
          className="absolute left-4 top-4 z-50 -translate-y-24 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background focus:translate-y-0"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <div id="contenido" className="flex-1">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
