"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
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
  dueAt?: string | null;
  graceEndsAt?: string | null;
  amountDue?: number | null;
  monthlyValue?: number | null;
  currency?: string | null;
  lastPaymentAt?: string | null;
  lastPaymentAmount?: number | null;
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

export type BillingOverview = {
  receivedThisMonth: number;
  receivedTotal: number;
  expensesThisMonth: number;
  expensesTotal: number;
  netThisMonth: number;
  receivableTotal: number;
  pendingCount: number;
  overdueCount: number;
  dueNext24hCount: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  suspendedCount: number;
  estimatedMrr: number;
  graceHours: number;
  initialAmount: number;
  monthlyAmount: number;
};

export type PlatformExpense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  incurredOn: string;
  recurring: boolean;
  notes?: string | null;
  createdAt: string;
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
  MANUAL_PAYMENT_APPROVED: "Pagamento Pix confirmado",
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

function billingStatus(company: AdminCompanyRow) {
  if (!company.dueAt) return "Cobrança a definir";
  const due = new Date(company.dueAt).getTime();
  if (!Number.isFinite(due)) return "Cobrança a definir";

  if (Number(company.amountDue || 0) > 0 || due < Date.now()) {
    return "Vencido " + relativeDate(company.dueAt);
  }

  return "Vence " + relativeDate(company.dueAt);
}

