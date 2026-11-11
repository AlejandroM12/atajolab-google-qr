import assert from "node:assert/strict";
import {
  QR_VALUE_MAX,
  buildQrContent,
  decodeQrContent,
  describeQrPayload,
  emptyQrContent,
  inspectQrPayload,
  qrContentTypes,
  readQrContentInput,
  type QrContentInput,
} from "@/lib/qr-content";

function value(input: QrContentInput): string {
  const built = buildQrContent(input);
  assert.ok(built.ok, `${input.type}: ${built.ok ? "" : built.message}`);
  return built.value;
}

function rejected(input: QrContentInput, field: string): string {
  const built = buildQrContent(input);
  assert.equal(built.ok, false, `${input.type} should be rejected`);
  if (built.ok) return "";
  assert.equal(built.field, field);
  assert.ok(built.message.length > 10);
  return built.message;
}

// Every type starts empty and an empty form never builds a code.
for (const type of qrContentTypes) {
  assert.equal(buildQrContent(emptyQrContent(type.id)).ok, false, type.id);
}

// Links: any site, with or without https://.
assert.equal(value({ type: "url", url: "midominio.com.ar/promo" }), "https://midominio.com.ar/promo");
assert.equal(value({ type: "url", url: "  https://example.com/a?b=1#c " }), "https://example.com/a?b=1#c");
assert.equal(value({ type: "url", url: "http://example.com" }), "http://example.com/");
assert.equal(value({ type: "menu", kind: "menu", url: "drive.google.com/file/d/abc/view" }), "https://drive.google.com/file/d/abc/view");
assert.equal(value({ type: "event", url: "https://eventos.example.com/fiesta" }), "https://eventos.example.com/fiesta");
rejected({ type: "url", url: "https://example.com/con espacio" }, "url");
rejected({ type: "url", url: "javascript:alert(1)" }, "url");
rejected({ type: "url", url: "ftp://example.com/archivo" }, "url");
rejected({ type: "url", url: "https://usuario:clave@example.com" }, "url");
rejected({ type: "url", url: "sin-punto" }, "url");
rejected({ type: "url", url: `https://example.com/${"a".repeat(QR_VALUE_MAX)}` }, "url");

// Social networks: a handle or the profile link.
assert.equal(value({ type: "social", network: "instagram", handle: "@cafe.martinez" }), "https://www.instagram.com/cafe.martinez/");
assert.equal(value({ type: "social", network: "tiktok", handle: "cafemartinez" }), "https://www.tiktok.com/@cafemartinez");
assert.equal(value({ type: "social", network: "facebook", handle: "cafe.martinez" }), "https://www.facebook.com/cafe.martinez");
assert.equal(value({ type: "social", network: "youtube", handle: "@cafemartinez" }), "https://www.youtube.com/@cafemartinez");
assert.equal(value({ type: "social", network: "x", handle: "cafemartinez" }), "https://x.com/cafemartinez");
assert.equal(value({ type: "social", network: "linkedin", handle: "ana-perez" }), "https://www.linkedin.com/in/ana-perez/");
assert.equal(
  value({ type: "social", network: "instagram", handle: "instagram.com/cafe.martinez" }),
  "https://instagram.com/cafe.martinez",
);
assert.equal(
  value({ type: "social", network: "tiktok", handle: "https://vm.tiktok.com/ZMabc123/" }),
  "https://vm.tiktok.com/ZMabc123/",
);
assert.equal(value({ type: "social", network: "otra", handle: "https://www.twitch.tv/atajolab" }), "https://www.twitch.tv/atajolab");
rejected({ type: "social", network: "instagram", handle: "cafe martinez" }, "handle");
rejected({ type: "social", network: "instagram", handle: "https://www.tiktok.com/@otro" }, "handle");
rejected({ type: "social", network: "instagram", handle: "https://www.instagram.com/" }, "handle");
rejected({ type: "social", network: "x", handle: "nombre-demasiado-largo-para-x" }, "handle");

// WhatsApp: international number, optional message.
assert.equal(value({ type: "whatsapp", phone: "+54 9 11 2345-6789", message: "" }), "https://wa.me/5491123456789");
assert.equal(
  value({ type: "whatsapp", phone: "0054 9 11 2345 6789", message: "¡Hola! Quiero un turno & precio" }),
  "https://wa.me/5491123456789?text=%C2%A1Hola!%20Quiero%20un%20turno%20%26%20precio",
);
assert.match(rejected({ type: "whatsapp", phone: "011 2345 6789", message: "" }, "phone"), /código de país/);
rejected({ type: "whatsapp", phone: "12345", message: "" }, "phone");
rejected({ type: "whatsapp", phone: "abc", message: "" }, "phone");
rejected({ type: "whatsapp", phone: "5491123456789", message: "a".repeat(201) }, "message");

