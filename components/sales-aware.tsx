import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { purchasesAvailable } from "@/lib/payments/availability";

/**
 * Renders its children with the real purchase state (switch on and Mercado Pago ready), read on each request so the server
 * switch applies without a rebuild. The fallback (prerendered shell) must be the
 * "sales closed" version: it never offers a purchase or shows a price.
 */
export function SalesAware({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: (salesOpen: boolean) => ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <SalesAwareContent>{children}</SalesAwareContent>
    </Suspense>
  );
}

async function SalesAwareContent({ children }: { children: (salesOpen: boolean) => ReactNode }) {
  await connection();
  return <>{children(await purchasesAvailable())}</>;
}
