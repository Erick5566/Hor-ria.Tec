import "./globals.css";
import "./workspace.css";
import "./operations.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Horária • Gestão de assistência técnica",
  description: "Ordens de serviço, equipamentos e reparos em um só lugar.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
