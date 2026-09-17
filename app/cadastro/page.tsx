import { Suspense } from "react";
import AuthPage from "@/components/auth-page";
export default function SignupPage() {
  return (
    <Suspense>
      <AuthPage mode="signup" />
    </Suspense>
  );
}
