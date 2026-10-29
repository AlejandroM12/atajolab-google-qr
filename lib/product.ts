import type { GoogleLinkGoal } from "@/lib/google-link";

export const QR_DEFAULTS = {
  foreground: "#14221f",
  background: "#ffffff",
  size: 256,
} as const;

export const QR_SIZES = [
  { value: 192, label: "Chico" },
  { value: 256, label: "Mediano" },
  { value: 320, label: "Grande" },
] as const;

export type QrSize = (typeof QR_SIZES)[number]["value"];

export const objectives: Array<{
  id: "review" | "location";
  title: string;
  description: string;
}> = [
  {
    id: "review",
    title: "Recibir reseñas en Google",
    description: "Tus clientes escanean el código y pueden dejar una opinión sobre su experiencia.",
  },
  {
    id: "location",
    title: "Compartir mi ubicación",
    description: "Tus clientes escanean el código y encuentran tu negocio en Google Maps.",
  },
];

export const goals: Array<{
  id: GoogleLinkGoal;
  title: string;
  description: string;
}> = [
  {
    id: "ubicacion",
    title: "Ubicación en Google Maps",
    description: "Para que te encuentren, vean el mapa o lleguen hasta el local.",
  },
  {
    id: "resena",
    title: "Enlace para dejar una reseña",
    description: "Abre el formulario para escribir una reseña. No es el enlace de la ubicación.",
  },
];

export const guides: Record<
  GoogleLinkGoal,
  { title: string; steps: string[]; examples: string[]; note: string; profileUrl?: string }
> = {
  ubicacion: {
    title: "Cómo conseguir el enlace de ubicación",
    steps: [
      "Abrí Google Maps en el celular o en la computadora.",
      "Buscá tu comercio o la dirección que querés compartir.",
      "Tocá Compartir y después Copiar enlace.",
      "Pegá ese enlace en el campo de abajo.",
    ],
    examples: ["https://maps.app.goo.gl/…", "https://www.google.com/maps/…"],
    note: "Tiene que apuntar a un lugar concreto. La portada de Google Maps no alcanza.",
  },
  resena: {
    title: "Cómo conseguir el enlace de reseña",
    steps: [
      "Entrá al Perfil de Empresa de Google.",
      "Buscá la opción para solicitar o compartir reseñas. En algunas cuentas se llama Solicitar reseñas, Pedir reseñas u Obtener más reseñas.",
      "Copiá el enlace.",
      "Pegá el enlace en AtajoLab.",
    ],
    examples: [
      "https://g.page/r/…/review",
      "https://search.google.com/local/writereview?placeid=…",
    ],
    note: "Antes de continuar, comprobá que el enlace abra el formulario para dejar una reseña.",
    profileUrl: "https://business.google.com/",
  },
};

