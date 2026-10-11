"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AccessContext } from "@/lib/access";
import { supabase, syncServerSession } from "@/lib/supabase";

export default function BlockedAccessSync() {
  const router = useRouter();

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let active = true;
    let checking = false;
    let navigating = false;

    const checkAccess = async () => {
      if (
        !active ||
        checking ||
        navigating ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;

      checking = true;
      try {
        const sessionResult = await client.auth.getSession();
        if (!active || sessionResult.error || !sessionResult.data.session)
          return;

        // The RPC checks authenticated access; a local session alone grants nothing.
        const result = await client.rpc("access_context");
        if (!active || result.error || !result.data) return;
        const context = result.data as AccessContext;
        if (!context.authenticated) return;

        const company = context.company;
        const destination = context.isSuperAdmin
          ? "/admin"
          : company &&
              !context.globalMaintenance &&
              !company.maintenance &&
              ["TRIAL", "ACTIVE", "PAST_DUE"].includes(company.status)
            ? "/painel"
            : null;
        if (!destination) return;

        await syncServerSession(sessionResult.data.session);
        if (!active) return;
        navigating = true;
        router.replace(destination);
        router.refresh();
      } catch {
        // Network failures keep the blocked screen and retry on the next check.
      } finally {
        checking = false;
      }
    };

    const onResume = () => {
      void checkAccess();
    };
    onResume();
    const timer = window.setInterval(onResume, 15000);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    document.addEventListener("visibilitychange", onResume);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [router]);

  return null;
}
