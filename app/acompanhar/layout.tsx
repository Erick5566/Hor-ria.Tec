import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acompanhar reparo",
  description: "Consulte o andamento do seu atendimento de forma segura.",
  robots: { index: false, follow: false },
};

export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
