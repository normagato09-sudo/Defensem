import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return ["", "/la-causa", "/preguntes", "/noticies", "/uneix-te", "/contacte", "/privacitat"].map((p) => ({ url: base + p }));
}
