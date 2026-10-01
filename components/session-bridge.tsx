"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, syncServerSession } from "@/lib/supabase";
import type { AccessContext } from "@/lib/access";

export default function SessionBridge() {
  const router = useRouter();
  useEffect(() => {
    if (!supabase) return;

    const recoveryFromUrl =
      window.location.hash.includes("type=recovery") ||
      new URLSearchParams(window.location.search).get("type") === "recovery";

    if (recoveryFromUrl) {
      window.location.replace(
        `/redefinir-senha${window.location.search}${window.location.hash}`,
      );
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        window.location.replace(
          `/redefinir-senha${window.location.search}${window.location.hash}`,
        );
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      await syncServerSession(data.session);
      const access = await supabase!.rpc("access_context");
      const context = access.data as AccessContext | null;
      const invited = data.session.user.user_metadata?.team_invite === true;
      router.replace(
        context?.isSuperAdmin
          ? "/admin"
          : invited
            ? "/painel/perfil?primeiro-acesso=1"
            : "/painel",
      );
      router.refresh();
    });

    return () => authListener.subscription.unsubscribe();
  }, [router]);
  return null;
}
