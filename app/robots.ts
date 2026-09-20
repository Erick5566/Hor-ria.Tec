import type { MetadataRoute } from "next";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://hor-ria-tec.vercel.app");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/painel/",
          "/api/",
          "/redefinir-senha",
          "/recuperar-senha",
          "/conta-bloqueada",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