// Google Maps and Google reviews keep their specific checks.
assert.equal(value({ type: "maps", url: "https://maps.app.goo.gl/AbCdEfGh12345" }), "https://maps.app.goo.gl/AbCdEfGh12345");
assert.equal(value({ type: "review", url: "https://g.page/r/CQpXgZ1aBcDeEAE/review" }), "https://g.page/r/CQpXgZ1aBcDeEAE/review");
assert.equal(value({ type: "review", url: "https://g.co/kgs/AbCd123" }), "https://g.co/kgs/AbCd123");
assert.match(rejected({ type: "review", url: "https://maps.app.goo.gl/AbCdEfGh12345" }, "url"), /reseña/);
rejected({ type: "maps", url: "https://example.com/mapa" }, "url");
rejected({ type: "maps", url: "" }, "url");

// Wi-Fi: standard WIFI: text with escaping.
assert.equal(
  value({ type: "wifi", ssid: "Cafe Centro", password: "cafecito2026", security: "WPA", hidden: false }),
  "WIFI:T:WPA;S:Cafe Centro;P:cafecito2026;;",
);
assert.equal(
  value({ type: "wifi", ssid: 'Mi;Red:"x"', password: "a\\b,c;d:e", security: "WPA", hidden: true }),
  'WIFI:T:WPA;S:Mi\\;Red\\:\\"x\\";P:a\\\\b\\,c\\;d\\:e;H:true;;',
);
assert.equal(value({ type: "wifi", ssid: "Plaza", password: "ignorada", security: "nopass", hidden: false }), "WIFI:T:nopass;S:Plaza;;");
assert.equal(value({ type: "wifi", ssid: "Vieja", password: "abcde", security: "WEP", hidden: false }), "WIFI:T:WEP;S:Vieja;P:abcde;;");
rejected({ type: "wifi", ssid: "  ", password: "cafecito2026", security: "WPA", hidden: false }, "ssid");
rejected({ type: "wifi", ssid: "x".repeat(33), password: "cafecito2026", security: "WPA", hidden: false }, "ssid");
rejected({ type: "wifi", ssid: "Cafe", password: "corta", security: "WPA", hidden: false }, "password");
rejected({ type: "wifi", ssid: "Cafe", password: "", security: "WPA", hidden: false }, "password");
rejected({ type: "wifi", ssid: "Cafe", password: "1234", security: "WEP", hidden: false }, "password");

// vCard 3.0.
const card = value({
  type: "vcard",
  name: "María Fernanda González",
  phone: "+54 9 11 2345 6789",
  email: "maria@estudio.com.ar",
  org: "Estudio González; Asoc.",
  url: "estudiogonzalez.com.ar",
});
assert.equal(
  card,
  [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:González;María Fernanda;;;",
    "FN:María Fernanda González",
    "ORG:Estudio González\\; Asoc.",
    "TEL;TYPE=CELL:+5491123456789",
    "EMAIL:maria@estudio.com.ar",
    "URL:https://estudiogonzalez.com.ar/",
    "END:VCARD",
  ].join("\n"),
);
assert.match(value({ type: "vcard", name: "Cher", phone: "11 2345 6789", email: "", org: "", url: "" }), /\nN:;Cher;;;\n/);
rejected({ type: "vcard", name: "", phone: "1123456789", email: "", org: "", url: "" }, "name");
rejected({ type: "vcard", name: "Ana", phone: "", email: "", org: "", url: "" }, "phone");
rejected({ type: "vcard", name: "Ana", phone: "", email: "no-es-correo", org: "", url: "" }, "email");
rejected({ type: "vcard", name: "Ana", phone: "12", email: "", org: "", url: "" }, "phone");
// A line break cannot smuggle extra vCard fields.
assert.equal(
  value({ type: "vcard", name: "Ana\nTEL:999", phone: "1123456789", email: "", org: "", url: "" }).split("\n").length,
  6,
);

// Free text.
assert.equal(value({ type: "text", text: "  Cupón: VUELVO10\r\nVálido en mayo  " }), "Cupón: VUELVO10\nVálido en mayo");
rejected({ type: "text", text: "   " }, "text");
rejected({ type: "text", text: "a".repeat(301) }, "text");
rejected({ type: "text", text: "javascript:alert(1)" }, "text");

