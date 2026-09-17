"use client";
import { Heading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
export default function SubscriptionPage() {
  const { access } = useWorkspace();
  const subscription = access.subscription;
  return (
    <section className="module">
      <Heading
        title="Assinatura da Horária"
        subtitle="Situação de acesso e ciclo da sua empresa."
      />
      <section className="panel">
        <dl className="definition-grid">
          <div>
            <dt>Status</dt>
            <dd>{subscription?.status || "Não disponível"}</dd>
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
                ? new Date(subscription.nextBillingDate).toLocaleDateString(
                    "pt-BR",
                  )
                : "A definir"}
            </dd>
          </div>
        </dl>
        {subscription?.status === "PAST_DUE" && (
          <div className="notice">
            <strong>Regularização segura</strong>
            <p>
              A cobrança online será disponibilizada quando o gateway estiver
              conectado e validando confirmações por webhook. Até lá, entre em
              contato com a administração da Horária. Nenhum dado será removido.
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
