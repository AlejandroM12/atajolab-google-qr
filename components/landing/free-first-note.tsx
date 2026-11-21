import { connection } from "next/server";
import { Suspense } from "react";
import { freeFirstQrOpen } from "@/lib/free-first-qr";
import { nextQrNote } from "@/lib/commercial-copy";
import { studioSalesOpen } from "@/lib/studio/checkout-access";

/** "Tu primer QR es gratis" note. Read per request so the server switch applies without a rebuild. */
export function FreeFirstNote({ variant }: { variant: "hero" | "price" }) {
  return (
    <Suspense fallback={null}>
      <FreeFirstNoteContent variant={variant} />
    </Suspense>
  );
}

async function FreeFirstNoteContent({ variant }: { variant: "hero" | "price" }) {
  await connection();
  if (!freeFirstQrOpen()) return null;
  if (variant === "hero") {
    return (
      <p className="mt-6 inline-flex w-fit items-center rounded-full border border-accent/30 bg-ok-bg px-4 py-2 text-sm font-semibold text-accent-strong">
        Tu primer QR es gratis
      </p>
    );
  }
  return (
    <p className="mb-4 text-sm leading-relaxed text-foreground/80">
      <span className="font-semibold text-accent-strong">Tu primer QR es gratis.</span> Uno por navegador y por
      correo. {nextQrNote(studioSalesOpen())}
    </p>
  );
}
