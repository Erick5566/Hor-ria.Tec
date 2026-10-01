"use client";
import { useRouter } from "next/navigation";
import { supabase, syncServerSession } from "@/lib/supabase";
export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="admin-signout"
      onClick={async () => {
        try {
          await supabase?.auth.signOut({ scope: "local" });
        } finally {
          await syncServerSession(null).catch(() => undefined);
          router.replace("/entrar");
          router.refresh();
        }
      }}
    >
      Sair da conta
    </button>
  );
}
