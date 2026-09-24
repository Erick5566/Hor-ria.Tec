"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, Heading } from "./ui";

export type AdminCompanyRow = {
  id: string;
  name: string;
  slug: string;
  responsible: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  plan?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  nextBillingDate?: string | null;
  monthlyValue?: number | null;
  currency?: string | null;
  lastAccessAt?: string | null;
  usersCount: number;
  customersCount: number;
  ordersCount: number;
  storageBytes: number;
  status: string;
  maintenance: boolean;
  scheduledDeletionAt?: string | null;
};

export type PlatformOverview = {
  globalMaintenance: boolean;
  maintenanceMessage?: string | null;
  registrationEnabled: boolean;
  maxCompanies: number;
  currentCompanies: number;
  publicAppUrl?: string | null;
  featureFlags: Record<string, boolean>;
};

type AdminCompanyDetail = {
  id: string;
  name: string;
  slug: string;
  responsible: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  status: string;
  lastAccessAt?: string | null;
  note?: string | null;
  subscription?: {
    id?: string | null;
    plan?: string | null;
    status?: string | null;
    startedAt?: string | null;
    trialEndsAt?: string | null;
    nextBillingDate?: string | null;
    cancelledAt?: string | null;
    externalId?: string | null;
  } | null;
  payments?: Array<{
    id: string;
    provider: string;
    status: string;
    value?: number | null;
    currency?: string | null;
    paidAt?: string | null;
    createdAt: string;
  }>;
  activity?: Array<{
    id: number;
    action: string;
    reason?: string | null;
    createdAt: string;
  }>;
};

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Período inicial",
  PAST_DUE: "Pagamento pendente",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
  PENDING_DELETION: "Aguardando exclusão",
};

const paymentLabel: Record<string, string> = {
  APPROVED: "Pago",
  REJECTED: "Recusado",
  PENDING: "Pendente",
  REFUNDED: "Reembolsado",
};

const activityLabel: Record<string, string> = {
  SUSPEND: "Empresa suspensa",
  REACTIVATE: "Empresa reativada",
  CANCEL: "Assinatura cancelada",
  ENABLE_MAINTENANCE: "Manutenção ativada",
  DISABLE_MAINTENANCE: "Manutenção desativada",
  UPDATE_COMPANY_FEATURES: "Recursos atualizados",
};

function money(value?: number | null, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(Number(value || 0));
}

