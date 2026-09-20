"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, syncServerSession } from "@/lib/supabase";

export default function SessionKeeper() {
  const router = useRouter();

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void syncServerSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (
        ["SIGNED_IN", "TOKEN_REFRESHED", "MFA_CHALLENGE_VERIFIED"].includes(
          event,
        ) &&
        session
      ) {
        await syncServerSession(session);
        router.refresh();
      }

      if (event === "SIGNED_OUT") {
        await syncServerSession(null);
        router.replace("/entrar");
      }
    });

    return () => data.subscription.unsubscribe();
  }, [router]);

  return null;
}
