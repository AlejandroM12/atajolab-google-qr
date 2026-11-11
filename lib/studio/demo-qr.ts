/**
 * Sample QR contents used by the example designs. They only exist so the
 * examples show a real code; a design cannot be ordered while it still has one.
 */
export const DEMO_QR = {
  instagram: "https://www.instagram.com/tu.negocio/",
  whatsapp: "https://wa.me/5491100000000?text=Hola",
  menu: "https://tu-negocio.example/carta",
  evento: "https://tu-negocio.example/evento",
  wifi: "WIFI:T:WPA;S:Tu red;P:tu-clave;;",
  resenas: "https://search.google.com/local/writereview?placeid=ChIJInspirationDemo",
} as const;

const DEMO_VALUES = new Set<string>(Object.values(DEMO_QR));

export function isDemoQr(value: string): boolean {
  return DEMO_VALUES.has(value.trim());
}