function fullDate(value?: string | null) {
  if (!value) return "Sem registro";
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function relativeDate(value?: string | null) {
  if (!value) return "Sem registro";
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (abs < 60 * 60 * 1000) {
    const minutes = Math.round(diff / (60 * 1000));
    return formatter.format(minutes, "minute");
  }
  if (abs < 24 * 60 * 60 * 1000) {
    const hours = Math.round(diff / (60 * 60 * 1000));
    return formatter.format(hours, "hour");
  }
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  return formatter.format(days, "day");
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  return Math.ceil(
    (new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
}

function weeklyCompanies(companies: AdminCompanyRow[]) {
  const today = new Date();
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  const mondayOffset = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - mondayOffset);

  return Array.from({ length: 6 }, (_, index) => {
    const weeksAgo = 5 - index;
    const start = new Date(base);
    start.setDate(start.getDate() - weeksAgo * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = companies.filter((company) => {
      const created = new Date(company.createdAt);
      return created >= start && created < end;
    }).length;
    return {
      count,
      label: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }).format(start),
    };
  });
}

export default function AdminCompaniesDashboard({
  initialCompanies,
  initialOverview,
}: {
  initialCompanies: AdminCompanyRow[];
  initialOverview: PlatformOverview;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("last_access");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const metrics = useMemo(() => {
    const active = initialCompanies.filter((company) =>
      ["ACTIVE", "TRIAL"].includes(company.status),
    ).length;
    const activeSubscriptions = initialCompanies.filter(
      (company) => company.subscriptionStatus === "ACTIVE",
    );
    const mrr = activeSubscriptions.reduce(
      (sum, company) => sum + Number(company.monthlyValue || 0),
      0,
    );
    return {
      active,
      mrr,
      activeSubscriptions: activeSubscriptions.length,
      weekly: weeklyCompanies(initialCompanies),
    };
  }, [initialCompanies]);

  const capacity = Math.min(
    100,
    initialOverview.maxCompanies
      ? (initialOverview.currentCompanies / initialOverview.maxCompanies) * 100
      : 0,
  );

  const pending = useMemo(() => {
    const payment = initialCompanies.find(
      (company) =>
        company.status === "PAST_DUE" ||
        company.subscriptionStatus === "PAST_DUE",
    );
    if (payment) return { type: "payment" as const, company: payment, days: null };

    const trial = initialCompanies
      .map((company) => ({
        company,
        days: daysUntil(company.trialEndsAt),
      }))
      .filter(
        (item) =>
          ["TRIAL"].includes(item.company.status) &&
          item.days !== null &&
          item.days >= 0 &&
          item.days <= 3,
      )
      .sort((a, b) => Number(a.days) - Number(b.days))[0];

    return trial
      ? { type: "trial" as const, company: trial.company, days: trial.days }
      : null;
  }, [initialCompanies]);

  const companies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = initialCompanies.filter((company) => {
      const matchesSearch =
        !query ||
        [company.name, company.responsible, company.email]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(query);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" &&
          ["ACTIVE", "TRIAL"].includes(company.status)) ||
        company.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "name")
        return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
      if (sortBy === "created")
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      const aTime = a.lastAccessAt
        ? new Date(a.lastAccessAt).getTime()
        : Number.NEGATIVE_INFINITY;
      const bTime = b.lastAccessAt
        ? new Date(b.lastAccessAt).getTime()
        : Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });
  }, [initialCompanies, search, sortBy, statusFilter]);

  async function selectCompany(
    company: AdminCompanyRow,
    focusBilling = false,
  ) {
    setSelectedCompanyId(company.id);
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await supabase!.rpc("admin_company_detail", {
        p_empresa: company.id,
      });
      if (result.error) throw result.error;
      const next = result.data as AdminCompanyDetail;
      setDetail(next);
      setNote(next.note || "");
      if (focusBilling) {
        window.setTimeout(() => {
          document
            .getElementById("admin-detail-invoices")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 80);
      }
    } catch (caught) {
      setDetail(null);
      setDetailError(message(caught as Error));
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveNote() {
    if (!detail) return;
    setNoteBusy(true);
    setDetailError("");
    try {
      const result = await supabase!.rpc("admin_save_company_note", {
        p_empresa: detail.id,
        p_note: note,
      });
      if (result.error) throw result.error;
      setNotice("Anotação interna salva.");
      const refreshed = await supabase!.rpc("admin_company_detail", {
        p_empresa: detail.id,
      });
      if (!refreshed.error) setDetail(refreshed.data as AdminCompanyDetail);
    } catch (caught) {
      setDetailError(message(caught as Error));
    } finally {
      setNoteBusy(false);
    }
  }

  async function companyAction(company: AdminCompanyRow) {
    const reactivate = ["SUSPENDED", "CANCELED"].includes(company.status);
    const action = reactivate ? "REACTIVATE" : "SUSPEND";
    const verb = reactivate ? "Reativar" : "Suspender";
    if (!window.confirm(verb + " “" + company.name + "”?")) return;

    setActionBusy(company.id);
    setError("");
    setNotice("");
    try {
      const result = await supabase!.rpc("admin_update_company_state", {
        p_empresa: company.id,
        p_action: action,
        p_reason: "Ação rápida pela lista de empresas",
      });
      if (result.error) throw result.error;
      setNotice(
        reactivate ? "Empresa reativada." : "Empresa suspensa com sucesso.",
      );
      router.refresh();
      if (selectedCompanyId === company.id) {
        await selectCompany(company);
      }
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setActionBusy("");
    }
  }

  function rowKey(
    event: KeyboardEvent<HTMLTableRowElement>,
    company: AdminCompanyRow,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void selectCompany(company);
    }
  }

  function stopRow(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  const sparkMax = Math.max(
    1,
    ...metrics.weekly.map((item) => item.count),
  );

  return (
    <section className="module admin-module admin-companies-page">
      <Heading
        title="Empresas"
        subtitle="Acompanhe capacidade, assinaturas, uso e atividade das assistências cadastradas."
      />
      <ErrorBox error={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {pending && (
        <section className="admin-warning-banner" role="status">
          <span aria-hidden="true">!</span>
          <div>
            <strong>
              {pending.type === "trial"
                ? pending.company.name +
                  " sai do período inicial em " +
                  pending.days +
                  (pending.days === 1 ? " dia" : " dias")
                : pending.company.name + " está com pagamento pendente"}
            </strong>
            <small>Revise a empresa antes que o acesso seja afetado.</small>
          </div>
          <button
            type="button"
            onClick={() => void selectCompany(pending.company, pending.type === "payment")}
          >
            Ver empresa
          </button>
        </section>
      )}

      <div className="admin-overview-grid">
        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Empresas</span>
            <b aria-hidden="true">▦</b>
          </div>
          <strong>{initialOverview.currentCompanies}</strong>
          <small>de {initialOverview.maxCompanies} vagas</small>
          <div
            className="admin-capacity-track"
            title={Math.round(capacity) + "% da capacidade utilizada"}
          >
            <i style={{ width: capacity + "%" }} />
          </div>
        </article>

        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Ativas</span>
            <b aria-hidden="true">✓</b>
          </div>
          <strong>{metrics.active}</strong>
          <small>Incluindo período inicial</small>
        </article>

        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>MRR estimado</span>
            <b aria-hidden="true">R$</b>
          </div>
          <strong>{money(metrics.mrr)}</strong>
          <small>
            {metrics.activeSubscriptions}{" "}
            {metrics.activeSubscriptions === 1
              ? "assinatura ativa"
              : "assinaturas ativas"}
          </small>
        </article>

        <article className="admin-overview-card admin-new-companies-card">
          <div className="admin-overview-card-head">
            <span>Novas empresas</span>
            <b aria-hidden="true">＋</b>
          </div>
          <div
            className="admin-week-spark"
            aria-label="Novas empresas por semana nas últimas seis semanas"
          >
            {metrics.weekly.map((item) => (
              <span key={item.label} title={item.label + ": " + item.count}>
                <i
                  style={{
                    height: Math.max(12, (item.count / sparkMax) * 52) + "px",
                  }}
                />
                <small>{item.count}</small>
              </span>
            ))}
          </div>
          <small>Últimas 6 semanas</small>
        </article>
      </div>

      <div className="admin-companies-layout">
        <section className="panel admin-companies-list">
          <div className="admin-company-toolbar">
            <label className="admin-company-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Buscar empresa, responsável ou e-mail"
                placeholder="Buscar empresa, responsável ou e-mail…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="ALL">Todos</option>
                <option value="ACTIVE">Ativa</option>
                <option value="PAST_DUE">Pagamento pendente</option>
                <option value="SUSPENDED">Suspensa</option>
              </select>
            </label>
            <label>
              <span>Ordenar por</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="last_access">Último acesso</option>
                <option value="name">Nome</option>
                <option value="created">Data de cadastro</option>
              </select>
            </label>
          </div>

          <div className="table-wrap admin-companies-table-wrap">
            <table className="admin-companies-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Responsável</th>
                  <th>Plano</th>
                  <th>Uso</th>
                  <th>Último acesso</th>
                  <th>Status</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const selected = selectedCompanyId === company.id;
                  return (
                    <tr
                      key={company.id}
                      className={selected ? "is-selected" : ""}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => void selectCompany(company)}
                      onKeyDown={(event) => rowKey(event, company)}
                    >
                      <td>
                        <strong>{company.name}</strong>
                        <small>/{company.slug}</small>
                      </td>
                      <td>
                        <strong>{company.responsible || "Não informado"}</strong>
                        <small>{company.email}</small>
                      </td>
                      <td>
                        <strong>{company.plan || "Horária"}</strong>
                      </td>
                      <td>
                        <div className="admin-usage-pills">
                          <span title="Usuários">
                            <b aria-hidden="true">♙</b>
                            {company.usersCount}
                          </span>
                          <span title="Clientes">
                            <b aria-hidden="true">◎</b>
                            {company.customersCount}
                          </span>
                          <span title="Ordens de serviço">
                            <b aria-hidden="true">▤</b>
                            {company.ordersCount}
                          </span>
                        </div>
                      </td>
                      <td>
                        <time
                          dateTime={company.lastAccessAt || undefined}
                          title={fullDate(company.lastAccessAt)}
                        >
                          {relativeDate(company.lastAccessAt)}
                        </time>
                      </td>
                      <td>
                        <span
                          className={
                            "account-status " + company.status.toLowerCase()
                          }
                        >
                          {statusLabel[company.status] || company.status}
                        </span>
                      </td>
                      <td className="admin-actions-cell" onClick={stopRow}>
                        <details className="admin-row-actions">
                          <summary aria-label={"Ações de " + company.name}>⋯</summary>
                          <div>
                            <button
                              type="button"
                              disabled={actionBusy === company.id}
                              onClick={() => void companyAction(company)}
                            >
                              {["SUSPENDED", "CANCELED"].includes(company.status)
                                ? "Reativar"
                                : "Suspender"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void selectCompany(company, true)}
                            >
                              Ver cobrança
                            </button>
                            <a href={"mailto:" + company.email}>Contatar</a>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!companies.length && (
              <div className="empty-state">
                <strong>Nenhuma empresa encontrada.</strong>
                <p>Ajuste a busca ou os filtros.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="panel admin-company-side">
          {!selectedCompanyId ? (
            <div className="admin-detail-empty">
              <span aria-hidden="true">▦</span>
              <strong>Selecione uma empresa</strong>
              <p>
                Clique em uma linha para consultar cobrança, anotações e
                atividade recente sem sair desta página.
              </p>
            </div>
          ) : detailLoading ? (
            <div className="admin-detail-empty">
              <strong>Carregando empresa…</strong>
            </div>
          ) : detailError ? (
            <ErrorBox error={detailError} />
          ) : detail ? (
            <>
              <header className="admin-company-side-head">
                <div>
                  <small>EMPRESA SELECIONADA</small>
                  <h2>{detail.name}</h2>
                  <p>/{detail.slug}</p>
                </div>
                <span
                  className={"account-status " + detail.status.toLowerCase()}
                >
                  {statusLabel[detail.status] || detail.status}
                </span>
              </header>

              <section id="admin-detail-invoices" className="admin-detail-section">
                <div className="admin-detail-section-head">
                  <h3>Faturas</h3>
                  {detail.subscription?.nextBillingDate && (
                    <small>
                      Próxima:{" "}
                      {new Date(
                        detail.subscription.nextBillingDate,
                      ).toLocaleDateString("pt-BR")}
                    </small>
                  )}
                </div>
                {detail.payments?.length ? (
                  <>
                    <article className="admin-latest-payment">
                      <div>
                        <span>Última cobrança</span>
                        <strong>
                          {money(
                            detail.payments[0].value,
                            detail.payments[0].currency || "BRL",
                          )}
                        </strong>
                        <small>{fullDate(detail.payments[0].createdAt)}</small>
                      </div>
                      <span
                        className={
                          "admin-payment-status " +
                          detail.payments[0].status.toLowerCase()
                        }
                      >
                        {paymentLabel[detail.payments[0].status] ||
                          detail.payments[0].status}
                      </span>
                    </article>
                    <div className="admin-payment-history">
                      {detail.payments.slice(1, 4).map((payment) => (
                        <div key={payment.id}>
                          <span>{fullDate(payment.createdAt)}</span>
                          <strong>
                            {money(payment.value, payment.currency || "BRL")}
                          </strong>
                          <small>
                            {paymentLabel[payment.status] || payment.status}
                          </small>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="admin-detail-muted">
                    Nenhuma cobrança registrada para esta empresa.
                  </p>
                )}
              </section>

              <section className="admin-detail-section">
                <div className="admin-detail-section-head">
                  <h3>Anotações internas</h3>
                  <small>Somente Super Admin</small>
                </div>
                <textarea
                  value={note}
                  maxLength={4000}
                  placeholder="Registre contexto de cobrança, contato ou acompanhamento interno…"
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="admin-note-actions">
                  <small>{note.length}/4000</small>
                  <button
                    type="button"
                    className="primary"
                    disabled={noteBusy}
                    onClick={() => void saveNote()}
                  >
                    {noteBusy ? "Salvando…" : "Salvar anotação"}
                  </button>
                </div>
              </section>

              <section className="admin-detail-section">
                <div className="admin-detail-section-head">
                  <h3>Atividade recente</h3>
                </div>
                <div className="admin-activity-list">
                  <article>
                    <span className="admin-activity-dot" />
                    <div>
                      <strong>Último login</strong>
                      <small title={fullDate(detail.lastAccessAt)}>
                        {relativeDate(detail.lastAccessAt)}
                      </small>
                    </div>
                  </article>
                  {detail.activity?.map((item) => (
                    <article key={item.id}>
                      <span className="admin-activity-dot" />
                      <div>
                        <strong>
                          {activityLabel[item.action] || item.action}
                        </strong>
                        {item.reason && <p>{item.reason}</p>}
                        <small>{fullDate(item.createdAt)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
