import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: new URL(path, origin).href,
    changeFrequency: path === "/" || path === "/crear" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/crear" ? 0.9 : 0.4,
  }));
}
