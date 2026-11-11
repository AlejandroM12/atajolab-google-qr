"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/button-link";

export function CreateQrNav() {
  const pathname = usePathname();
  const creating = pathname === "/empezar" || pathname === "/crear" || pathname === "/studio";

  if (creating) {
    return (
      <span
        aria-current="page"
        className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white"
      >
        Crear mi QR
      </span>
    );
  }

  return (
    <ButtonLink href="/empezar" className="h-10 px-4">
      Crear mi QR
    </ButtonLink>
  );
}
