import type { Metadata } from "next";
import { RequestPasswordReset } from "@/components/password-recovery";

export const metadata: Metadata = {
  title: "Recuperar senha",
  description: "Solicite um link seguro para recuperar o acesso à Horária.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <RequestPasswordReset />;
}
