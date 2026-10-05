"use client";

import { useEffect, useRef, useState } from "react";
import { Heading } from "@/components/ui";
import SubscriptionPaymentPanel from "@/components/subscription-payment-panel";
import { useWorkspace } from "@/components/workspace";

const statusLabel: Record<string, string> = {
  TRIAL: "Período inicial",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
};

export default function SubscriptionPage() {
  const { access } = useWorkspace();
  const subscription = access.subscription;
  const previousStatus = useRef(subscription?.status);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  useEffect(() => {
    const previous = previousStatus.current;
    if (
      previous &&
      previous !== "ACTIVE" &&
      subscription?.status === "ACTIVE"
    ) {
      setPaymentConfirmed(true);
    }
    previousStatus.current = subscription?.status;
  }, [subscription?.status]);

  return (
    <section className="module unified-pro subscription-pro">
      <Heading
        title="Assinatura da Horária"
        subtitle="Situação de acesso, ciclo da empresa e pagamento em tempo real."
      />

      {paymentConfirmed && (
        <div className="notice subscription-payment-confirmed" role="status">
          <strong>Pagamento confirmado ✓</strong>
          <span>
            Sua assinatura está ativa e o sistema foi atualizado
            automaticamente.
          </span>
        </div>
      )}

      <section className="panel subscription-card">
        <dl className="definition-grid">
          <div>
            <dt>Status</dt>
            <dd>
              {subscription?.status
                ? statusLabel[subscription.status] || subscription.status
                : "Não disponível"}
            </dd>
          </div>
          <div>
            <dt>Período inicial</dt>
            <dd>
              {subscription?.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString("pt-BR")
                : "Concluído"}
            </dd>
          </div>
          <div>
            <dt>Próxima cobrança</dt>
            <dd>
              {subscription?.nextBillingDate
                ? new Date(subscription.nextBillingDate).toLocaleString(
                    "pt-BR",
                    { dateStyle: "short", timeStyle: "short" },
                  )
                : "A definir"}
            </dd>
          </div>
        </dl>
      </section>

      <SubscriptionPaymentPanel
        subscription={subscription}
        billing={access.billing}
      />

      {subscription?.status === "PAST_DUE" && (
        <section className="panel subscription-overdue-card">
          <div className="notice">
            <strong>Mensalidade pendente</strong>
            <p>
              O painel continua disponível durante a tolerância de{" "}
              {access.billing?.graceHours || 24} horas. Se a confirmação não
              chegar até o fim do contador, o acesso é bloqueado
              automaticamente.
            </p>
          </div>
        </section>
      )}
    </section>
  );
}
