import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://hor-ria-tec.vercel.app");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/entrar`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${base}/cadastro`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/privacidade`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fixed;

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const result = await client.rpc("public_sitemap_entries");
  if (result.error || !Array.isArray(result.data)) return fixed;

  const tenants: MetadataRoute.Sitemap = result.data.map(
    (item: { slug: string; atualizado_em?: string | null }) => ({
      url: `${base}/${item.slug}`,
      lastModified: item.atualizado_em ? new Date(item.atualizado_em) : now,
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  );

  return [...fixed, ...tenants];
}
