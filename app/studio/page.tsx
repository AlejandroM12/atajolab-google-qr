import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

/** Legacy path — the product editor lives at /crear. */
export default function StudioPage() {
  redirect("/crear");
}
