"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AccessContext } from "@/lib/access";
import { supabase } from "@/lib/supabase";
import { Brand } from "@/components/brand";
import SignOutButton from "@/components/sign-out-button";
import SubscriptionPaymentPanel from "@/components/subscription-payment-panel";

const operational = new Set(["TRIAL", "ACTIVE", "PAST_DUE"]);

export default function BlockedSubscription({
  initialAccess,
}: {
  initialAccess: AccessContext;
}) {
  const router = useRouter();
  const [access, setAccess] = useState(initialAccess);
  const [confirmed, setConfirmed] = useState(false);

  const checkAccess = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.rpc("access_context");
    if (result.error || !result.data) return;

    const next = result.data as AccessContext;
    setAccess(next);

    if (next.company?.status && operational.has(next.company.status)) {
      setConfirmed(true);
      window.setTimeout(() => {
        router.replace("/painel");
        router.refresh();
      }, 900);
    }
  }, [router]);

  useEffect(() => {
    if (!supabase || !access.company?.id) return;

    const companyId = access.company.id;
    const channel = supabase
      .channel("blocked-subscription-" + companyId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "empresas",
          filter: "id=eq." + companyId,
        },
        () => void checkAccess(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "assinaturas",
          filter: "empresa_id=eq." + companyId,
        },
        () => void checkAccess(),
      )
      .subscribe();

    const timer = window.setInterval(() => void checkAccess(), 5000);
    const visibility = () => {
      if (document.visibilityState === "visible") void checkAccess();
    };
    document.addEventListener("visibilitychange", visibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      void supabase!.removeChannel(channel);
    };
  }, [access.company?.id, checkAccess]);

  return (
    <main className="state-page billing-blocked-page">
      <Brand />
      <section className="blocked-billing-shell">
        <div className="state-card blocked-billing-message">
          <span className="state-icon">{confirmed ? "✓" : "!"}</span>
          <span className="eyebrow">
            {confirmed
              ? "PAGAMENTO CONFIRMADO"
              : "ASSINATURA TEMPORARIAMENTE BLOQUEADA"}
          </span>
          <h1>
            {confirmed
              ? "Acesso liberado."
              : "Regularize a assinatura para continuar."}
          </h1>
          <p>
            {confirmed
              ? "A Horária recebeu a atualização e está abrindo seu painel automaticamente."
              : "Seus clientes, ordens, fotos, histórico e configurações continuam armazenados com segurança. Esta página verifica o pagamento sozinha, sem precisar atualizar com F5."}
          </p>
          {!confirmed && <SignOutButton />}
        </div>

        {!confirmed && (
          <SubscriptionPaymentPanel
            subscription={access.subscription}
            billing={access.billing}
            blocked
          />
        )}
      </section>
    </main>
  );
}
