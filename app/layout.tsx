import "./globals.css";
import "./workspace.css";
import "./operations.css";
import type { Metadata } from "next";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://hor-ria-tec.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: "Horária • Gestão de assistência técnica",
    template: "%s | Horária",
  },
  description:
    "Ordens de serviço, equipamentos, agenda, estoque e financeiro em um só lugar.",
  applicationName: "Horária",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Horária",
    title: "Horária • Gestão de assistência técnica",
    description:
      "Organize ordens, clientes, equipamentos, agenda, estoque e financeiro.",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Horária • Gestão de assistência técnica",
    description:
      "Organize ordens, clientes, equipamentos, agenda, estoque e financeiro.",
    images: ["/opengraph-image"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
