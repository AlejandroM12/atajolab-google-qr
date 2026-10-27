import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-xl" aria-label="AtajoLab, inicio">
      <LogoMark />
      <span>
        <span className="block text-sm font-semibold leading-none tracking-tight text-foreground">
          AtajoLab
        </span>
        <span className="mt-1 block text-xs leading-none text-muted">Google QR</span>
      </span>
    </Link>
  );
}

export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0f6e62" />
      <path
        d="M8.5 16h11M15.5 11.5 20.5 16l-5 4.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
