"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/button-link";

export function CreateQrNav() {
  const pathname = usePathname();
  const creating = pathname === "/crear" || pathname === "/studio";

  if (creating) {
    return (
      <span
        aria-current="page"
        className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white"
      >
        Crear mi cartel QR
      </span>
    );
  }

  return (
    <ButtonLink href="/crear" className="h-10 px-4">
      Crear mi cartel QR
    </ButtonLink>
  );
}
