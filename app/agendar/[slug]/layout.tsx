import type { Metadata } from "next";
import { getPublicProfile, publicDescription } from "@/lib/public-profile";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);

  if (!profile) {
    return {
      title: "Agendamento",
      description: "Agendamento online pela Horária.",
      robots: { index: false, follow: false },
    };
  }

  const title = `Agendar com ${profile.nome}`;
  const description = `Escolha um serviço e horário para atendimento com ${profile.nome}. ${publicDescription(profile)}`.slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: `/agendar/${slug}` },
    openGraph: {
      title,
      description,
      images: [profile.logo || "/opengraph-image"],
    },
  };
}

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
