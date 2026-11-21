import assert from "node:assert/strict";
import { exportStudioDesign } from "@/lib/studio/export/index";
import { formatList } from "@/lib/studio/formats";
import { styleList } from "@/lib/studio/proposal-options";
import type { QrContentInput } from "@/lib/qr-content";
import { buildProposals } from "@/lib/studio/proposals";

// Every design the guided flow proposes for a business like "Electromecánica Morel" can be
// exported in all three formats. A download that cannot be rendered would leave a paid or free
// order without files, so the renderer is checked against what the flow really produces.
const contents: { label: string; input: QrContentInput; name: string }[] = [
  {
    label: "reseñas",
    input: { type: "review", url: "https://search.google.com/local/writereview?placeid=EJEMPLO_NO_REAL_0000" },
    name: "Electromecánica Morel",
  },
  {
    label: "whatsapp",
    input: { type: "whatsapp", phone: "54 9 11 0000 0000", message: "Hola, quiero pedir un presupuesto" },
    name: "Electromecánica Morel",
  },
  {
    label: "contacto",
    input: {
      type: "vcard",
      name: "Martín Morel",
      phone: "+54 9 11 0000 0000",
      email: "contacto@electromecanicamorel.example",
      org: "Electromecánica Morel",
      url: "",
    },
    name: "",
  },
];

let exported = 0;
for (const content of contents) {
  for (const format of formatList) {
    for (const style of styleList) {
      const result = buildProposals({ content: content.input, name: content.name, styleId: style.id, formatId: format.id });
      if (!result.ok) continue;
      const first = result.proposals[0];
      assert.ok(first, `${content.label} ${format.id} ${style.id} has a proposal`);
      for (const kind of ["png", "svg", "pdf"] as const) {
        const file = await exportStudioDesign(first.document, kind);
        assert.equal(file.ok, true, `${content.label} ${format.id} ${style.id} ${kind}`);
        if (file.ok) assert.ok(file.body.length > 1000, `${content.label} ${format.id} ${style.id} ${kind} is not empty`);
        exported += 1;
      }
    }
  }
}
assert.ok(exported >= 200, `exported ${exported} files`);

console.log("proposal export tests ok");
