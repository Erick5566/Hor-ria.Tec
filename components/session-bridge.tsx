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
      router.replace("/redefinir-senha");
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/redefinir-senha");
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      await syncServerSession(data.session);
      const access = await supabase!.rpc("access_context");
      const context = access.data as AccessContext | null;
      router.replace(context?.isSuperAdmin ? "/admin" : "/painel");
      router.refresh();
    });

    return () => authListener.subscription.unsubscribe();
  }, [router]);
  return null;
}
