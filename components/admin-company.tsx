"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, Heading } from "./ui";

type CompanyDetail = {
  id: string;
  name: string;
  slug: string;
  responsible: string;
  email: string;
  phone?: string;
  createdAt: string;
  status: string;
  maintenance: boolean;
  maintenanceMessage?: string;
  scheduledDeletionAt?: string;
  featureFlags: Record<string, boolean>;
  subscription: {
    plan: string;
    status: string;
    startedAt: string;
    trialEndsAt?: string;
    nextBillingDate?: string;
    cancelledAt?: string;
    externalId?: string;
  };
  usersCount: number;
  customersCount: number;
  ordersCount: number;
  members: Array<{
    userId: string;
    role: string;
    status: string;
    lastAccessAt?: string;
    name?: string;
    email?: string;
  }>;
};
const featureNames: Record<string, string> = {
  aiEnabled: "Inteligência artificial",
  financialEnabled: "Financeiro",
  stockEnabled: "Estoque",
  whatsappEnabled: "WhatsApp",
  appointmentsEnabled: "Agenda",
};

export default function AdminCompany({ company }: { company: CompanyDetail }) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [features, setFeatures] = useState(company.featureFlags);
  async function action(code: string, label: string) {
    if (
      !window.confirm(
        `${label} “${company.name}”? Os dados não serão apagados.`,
      )
    )
      return;
    const reason = window.prompt("Motivo ou observação (opcional):", "");
    if (reason === null) return;
    setBusy(true);
    setError("");
    const result = await supabase!.rpc("admin_update_company_state", {
      p_empresa: company.id,
      p_action: code,
      p_reason: reason,
    });
    setBusy(false);
    if (result.error) setError(message(result.error));
    else {
      setNotice("Ação concluída e registrada na auditoria.");
      router.refresh();
    }
  }
  async function saveFeatures() {
    if (!window.confirm("Aplicar estes recursos para a empresa?")) return;
    setBusy(true);
    setError("");
    const result = await supabase!.rpc("admin_update_company_features", {
      p_empresa: company.id,
      p_features: features,
      p_reason: "Configuração de recursos",
    });
    setBusy(false);
    if (result.error) setError(message(result.error));
    else {
      setNotice("Recursos atualizados.");
      router.refresh();
    }
  }
  return (
    <section className="module admin-module">
      <Link href="/admin" className="subtle">
        ← Empresas
      </Link>
      <Heading
        title={company.name}
        subtitle={`/${company.slug} · ${company.id}`}
      />
      <ErrorBox error={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="metrics admin-metrics">
        <article>
          <span>Clientes</span>
          <h2>{company.customersCount}</h2>
        </article>
        <article>
          <span>Ordens de serviço</span>
          <h2>{company.ordersCount}</h2>
        </article>
        <article>
          <span>Usuários</span>
          <h2>{company.usersCount}</h2>
        </article>
        <article>
          <span>Status</span>
          <h2 className="compact-status">{company.status}</h2>
          <small>{company.maintenance ? "Em manutenção" : "Operacional"}</small>
        </article>
      </div>
      <div className="admin-detail-grid">
        <section className="panel">
          <h2>Empresa e responsável</h2>
          <dl className="definition-grid">
            <div>
              <dt>Responsável</dt>
              <dd>{company.responsible || "Não informado"}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{company.email}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{company.phone || "Não informado"}</dd>
            </div>
            <div>
              <dt>Cadastro</dt>
              <dd>{new Date(company.createdAt).toLocaleString("pt-BR")}</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h2>Assinatura</h2>
          <dl className="definition-grid">
            <div>
              <dt>Plano</dt>
              <dd>{company.subscription?.plan || "Horária"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{company.subscription?.status}</dd>
            </div>
            <div>
              <dt>Fim do período inicial</dt>
              <dd>
                {company.subscription?.trialEndsAt
                  ? new Date(
                      company.subscription.trialEndsAt,
                    ).toLocaleDateString("pt-BR")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Próxima cobrança</dt>
              <dd>
                {company.subscription?.nextBillingDate
                  ? new Date(
                      company.subscription.nextBillingDate,
                    ).toLocaleDateString("pt-BR")
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="panel">
        <h2>Ações administrativas</h2>
        <p>Suspender ou cancelar mantém todos os dados da assistência.</p>
        <div className="admin-actions">
          {company.status === "SUSPENDED" || company.status === "CANCELED" ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => action("REACTIVATE", "Reativar")}
            >
              Reativar empresa
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => action("SUSPEND", "Suspender")}
            >
              Suspender empresa
            </button>
          )}
          {company.status !== "CANCELED" && (
            <button
              className="danger"
              disabled={busy}
              onClick={() => action("CANCEL", "Cancelar assinatura de")}
            >
              Cancelar assinatura
            </button>
          )}
          {company.maintenance ? (
            <button
              disabled={busy}
              onClick={() =>
                action("DISABLE_MAINTENANCE", "Desativar manutenção de")
              }
            >
              Desativar manutenção
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() =>
                action("ENABLE_MAINTENANCE", "Ativar manutenção de")
              }
            >
              Ativar manutenção
            </button>
          )}
        </div>
        {company.scheduledDeletionAt && (
          <p className="notice">
            Retenção programada até{" "}
            {new Date(company.scheduledDeletionAt).toLocaleDateString("pt-BR")}.
            Nenhuma exclusão automática está ativa.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Recursos da empresa</h2>
        <div className="feature-grid">
          {Object.entries(featureNames).map(([key, label]) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={Boolean(features[key])}
                onChange={(event) =>
                  setFeatures({ ...features, [key]: event.target.checked })
                }
              />{" "}
              {label}
            </label>
          ))}
        </div>
        <button className="primary" disabled={busy} onClick={saveFeatures}>
          Salvar recursos
        </button>
      </section>
      <section className="panel">
        <h2>Usuários vinculados</h2>
        {company.members.map((member) => (
          <div className="list-line" key={member.userId}>
            <div>
              <strong>{member.name || member.email || member.userId}</strong>
              <small>{member.email}</small>
            </div>
            <span>
              {member.role} · {member.status}
            </span>
          </div>
        ))}
      </section>
    </section>
  );
}