// Inspecting whatever a QR element holds.
assert.deepEqual(inspectQrPayload("https://example.com"), { kind: "url", issue: null, hint: null });
assert.equal(inspectQrPayload("WIFI:T:WPA;S:Cafe;P:cafecito2026;;").issue, null);
assert.equal(inspectQrPayload("WIFI:T:WPA;P:cafecito2026;;").kind, "wifi");
assert.ok(inspectQrPayload("WIFI:T:WPA;P:cafecito2026;;").issue);
assert.equal(inspectQrPayload(card).issue, null);
assert.ok(inspectQrPayload("BEGIN:VCARD\nVERSION:3.0\nFN:Ana").issue);
assert.ok(inspectQrPayload("https://exa mple.com").issue);
assert.ok(inspectQrPayload("https://u:p@example.com").issue);
assert.ok(inspectQrPayload("data:text/html,hola").issue);
assert.deepEqual(inspectQrPayload("Hola, gracias por venir"), { kind: "text", issue: null, hint: null });
assert.ok(inspectQrPayload("midominio.com/carta").hint);
assert.equal(inspectQrPayload("midominio.com/carta").issue, null);

// Everything a builder produces passes inspection and fits a QR element.
const samples: QrContentInput[] = [
  { type: "url", url: "example.com" },
  { type: "social", network: "instagram", handle: "atajolab" },
  { type: "whatsapp", phone: "5491123456789", message: "Hola" },
  { type: "maps", url: "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z" },
  { type: "review", url: "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrst" },
  { type: "menu", kind: "catalogo", url: "example.com/catalogo.pdf" },
  { type: "event", url: "example.com/evento" },
  { type: "wifi", ssid: "Red", password: "12345678", security: "WPA", hidden: false },
  { type: "vcard", name: "Ana Perez", phone: "1123456789", email: "", org: "", url: "" },
  { type: "text", text: "Hola" },
];
assert.deepEqual(samples.map((sample) => sample.type).sort(), qrContentTypes.map((type) => type.id).sort());
for (const sample of samples) {
  const built = value(sample);
  assert.equal(inspectQrPayload(built).issue, null, sample.type);
  assert.ok(built.length <= QR_VALUE_MAX, sample.type);
  assert.equal(built, built.trim(), `${sample.type}: the editor trims the value`);
  // JSON from a client reads back to the same input.
  assert.deepEqual(readQrContentInput(JSON.parse(JSON.stringify(sample))), sample);
}

// Reading a value back for the editor form.
assert.deepEqual(decodeQrContent('WIFI:T:WPA;S:Mi\\;Red\\:\\"x\\";P:a\\\\b\\,c\\;d\\:e;H:true;;'), {
  type: "wifi",
  ssid: 'Mi;Red:"x"',
  password: "a\\b,c;d:e",
  security: "WPA",
  hidden: true,
});
assert.deepEqual(decodeQrContent("WIFI:T:nopass;S:Plaza;;"), {
  type: "wifi",
  ssid: "Plaza",
  password: "",
  security: "nopass",
  hidden: false,
});
assert.deepEqual(decodeQrContent(card), {
  type: "vcard",
  name: "María Fernanda González",
  phone: "+5491123456789",
  email: "maria@estudio.com.ar",
  org: "Estudio González; Asoc.",
  url: "https://estudiogonzalez.com.ar/",
});
assert.deepEqual(decodeQrContent("https://wa.me/5491123456789?text=Hola%20%26%20chau"), {
  type: "whatsapp",
  phone: "5491123456789",
  message: "Hola & chau",
});
assert.deepEqual(decodeQrContent("https://example.com/x"), { type: "url", url: "https://example.com/x" });
assert.deepEqual(decodeQrContent("Hola"), { type: "text", text: "Hola" });
// Decoding and building again gives the same code.
for (const sample of samples) {
  const built = value(sample);
  assert.equal(value(decodeQrContent(built)), built, sample.type);
}

assert.equal(describeQrPayload("WIFI:T:WPA;S:Cafe Centro;P:cafecito2026;;"), "Wi-Fi · Cafe Centro");
assert.equal(describeQrPayload(card), "Contacto · María Fernanda González");
assert.equal(describeQrPayload("https://wa.me/5491123456789"), "WhatsApp · +5491123456789");
assert.equal(describeQrPayload("https://www.instagram.com/atajolab/"), "Instagram · @atajolab");
assert.equal(describeQrPayload("https://g.page/r/CQpXgZ1aBcDeEAE/review"), "Reseñas de Google");
assert.equal(describeQrPayload("https://maps.app.goo.gl/AbCdEfGh12345"), "Google Maps");
assert.equal(describeQrPayload("https://www.example.com/a"), "Enlace · example.com");
assert.equal(describeQrPayload("Hola"), "Texto");
assert.equal(describeQrPayload(""), "Sin contenido");

// Untrusted JSON.
assert.equal(readQrContentInput(null), null);
assert.equal(readQrContentInput({ type: "wifi", ssid: "a" }), null);
assert.equal(readQrContentInput({ type: "social", network: "myspace", handle: "x" }), null);
assert.equal(readQrContentInput({ type: "url", url: 5 }), null);
assert.equal(readQrContentInput({ type: "text", text: "a".repeat(5000) }), null);
assert.equal(readQrContentInput({ type: "desconocido" }), null);

console.log("qr content checks passed");
