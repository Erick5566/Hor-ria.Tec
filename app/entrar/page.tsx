import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPage from "@/components/auth-page";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel da sua assistência técnica na Horária.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense>
      <AuthPage mode="login" />
    </Suspense>
  );
}
