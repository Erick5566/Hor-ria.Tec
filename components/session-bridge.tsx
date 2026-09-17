"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, syncServerSession } from "@/lib/supabase";
import type { AccessContext } from "@/lib/access";

export default function SessionBridge() {
  const router = useRouter();
  useEffect(() => {
    supabase?.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      await syncServerSession(data.session);
      const access = await supabase!.rpc("access_context");
      const context = access.data as AccessContext | null;
      router.replace(context?.isSuperAdmin ? "/admin" : "/painel");
      router.refresh();
    });
  }, [router]);
  return null;
}
