"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase, syncServerSession } from "@/lib/supabase";

export default function SessionKeeper() {
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let active = true;

    const syncCurrentSession = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (active && data.session) {
          await syncServerSession(data.session);
        }
      } catch {
        // Uma falha momentânea de rede não deve derrubar a interface.
      }
    };

    void syncCurrentSession();

    const { data } = client.auth.onAuthStateChange((event, session) => {
      void (async () => {
        try {
          if (
            ["SIGNED_IN", "TOKEN_REFRESHED", "MFA_CHALLENGE_VERIFIED"].includes(
              event,
            ) &&
            session
          ) {
            await syncServerSession(session);
            if (active) router.refresh();
            return;
          }

          if (event === "SIGNED_OUT") {
            await syncServerSession(null).catch(() => undefined);
            const protectedRoute =
              path.startsWith("/painel") ||
              path.startsWith("/admin") ||
              path.startsWith("/seguranca");

            if (active && protectedRoute) {
              router.replace("/entrar");
              router.refresh();
            }
          }
        } catch {
          // Mantém a sessão do navegador ativa e tenta novamente no próximo evento.
        }
      })();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [path, router]);

  return null;
}
