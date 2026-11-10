import Image from "next/image";
import Link from "next/link";

/** Official AtajoLab horizontal logo (copied from atajolab-web public/brand). */
const LOGO_SRC = "/brand/atajolab-logo.svg";
const LOGO_RATIO = 413 / 74;

export function BrandLogo({ height, priority = false }: { height: number; priority?: boolean }) {
  return (
    <Image
      src={LOGO_SRC}
      alt="AtajoLab"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      priority={priority}
      className="block shrink-0"
      style={{ height, width: "auto" }}
    />
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex w-fit items-center gap-2.5 rounded-xl" aria-label="AtajoLab Google QR, inicio">
      <BrandLogo height={26} priority />
      <span aria-hidden="true" className="h-5 w-px bg-line" />
      <span className="font-display text-sm font-semibold leading-none tracking-tight text-accent">Google QR</span>
    </Link>
  );
}
