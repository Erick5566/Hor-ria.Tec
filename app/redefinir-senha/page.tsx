import type { Metadata } from "next";
import { ResetPassword } from "@/components/password-recovery";

export const metadata: Metadata = {
  title: "Redefinir senha",
  description: "Defina uma nova senha para sua conta Horária.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ResetPassword />;
}
