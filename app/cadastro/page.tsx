import type { Metadata } from "next";
import { Suspense } from "react";
import AuthPage from "@/components/auth-page";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie o espaço da sua assistência técnica na Horária.",
};

export default function SignupPage() {
  return (
    <Suspense>
      <AuthPage mode="signup" />
    </Suspense>
  );
}