function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
  initialBillingOverview,
  initialExpenses,
}: {
  initialCompanies: AdminCompanyRow[];
  initialOverview: PlatformOverview;
  initialBillingOverview: BillingOverview;
  initialExpenses: PlatformExpense[];
}) {
  const router = useRouter();
  const [companiesData, setCompaniesData] = useState(initialCompanies);
  const [overviewData, setOverviewData] = useState(initialOverview);
  const [billingOverview, setBillingOverview] = useState(initialBillingOverview);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("last_access");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const metrics = useMemo(() => {
    const active = companiesData.filter((company) =>
      ["ACTIVE", "TRIAL"].includes(company.status),
    ).length;
    return {
      active,
      mrr: Number(billingOverview.estimatedMrr || 0),
      activeSubscriptions: Number(billingOverview.activeSubscriptions || 0),
      weekly: weeklyCompanies(companiesData),
    };
  }, [billingOverview, companiesData]);

  const capacity = Math.min(
    100,
    overviewData.maxCompanies
      ? (overviewData.currentCompanies / overviewData.maxCompanies) * 100
      : 0,
  );

  const pending = useMemo(() => {
    const payment = companiesData.find(
      (company) =>
        company.status === "PAST_DUE" ||
        company.subscriptionStatus === "PAST_DUE",
    );
    if (payment) return { type: "payment" as const, company: payment, days: null };

    const trial = companiesData
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
  }, [companiesData]);

  const companies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = companiesData.filter((company) => {
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
  }, [companiesData, search, sortBy, statusFilter]);

  const refreshDashboard = useCallback(async () => {
    if (!supabase) return;

    const [companiesResult, overviewResult, billingResult, expensesResult] =
      await Promise.all([
        supabase.rpc("admin_list_companies"),
        supabase.rpc("admin_platform_overview"),
        supabase.rpc("admin_billing_overview"),
        supabase.rpc("admin_list_platform_expenses", { p_limit: 50 }),
      ]);

    const firstError =
      companiesResult.error ||
      overviewResult.error ||
      billingResult.error ||
      expensesResult.error;
    if (firstError) throw firstError;

    setCompaniesData((companiesResult.data || []) as AdminCompanyRow[]);
    setOverviewData(overviewResult.data as PlatformOverview);
    setBillingOverview(billingResult.data as BillingOverview);
    setExpenses((expensesResult.data || []) as PlatformExpense[]);
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await refreshDashboard();
        if (active) setError("");
      } catch (caught) {
        if (active) setError(message(caught as Error));
      }
    };

    const timer = window.setInterval(() => void run(), 10000);
    const visibility = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", visibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refreshDashboard]);

  const receivables = useMemo(
    () =>
      companiesData
        .filter((company) => Number(company.amountDue || 0) > 0)
        .sort(
          (a, b) =>
            new Date(a.dueAt || 0).getTime() -
            new Date(b.dueAt || 0).getTime(),
        ),
    [companiesData],
  );

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || expenseBusy) return;

    const form = new FormData(event.currentTarget);
    const amount = Number(String(form.get("amount") || "").replace(",", "."));
    setExpenseBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await supabase.rpc("admin_add_platform_expense", {
        p_description: String(form.get("description") || ""),
        p_amount: amount,
        p_category: String(form.get("category") || "outros"),
        p_incurred_on: String(form.get("incurredOn") || localToday()),
        p_recurring: form.get("recurring") === "on",
        p_notes: String(form.get("notes") || ""),
      });
      if (result.error) throw result.error;
      event.currentTarget.reset();
      setNotice("Despesa da Horária registrada.");
      await refreshDashboard();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setExpenseBusy(false);
    }
  }

  async function deleteExpense(expense: PlatformExpense) {
    if (!supabase || expenseBusy) return;
    if (!window.confirm("Excluir a despesa “" + expense.description + "”?"))
      return;

    setExpenseBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("admin_delete_platform_expense", {
        p_expense: expense.id,
      });
      if (result.error) throw result.error;
      setNotice("Despesa removida.");
      await refreshDashboard();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setExpenseBusy(false);
    }
  }

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

  async function confirmManualPayment() {
    if (!detail?.subscription?.id || paymentBusy) return;

    if (
      !window.confirm(
        "Confirmar que o pagamento via Pix desta empresa foi recebido?",
      )
    )
      return;

    setPaymentBusy(true);
    setDetailError("");
    setNotice("");

    try {
      const confirmationId = crypto.randomUUID();
      const result = await supabase!.rpc("admin_confirm_manual_payment", {
        p_empresa: detail.id,
        p_confirmation_id: confirmationId,
        p_note: "Confirmação manual pelo painel do Super Admin",
      });
      if (result.error) throw result.error;

      const payment = result.data as {
        amount?: number | null;
        nextBillingDate?: string | null;
      };

      const refreshed = await supabase!.rpc("admin_company_detail", {
        p_empresa: detail.id,
      });
      if (refreshed.error) throw refreshed.error;

      setDetail(refreshed.data as AdminCompanyDetail);
      setNotice(
        "Pagamento Pix de " +
          money(payment.amount) +
          " confirmado. Próxima cobrança: " +
          (payment.nextBillingDate
            ? new Date(payment.nextBillingDate).toLocaleDateString("pt-BR")
            : "a definir") +
          ".",
      );
      await refreshDashboard();
      router.refresh();
    } catch (caught) {
      setDetailError(message(caught as Error));
    } finally {
      setPaymentBusy(false);
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
      await refreshDashboard();
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

      <div className="admin-overview-grid admin-billing-overview-grid">
        <article className="admin-overview-card admin-finance-card is-revenue">
          <div className="admin-overview-card-head">
            <span>Faturamento no mês</span>
            <b aria-hidden="true">↗</b>
          </div>
          <strong>{money(billingOverview.receivedThisMonth)}</strong>
          <small>Recebido e confirmado</small>
        </article>

        <article className="admin-overview-card admin-finance-card is-expense">
          <div className="admin-overview-card-head">
            <span>Gastos no mês</span>
            <b aria-hidden="true">↘</b>
          </div>
          <strong>{money(billingOverview.expensesThisMonth)}</strong>
          <small>Despesas da própria Horária</small>
        </article>

        <article className="admin-overview-card admin-finance-card is-profit">
          <div className="admin-overview-card-head">
            <span>Resultado no mês</span>
            <b aria-hidden="true">=</b>
          </div>
          <strong>{money(billingOverview.netThisMonth)}</strong>
          <small>Faturamento menos despesas</small>
        </article>

        <article className="admin-overview-card admin-finance-card is-receivable">
          <div className="admin-overview-card-head">
            <span>A receber</span>
            <b aria-hidden="true">◷</b>
          </div>
          <strong>{money(billingOverview.receivableTotal)}</strong>
          <small>{billingOverview.overdueCount} cobrança(s) vencida(s)</small>
        </article>

        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Pagamento pendente</span>
            <b aria-hidden="true">!</b>
          </div>
          <strong>{billingOverview.pendingCount}</strong>
          <small>Dentro da tolerância de {billingOverview.graceHours}h</small>
        </article>

        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Vencem em 24h</span>
            <b aria-hidden="true">⌛</b>
          </div>
          <strong>{billingOverview.dueNext24hCount}</strong>
          <small>Assinaturas que exigem atenção</small>
        </article>

        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>MRR estimado</span>
            <b aria-hidden="true">R$</b>
          </div>
          <strong>{money(billingOverview.estimatedMrr)}</strong>
          <small>{billingOverview.activeSubscriptions} assinaturas ativas</small>
        </article>

        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Recebido total</span>
            <b aria-hidden="true">✓</b>
          </div>
          <strong>{money(billingOverview.receivedTotal)}</strong>
          <small>Histórico de pagamentos aprovados</small>
        </article>
      </div>

      <div className="admin-overview-grid">
        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Empresas</span>
            <b aria-hidden="true">▦</b>
          </div>
          <strong>{overviewData.currentCompanies}</strong>
          <small>de {overviewData.maxCompanies} vagas</small>
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

      {receivables.length > 0 && (
        <section className="panel admin-receivables-panel">
          <div className="admin-section-heading">
            <div>
              <span className="eyebrow">COBRANÇAS</span>
              <h2>Quem está devendo</h2>
              <p>Empresas com vencimento passado e valor ainda a receber.</p>
            </div>
            <strong>{money(billingOverview.receivableTotal)}</strong>
          </div>
          <div className="admin-receivable-list">
            {receivables.slice(0, 8).map((company) => (
              <article key={company.id}>
                <div>
                  <strong>{company.name}</strong>
                  <small>{company.responsible || company.email}</small>
                </div>
                <div>
                  <span>{billingStatus(company)}</span>
                  <strong>{money(company.amountDue, company.currency || "BRL")}</strong>
                </div>
                <button
                  type="button"
                  className="outline"
                  onClick={() => void selectCompany(company, true)}
                >
                  Ver cobrança
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel admin-platform-expenses">
        <div className="admin-section-heading">
          <div>
            <span className="eyebrow">FINANCEIRO DA HORÁRIA</span>
            <h2>Despesas da plataforma</h2>
            <p>
              Registre aqui apenas gastos da Horária, como domínio, serviços e
              ferramentas. O financeiro das assistências continua separado.
            </p>
          </div>
          <strong>{money(billingOverview.expensesThisMonth)}</strong>
        </div>

        <div className="admin-expense-layout">
          <form className="admin-expense-form" onSubmit={addExpense}>
            <label>
              Descrição
              <input name="description" required maxLength={200} placeholder="Ex.: domínio anual" />
            </label>
            <label>
              Valor
              <input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00" />
            </label>
            <label>
              Categoria
              <select name="category" defaultValue="infraestrutura">
                <option value="infraestrutura">Infraestrutura</option>
                <option value="dominio">Domínio</option>
                <option value="ferramentas">Ferramentas</option>
                <option value="marketing">Marketing</option>
                <option value="impostos">Impostos</option>
                <option value="outros">Outros</option>
              </select>
            </label>
            <label>
              Data
              <input name="incurredOn" type="date" defaultValue={localToday()} required />
            </label>
            <label className="check-label admin-expense-recurring">
              <input name="recurring" type="checkbox" /> Despesa recorrente
            </label>
            <label className="admin-expense-notes">
              Observação
              <input name="notes" maxLength={500} placeholder="Opcional" />
            </label>
            <button className="primary" disabled={expenseBusy}>
              {expenseBusy ? "Salvando…" : "Adicionar despesa"}
            </button>
          </form>

          <div className="admin-expense-list">
            {expenses.length ? (
              expenses.slice(0, 12).map((expense) => (
                <article key={expense.id}>
                  <div>
                    <strong>{expense.description}</strong>
                    <small>
                      {new Date(expense.incurredOn + "T12:00:00").toLocaleDateString("pt-BR")}
                      {" · "}
                      {expense.category}
                      {expense.recurring ? " · recorrente" : ""}
                    </small>
                  </div>
                  <strong>{money(expense.amount)}</strong>
                  <button
                    type="button"
                    aria-label={"Excluir " + expense.description}
                    disabled={expenseBusy}
                    onClick={() => void deleteExpense(expense)}
                  >
                    ×
                  </button>
                </article>
              ))
            ) : (
              <p className="admin-detail-muted">
                Nenhuma despesa da Horária registrada ainda.
              </p>
            )}
          </div>
        </div>
      </section>

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
                  <th>Cobrança</th>
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
                        <strong
                          className={
                            Number(company.amountDue || 0) > 0
                              ? "admin-billing-cell is-overdue"
                              : "admin-billing-cell"
                          }
                        >
                          {billingStatus(company)}
                        </strong>
                        <small>
                          {Number(company.amountDue || 0) > 0
                            ? money(company.amountDue, company.currency || "BRL")
                            : company.lastPaymentAt
                              ? "Último: " + fullDate(company.lastPaymentAt)
                              : "Sem pagamento"}
                        </small>
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

                {detail.subscription?.id && (
                  <div className="admin-note-actions">
                    <small>
                      Confirme somente depois de conferir o recebimento no banco.
                    </small>
                    <button
                      type="button"
                      className="primary"
                      disabled={paymentBusy}
                      onClick={() => void confirmManualPayment()}
                    >
                      {paymentBusy
                        ? "Confirmando…"
                        : "Confirmar pagamento Pix"}
                    </button>
                  </div>
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
