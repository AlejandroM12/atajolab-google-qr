import { Suspense } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { CreateQrNav } from "@/components/create-qr-nav";
import { Logo } from "@/components/logo";

const links = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#formatos", label: "Formatos" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-background/90 backdrop-blur-md">
      <Container className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-1 sm:justify-end">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-semibold text-foreground/80 hover:bg-card hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Suspense
            fallback={
              <ButtonLink href="/empezar" className="h-10 px-4">
                Crear mi QR
              </ButtonLink>
            }
          >
            <CreateQrNav />
          </Suspense>
        </nav>
      </Container>
    </header>
  );
}
