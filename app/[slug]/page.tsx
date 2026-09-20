import type { Metadata } from "next";
import PublicPortal from "@/components/public-portal";
import { getPublicProfile, publicDescription } from "@/lib/public-profile";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://hor-ria-tec.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);

  if (!profile) {
    return {
      title: "Assistência não encontrada",
      description: "Esta página pública não está disponível.",
      robots: { index: false, follow: false },
    };
  }

  const title =
    profile.pagina?.headline?.trim() || profile.slogan?.trim() || profile.nome;
  const description = publicDescription(profile);
  const image = profile.logo || "/opengraph-image";

  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Horária",
      title,
      description,
      url: `/${slug}`,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const structuredData = profile
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: profile.nome,
        description: publicDescription(profile),
        url: `${base}/${slug}`,
        image: profile.logo || undefined,
        telephone: profile.telefone || profile.whatsapp || undefined,
        email: profile.email || undefined,
        address:
          profile.endereco || profile.cidade || profile.estado
            ? {
                "@type": "PostalAddress",
                streetAddress: [profile.endereco, profile.numero]
                  .filter(Boolean)
                  .join(", "),
                addressLocality: profile.cidade || undefined,
                addressRegion: profile.estado || undefined,
                postalCode: profile.cep || undefined,
                addressCountry: "BR",
              }
            : undefined,
        hasMap: profile.google_maps || undefined,
        sameAs: [
          profile.google_business,
          profile.google_avaliacao,
        ].filter(Boolean),
        openingHoursSpecification: profile.horario
          ? Object.entries(profile.horario).map(([day, hours]) => ({
              "@type": "OpeningHoursSpecification",
              dayOfWeek: dayNames[Number(day)],
              opens: hours[0],
              closes: hours[1],
            }))
          : undefined,
      }
    : null;

  return (
    <>
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <PublicPortal slug={slug} />
    </>
  );
}
