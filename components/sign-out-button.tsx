"use client";
import { useRouter } from "next/navigation";
import { supabase, syncServerSession } from "@/lib/supabase";
export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="outline"
      onClick={async () => {
        await supabase?.auth.signOut();
        await syncServerSession(null);
        router.replace("/entrar");
        router.refresh();
      }}
    >
      Sair da conta
    </button>
  );
}
