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
    title: "Reseña en Google",
    description: "El QR abre Google para que dejen una opinión sobre el negocio.",
  },
  {
    id: "location",
    title: "Ubicación en Google Maps",
    description: "El QR abre el mapa para llegar al local.",
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
  { title: string; steps: string[]; examples: string[]; note: string }
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
      "Entrá al Perfil de Empresa de Google con la cuenta que administra la ficha.",
      "Buscá la opción Pedir reseñas u Obtener más reseñas.",
      "Copiá el enlace que Google genera para escribir una reseña.",
      "Pegalo abajo. No uses el enlace de Compartir del mapa.",
    ],
    examples: [
      "https://g.page/r/…/review",
      "https://search.google.com/local/writereview?placeid=…",
    ],
    note: "Un enlace de ubicación abre el mapa. No abre el formulario para escribir la reseña.",
  },
};

export const upcoming = [
  {
    title: "Cobros reales",
    detail: "Checkout Pro queda en modo de prueba. Los cobros de producción siguen deshabilitados.",
  },
  {
    title: "Gestión de pedidos",
    detail: "Seguimiento de compras digitales y de kits físicos.",
  },
] as const;

export const availableNow = [
  "Editor de la pieza completa, sin cuenta.",
  "Carteles A6 y stickers cuadrados para pedir reseñas en Google.",
  "Tres plantillas: Review Clean, Review Dark y Review Brand.",
  "Nombre del negocio, logo opcional y colores con contraste.",
  "También puede armar un QR de ubicación, como uso secundario.",
  "Vista previa de la misma pieza que se descarga en PNG, SVG y PDF.",
  "Control del enlace antes de armar el QR.",
  "Pedido pendiente, con el precio definido en el servidor.",
  "Pago de prueba con Mercado Pago, cuando hay credenciales de sandbox.",
  "Descarga de PNG, SVG y PDF cuando el pedido está pagado.",
  "Enlace privado para recuperar las descargas desde otro dispositivo.",
] as const;
