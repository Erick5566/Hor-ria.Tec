"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { supabase, message, today } from "@/lib/supabase";
import { ErrorBox, Heading } from "./ui";
import Link from "next/link";
import {
  adminQueues,
  adminStatusLabels,
  filterAdminCompanies,
  inAdminQueue,
  adminCompaniesCsv,
  companyWhatsapp,
  type AdminQueue,
  type AdminSort,
} from "@/lib/admin-management";

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
  lastPaymentAt?: string | null;
  lastPaymentAmount?: number | null;
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

export type AdminBillingOverview = {
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

const statusLabel = adminStatusLabels;

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

export default function AdminCompaniesDashboard({
  initialCompanies,
  initialOverview,
  initialBilling,
  initialExpenses,
}: {
  initialCompanies: AdminCompanyRow[];
  initialOverview: PlatformOverview;
  initialBilling: AdminBillingOverview;
  initialExpenses: PlatformExpense[];
}) {
  const [companyRows, setCompanyRows] = useState(initialCompanies);
  const [overview, setOverview] = useState(initialOverview);
  const [billing, setBilling] = useState(initialBilling);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Infraestrutura");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseRecurring, setExpenseRecurring] = useState(false);
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<AdminSort>("last_access");
  const [queue, setQueue] = useState<AdminQueue>("ALL");
  const [page, setPage] = useState(1);
  const [clock, setClock] = useState(() => Date.now());
  const [expenseDate, setExpenseDate] = useState(today);
  const [expenseNotes, setExpenseNotes] = useState("");
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const pageSize = 15;
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] = useState<AdminCompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const paymentLockRef = useRef(false);
  const selectedCompanyRef = useRef<string | null>(null);
  const adminRefreshVersionRef = useRef(0);
  const noteDirtyRef = useRef(false);
  const noteRevisionRef = useRef(0);
  const noteSaveLockRef = useRef(false);
  const paymentConfirmationRef = useRef(new Map<string, string>());
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const capacity = Math.min(
    100,
    overview.maxCompanies
      ? (overview.currentCompanies / overview.maxCompanies) * 100
      : 0,
  );

  const queueCounts = useMemo(
    () =>
      Object.fromEntries(
        adminQueues.map((item) => [
          item.id,
          companyRows.filter((company) => inAdminQueue(company, item.id, clock))
            .length,
        ]),
      ),
    [companyRows, clock],
  );
  const companies = useMemo(
    () =>
      filterAdminCompanies(companyRows, {
        search,
        status: statusFilter,
        queue,
        sort: sortBy,
        now: clock,
      }),
    [companyRows, search, statusFilter, queue, sortBy, clock],
  );
  const totalPages = Math.max(1, Math.ceil(companies.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleCompanies = companies.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const filteredAmount = companies.reduce(
    (sum, company) => sum + Number(company.amountDue || 0),
    0,
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  function resetFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setQueue("ALL");
    setSortBy("last_access");
    setPage(1);
  }

  function exportCompanies() {
    if (!companies.length) return;
    const url = URL.createObjectURL(
      new Blob([adminCompaniesCsv(companies)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `horaria-empresas-${today()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`${companies.length} empresas exportadas com os filtros atuais.`);
  }

  async function copyCompanyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(
        new URL("/" + encodeURIComponent(slug), window.location.origin).href,
      );
      setNotice("Link público da empresa copiado.");
    } catch {
      setError(
        "Não foi possível copiar. Abra a página pública e copie o endereço.",
      );
    }
  }

  const refreshAdminData = useCallback(async () => {
    if (!supabase) return;
    const refreshVersion = ++adminRefreshVersionRef.current;
    const [companiesResult, overviewResult, billingResult, expensesResult] =
      await Promise.all([
        supabase.rpc("admin_list_companies"),
        supabase.rpc("admin_platform_overview"),
        supabase.rpc("admin_billing_overview"),
        supabase.rpc("admin_list_platform_expenses", { p_limit: 50 }),
      ]);

    if (refreshVersion !== adminRefreshVersionRef.current) return;
    if (!companiesResult.error)
      setCompanyRows((companiesResult.data || []) as AdminCompanyRow[]);
    if (!overviewResult.error)
      setOverview(overviewResult.data as PlatformOverview);
    if (!billingResult.error)
      setBilling(billingResult.data as AdminBillingOverview);
    if (!expensesResult.error)
      setExpenses((expensesResult.data || []) as PlatformExpense[]);

    if (selectedCompanyId) {
      const detailResult = await supabase.rpc("admin_company_detail", {
        p_empresa: selectedCompanyId,
      });
      if (
        refreshVersion !== adminRefreshVersionRef.current ||
        selectedCompanyRef.current !== selectedCompanyId
      )
        return;
      if (!detailResult.error) {
        const next = detailResult.data as AdminCompanyDetail;
        setDetail(next);
        if (!noteDirtyRef.current) setNote(next.note || "");
      }
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!supabase) return;

    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshAdminData(), 250);
    };

    const channel = supabase
      .channel("admin-live-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "empresas" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assinaturas" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pagamentos" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "empresa_membros" },
        scheduleRefresh,
      )
      .subscribe();

    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);
    const safetySync = window.setInterval(scheduleRefresh, 30000);

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.clearInterval(safetySync);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
      void supabase!.removeChannel(channel);
    };
  }, [refreshAdminData]);

  async function addPlatformExpense() {
    const amount = Number(expenseAmount.replace(",", "."));
    if (!expenseDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Informe a descrição e um valor válido para a despesa.");
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ||
      !Number.isFinite(Date.parse(expenseDate + "T12:00:00"))
    ) {
      setError("Informe uma data válida para a despesa.");
      return;
    }
    setExpenseBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await supabase!.rpc("admin_add_platform_expense", {
        p_description: expenseDescription.trim(),
        p_amount: amount,
        p_category: expenseCategory,
        p_incurred_on: expenseDate,
        p_recurring: expenseRecurring,
        p_notes: expenseNotes.trim() || null,
      });
      if (result.error) throw result.error;
      setExpenseDescription("");
      setExpenseAmount("");
      setExpenseRecurring(false);
      setExpenseNotes("");
      setNotice("Despesa da plataforma registrada.");
      await refreshAdminData();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setExpenseBusy(false);
    }
  }

  async function deletePlatformExpense(expense: PlatformExpense) {
    if (!window.confirm("Excluir a despesa “" + expense.description + "”?"))
      return;
    setExpenseBusy(true);
    setError("");
    try {
      const result = await supabase!.rpc("admin_delete_platform_expense", {
        p_expense: expense.id,
      });
      if (result.error) throw result.error;
      setNotice("Despesa removida.");
      await refreshAdminData();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setExpenseBusy(false);
    }
  }

  async function selectCompany(company: AdminCompanyRow, focusBilling = false) {
    if (
      noteDirtyRef.current &&
      !window.confirm(
        "Há uma anotação não salva. Deseja descartá-la para abrir esta empresa?",
      )
    )
      return;
    noteRevisionRef.current += 1;
    selectedCompanyRef.current = company.id;
    adminRefreshVersionRef.current += 1;
    noteDirtyRef.current = false;
    setSelectedCompanyId(company.id);
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await supabase!.rpc("admin_company_detail", {
        p_empresa: company.id,
      });
      if (selectedCompanyRef.current !== company.id) return;
      if (result.error) throw result.error;
      const next = result.data as AdminCompanyDetail;
      setDetail(next);
      setNote(next.note || "");
      if (focusBilling || window.matchMedia?.("(max-width: 1100px)").matches) {
        window.setTimeout(() => {
          document
            .getElementById("admin-detail-invoices")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 80);
      }
    } catch (caught) {
      if (selectedCompanyRef.current !== company.id) return;
      setDetail(null);
      setDetailError(message(caught as Error));
    } finally {
      if (selectedCompanyRef.current === company.id) setDetailLoading(false);
    }
  }

  async function saveNote() {
    if (!detail || noteSaveLockRef.current) return;
    const companyId = detail.id;
    const revision = noteRevisionRef.current;
    noteSaveLockRef.current = true;
    noteDirtyRef.current = true;
    setNoteBusy(true);
    setDetailError("");
    try {
      const result = await supabase!.rpc("admin_save_company_note", {
        p_empresa: companyId,
        p_note: note,
      });
      if (result.error) throw result.error;
      if (
        selectedCompanyRef.current !== companyId ||
        noteRevisionRef.current !== revision
      ) return;
      // Discard refreshes started before this write was acknowledged.
      adminRefreshVersionRef.current += 1;
      noteDirtyRef.current = false;
      setNotice("Anotação interna salva.");
    } catch (caught) {
      if (
        selectedCompanyRef.current === companyId &&
        noteRevisionRef.current === revision
      ) setDetailError(message(caught as Error));
    } finally {
      noteSaveLockRef.current = false;
      setNoteBusy(false);
    }
  }

  async function confirmManualPayment() {
    if (!detail?.subscription?.id || paymentBusy || paymentLockRef.current)
      return;

    if (
      !window.confirm(
        paymentConfirmationRef.current.has(detail.id + ":completed")
          ? "Confirmar um NOVO pagamento Pix recebido? O pagamento anterior já foi reconciliado."
          : "Confirmar que o pagamento via Pix desta empresa foi recebido? Uma tentativa pendente será reconciliada antes de permitir outro pagamento.",
      )
    )
      return;

    paymentLockRef.current = true;
    setPaymentBusy(true);
    setDetailError("");
    setNotice("");

    try {
      const operationResult = await supabase!.rpc("admin_payment_operation", {
        p_empresa: detail.id,
        p_previous_confirmation_id:
          paymentConfirmationRef.current.get(detail.id + ":completed") || null,
      });
      if (operationResult.error) throw operationResult.error;
      const operation = operationResult.data as {
        confirmationId: string;
        status: string;
      };
      if (!operation.confirmationId)
        throw new Error("Operação de pagamento não disponível.");
      if (operation.status === "requires_review")
        throw new Error(
          "Operação pendente de revisão. Nenhum novo pagamento foi registrado.",
        );
      const confirmationId = operation.confirmationId;
      paymentConfirmationRef.current.set(detail.id, confirmationId);
      paymentConfirmationRef.current.delete(detail.id + ":completed");
      const result =
        operation.status === "completed"
          ? { data: {}, error: null }
          : await supabase!.rpc("admin_confirm_manual_payment", {
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

      if (selectedCompanyRef.current === detail.id)
        setDetail(refreshed.data as AdminCompanyDetail);
      await refreshAdminData();
      const completed = await supabase!.rpc(
        "admin_complete_payment_operation",
        {
          p_empresa: detail.id,
          p_confirmation_id: confirmationId,
        },
      );
      if (completed.error) throw completed.error;
      paymentConfirmationRef.current.set(
        detail.id + ":completed",
        confirmationId,
      );
      setNotice(
        operation.status === "completed"
          ? "Pagamento anterior reconciliado. Para registrar outro pagamento recebido, confirme explicitamente uma nova operação."
          : "Pagamento Pix de " +
              money(payment.amount) +
              " confirmado. Próxima cobrança: " +
              (payment.nextBillingDate
                ? new Date(payment.nextBillingDate).toLocaleDateString("pt-BR")
                : "a definir") +
              ".",
      );
      paymentConfirmationRef.current.delete(detail.id);
    } catch (caught) {
      const code = (caught as { code?: string }).code || "";
      const knownRejection =
        code === "P0001" || code.startsWith("23") || code === "42501";
      setDetailError(
        (knownRejection
          ? "Operação recusada pelo servidor: "
          : "Resultado incerto: ") +
          message(caught as Error) +
          " Nenhum novo identificador será criado enquanto esta tentativa estiver pendente. Tente novamente para reconciliar o resultado.",
      );
    } finally {
      paymentLockRef.current = false;
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
      await refreshAdminData();
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
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void selectCompany(company);
    }
  }

  function stopRow(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

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

      <div className="admin-overview-grid admin-billing-overview-grid">
        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Empresas</span>
            <b aria-hidden="true">▦</b>
          </div>
          <strong>{overview.currentCompanies}</strong>
          <small>de {overview.maxCompanies} vagas</small>
          <div
            className="admin-capacity-track"
            title={Math.round(capacity) + "% da capacidade utilizada"}
          >
            <i style={{ width: capacity + "%" }} />
          </div>
        </article>
        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>MRR estimado</span>
            <b aria-hidden="true">R$</b>
          </div>
          <strong>{money(billing.estimatedMrr)}</strong>
          <small>{billing.activeSubscriptions} assinaturas ativas</small>
        </article>
        <article className="admin-overview-card admin-money-positive">
          <div className="admin-overview-card-head">
            <span>Recebido no mês</span>
            <b aria-hidden="true">↗</b>
          </div>
          <strong>{money(billing.receivedThisMonth)}</strong>
          <small>Total histórico: {money(billing.receivedTotal)}</small>
        </article>
        <article className="admin-overview-card admin-money-negative">
          <div className="admin-overview-card-head">
            <span>Gastos no mês</span>
            <b aria-hidden="true">↘</b>
          </div>
          <strong>{money(billing.expensesThisMonth)}</strong>
          <small>Total registrado: {money(billing.expensesTotal)}</small>
        </article>
        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Resultado do mês</span>
            <b aria-hidden="true">＝</b>
          </div>
          <strong>{money(billing.netThisMonth)}</strong>
          <small>Receitas menos despesas da Horária</small>
        </article>
        <article className="admin-overview-card admin-money-warning">
          <div className="admin-overview-card-head">
            <span>A receber</span>
            <b aria-hidden="true">!</b>
          </div>
          <strong>{money(billing.receivableTotal)}</strong>
          <small>
            {billing.overdueCount} em atraso · {billing.pendingCount} pendentes
          </small>
        </article>
        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Vencem em 24h</span>
            <b aria-hidden="true">◷</b>
          </div>
          <strong>{billing.dueNext24hCount}</strong>
          <small>Tolerância configurada: {billing.graceHours}h</small>
        </article>
        <article className="admin-overview-card">
          <div className="admin-overview-card-head">
            <span>Suspensas</span>
            <b aria-hidden="true">×</b>
          </div>
          <strong>{billing.suspendedCount}</strong>
          <small>{billing.trialSubscriptions} em período inicial</small>
        </article>
      </div>

      <section
        className="admin-attention-panel"
        aria-labelledby="admin-attention-title"
      >
        <div className="admin-section-heading">
          <div>
            <span className="eyebrow">ACOMPANHAMENTO</span>
            <h2 id="admin-attention-title">Quem precisa de atenção?</h2>
            <p>Selecione um grupo para organizar seus próximos contatos.</p>
          </div>
        </div>
        <div className="admin-attention-grid">
          {adminQueues.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={queue === item.id}
              className={queue === item.id ? "is-active" : ""}
              onClick={() => {
                setQueue(item.id);
                setStatusFilter("ALL");
                setPage(1);
              }}
            >
              <span>{item.label}</span>
              <strong>{queueCounts[item.id] || 0}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="admin-companies-layout">
        <section className="panel admin-companies-list">
          <div className="admin-company-toolbar">
            <label className="admin-company-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Buscar empresa, responsável, e-mail, telefone ou página"
                placeholder="Empresa, responsável, e-mail, telefone ou página…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Todos</option>
                <option value="ACTIVE">Ativa</option>
                <option value="PAST_DUE">Pagamento pendente</option>
                <option value="SUSPENDED">Suspensa</option>
                <option value="TRIAL">Em teste</option>
                <option value="CANCELED">Cancelada</option>
                <option value="PENDING_DELETION">Aguardando exclusão</option>
              </select>
            </label>
            <label>
              <span>Ordenar por</span>
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as AdminSort);
                  setPage(1);
                }}
              >
                <option value="last_access">Último acesso</option>
                <option value="name">Nome</option>
                <option value="created">Cadastro mais recente</option>
                <option value="due">Vencimento mais próximo</option>
                <option value="amount_due">Maior valor em aberto</option>
                <option value="orders">Mais ordens de serviço</option>
              </select>
            </label>
          </div>

          <div className="admin-directory-summary">
            <p role="status">
              <strong>{companies.length}</strong> de {companyRows.length}{" "}
              empresas · <strong>{money(filteredAmount)}</strong> em aberto
              neste filtro
            </p>
            <div>
              <button type="button" className="outline" onClick={resetFilters}>
                Limpar filtros
              </button>
              <button
                type="button"
                className="primary"
                onClick={exportCompanies}
                disabled={!companies.length}
              >
                Exportar lista ({companies.length})
              </button>
            </div>
          </div>
          <div className="table-wrap admin-companies-table-wrap">
            <table className="admin-companies-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Responsável</th>
                  <th>Plano</th>
                  <th>Uso</th>
                  <th>Vencimento</th>
                  <th>Cobrança</th>
                  <th>Último acesso</th>
                  <th>Status</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visibleCompanies.map((company) => {
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
                        <strong>
                          {company.responsible || "Não informado"}
                        </strong>
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
                        <strong>
                          {company.dueAt ? relativeDate(company.dueAt) : "—"}
                        </strong>
                        <small>
                          {company.dueAt
                            ? fullDate(company.dueAt)
                            : "Sem vencimento"}
                        </small>
                      </td>
                      <td>
                        {Number(company.amountDue || 0) > 0 ? (
                          <>
                            <strong>{money(company.amountDue)}</strong>
                            <small>em aberto</small>
                          </>
                        ) : company.lastPaymentAt ? (
                          <>
                            <strong>Pago</strong>
                            <small>{fullDate(company.lastPaymentAt)}</small>
                          </>
                        ) : (
                          <>
                            <strong>Sem pagamento</strong>
                            <small>
                              {company.subscriptionStatus === "TRIAL"
                                ? "Período inicial"
                                : "Sem cobrança registrada"}
                            </small>
                          </>
                        )}
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
                          <summary aria-label={"Ações de " + company.name}>
                            ⋯
                          </summary>
                          <div>
                            <button
                              type="button"
                              disabled={actionBusy === company.id}
                              onClick={() => void companyAction(company)}
                            >
                              {["SUSPENDED", "CANCELED"].includes(
                                company.status,
                              )
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
          <nav
            className="admin-directory-pagination"
            aria-label="Páginas de empresas"
          >
            <span>
              Página {currentPage} de {totalPages}
            </span>
            <div>
              <button
                className="outline"
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </button>
              <button
                className="outline"
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Próxima
              </button>
            </div>
          </nav>
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

              <section className="admin-detail-section admin-company-contact">
                <h3>Contato e acesso</h3>
                <strong>
                  {detail.responsible || "Responsável não informado"}
                </strong>
                <p>
                  {detail.email || "E-mail não informado"}
                  <br />
                  {detail.phone || "Telefone não informado"}
                </p>
                <div className="admin-contact-actions">
                  <Link
                    className="outline"
                    href={`/admin/empresas/${detail.id}`}
                  >
                    Gestão completa
                  </Link>
                  <Link
                    className="outline"
                    href={"/" + encodeURIComponent(detail.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Página pública ↗
                  </Link>
                  <button
                    className="outline"
                    type="button"
                    onClick={() => void copyCompanyLink(detail.slug)}
                  >
                    Copiar link
                  </button>
                  {detail.email && (
                    <a
                      className="outline"
                      href={"mailto:" + encodeURIComponent(detail.email)}
                    >
                      E-mail
                    </a>
                  )}
                  {companyWhatsapp(detail.phone) && (
                    <a
                      className="outline"
                      href={companyWhatsapp(detail.phone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir WhatsApp ↗
                    </a>
                  )}
                </div>
              </section>

              <section
                id="admin-detail-invoices"
                className="admin-detail-section"
              >
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
                      Confirme somente depois de conferir o recebimento no
                      banco.
                    </small>
                    <button
                      type="button"
                      className="primary"
                      disabled={paymentBusy}
                      onClick={() => void confirmManualPayment()}
                    >
                      {paymentBusy ? "Confirmando…" : "Confirmar pagamento Pix"}
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
                  onChange={(event) => {
                    noteRevisionRef.current += 1;
                    noteDirtyRef.current = true;
                    setNote(event.target.value);
                  }}
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
      <section className="panel admin-platform-finance">
        <div className="admin-platform-finance-head">
          <div>
            <span className="eyebrow">FINANCEIRO DA HORÁRIA</span>
            <h2>Despesas da plataforma</h2>
            <p>
              Registre apenas custos da Horária, como domínio, infraestrutura e
              ferramentas.
            </p>
          </div>
          <strong>{money(billing.expensesThisMonth)} no mês</strong>
        </div>
        <div className="admin-expense-form">
          <input
            aria-label="Descrição da despesa"
            placeholder="Ex.: domínio, ferramenta, infraestrutura"
            value={expenseDescription}
            onChange={(event) => setExpenseDescription(event.target.value)}
          />
          <select
            aria-label="Categoria da despesa"
            value={expenseCategory}
            onChange={(event) => setExpenseCategory(event.target.value)}
          >
            <option>Infraestrutura</option>
            <option>Domínio</option>
            <option>Ferramentas</option>
            <option>Marketing</option>
            <option>Operação</option>
            <option>Outros</option>
          </select>
          <input
            aria-label="Valor da despesa"
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={expenseAmount}
            onChange={(event) => setExpenseAmount(event.target.value)}
          />
          <label>
            Data da despesa
            <input
              aria-label="Data da despesa"
              type="date"
              required
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
          </label>
          <label className="admin-expense-recurring">
            <input
              type="checkbox"
              checked={expenseRecurring}
              onChange={(event) => setExpenseRecurring(event.target.checked)}
            />
            Recorrente
          </label>
          <button
            className="primary"
            type="button"
            disabled={expenseBusy}
            onClick={() => void addPlatformExpense()}
          >
            {expenseBusy ? "Salvando…" : "Adicionar despesa"}
          </button>
        </div>
        <label className="admin-expense-note">
          Observação (opcional)
          <textarea
            value={expenseNotes}
            maxLength={2000}
            placeholder="Contexto ou referência desta despesa"
            onChange={(event) => setExpenseNotes(event.target.value)}
          />
        </label>
        <div className="admin-expense-list">
          {expenses.length ? (
            expenses
              .slice(0, showAllExpenses ? expenses.length : 8)
              .map((expense) => (
                <article key={expense.id}>
                  <div>
                    <strong>{expense.description}</strong>
                    <small>
                      {expense.category} ·{" "}
                      {new Date(
                        expense.incurredOn + "T12:00:00",
                      ).toLocaleDateString("pt-BR")}
                      {expense.recurring ? " · recorrente" : ""}
                    </small>
                  </div>
                  {expense.notes && (
                    <p className="admin-expense-context">{expense.notes}</p>
                  )}
                  <b>{money(expense.amount)}</b>
                  <button
                    type="button"
                    className="outline"
                    disabled={expenseBusy}
                    onClick={() => void deletePlatformExpense(expense)}
                  >
                    Excluir
                  </button>
                </article>
              ))
          ) : (
            <p className="admin-detail-muted">
              Nenhuma despesa da Horária registrada.
            </p>
          )}
        </div>
        {expenses.length > 8 && (
          <button
            type="button"
            className="outline admin-expense-toggle"
            onClick={() => setShowAllExpenses((value) => !value)}
          >
            {showAllExpenses
              ? "Mostrar menos"
              : `Ver ${expenses.length} despesas carregadas`}
          </button>
        )}
        {expenses.length >= 50 && (
          <p className="admin-detail-muted">
            Exibindo as 50 despesas mais recentes.
          </p>
        )}
      </section>
    </section>
  );
}
