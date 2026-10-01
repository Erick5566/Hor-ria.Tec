"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useWorkspace } from "./workspace";
import { type Lancamento, money, saveRow } from "@/lib/assistencia";
import { supabase, message, today } from "@/lib/supabase";
import {
  ErrorBox,
  Empty,
  MetricCard,
  MetricGrid,
  Pagination,
  PanelTitle,
} from "./ui";
import { HorariaIcon } from "./horaria-icon";
const DashboardFinance = dynamic(() => import("./dashboard-finance"), {
  loading: () => (
    <section className="finance-card">
      <p>Carregando resumo financeiro…</p>
    </section>
  ),
});

const originLabel: Record<"reparo" | "loja" | "seminovo" | "manual", string> = {
  reparo: "Reparos",
  loja: "Loja",
  seminovo: "Seminovos",
  manual: "Outros",
};

const originClass: Record<"reparo" | "loja" | "seminovo" | "manual", string> = {
  reparo: "repair",
  loja: "store",
  seminovo: "used",
  manual: "other",
};

type FinanceData = {
  page: number;
  pageSize: number;
  total: number;
  entries: Lancamento[];
  metrics: {
    revenue: number;
    expense: number;
    pendingRevenue: number;
    pendingCount: number;
    paidRevenueCount: number;
    finalizedOrders: number;
  };
  origins: {
    reparo: number;
    loja: number;
    seminovo: number;
    manual: number;
  };
  recent: Lancamento[];
  pending: Lancamento[];
  evolution: Array<{
    key: string;
    receita: number;
    despesa: number;
  }>;
};

type OrderOption = {
  id: string;
  numero: number;
};

export default function Finance({ ordemId }: { ordemId?: string }) {
  const { empresa } = useWorkspace();
  const [data, setData] = useState<FinanceData | null>(null);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orderOptions, setOrderOptions] = useState<OrderOption[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!supabase) return;
      if (!silent) setLoading(true);
      try {
        const result = await supabase.rpc("finance_overview_page", {
          p_page: page,
          p_page_size: 30,
          p_order_id: ordemId || null,
        });
        if (result.error) throw result.error;
        setData(result.data as FinanceData);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, ordemId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!supabase || !empresa.id) return;

    let timer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(true), 250);
    };

    let channel = supabase
      .channel(`finance-${empresa.id}-${ordemId || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "financeiro",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      );

    if (!ordemId) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ordens_servico",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      );
    }

    channel.subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, ordemId, load]);

  const loadOrderOptions = useCallback(async () => {
    if (ordemId || !supabase || orderOptions.length || ordersLoading) return;
    setOrdersLoading(true);
    try {
      const all: OrderOption[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await supabase
          .from("ordens_servico")
          .select("id,numero")
          .eq("empresa_id", empresa.id)
          .order("numero", { ascending: false })
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        all.push(...((result.data || []) as OrderOption[]));
        if ((result.data || []).length < 1000) break;
      }
      setOrderOptions(all);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setOrdersLoading(false);
    }
  }, [ordemId, empresa.id, orderOptions.length, ordersLoading]);

  function openNewLaunch() {
    setAdding(true);
    void loadOrderOptions();
  }

  const metrics = data?.metrics;
  const receita = Number(metrics?.revenue || 0);
  const despesa = Number(metrics?.expense || 0);
  const saldo = receita - despesa;
  const paidRevenueCount = metrics?.paidRevenueCount || 0;
  const ticket = paidRevenueCount ? receita / paidRevenueCount : 0;

  const origins = (["reparo", "loja", "seminovo", "manual"] as const).map(
    (origin) => ({
      origin,
      value: Number(data?.origins?.[origin] || 0),
    }),
  );
  const originTotal = origins.reduce((total, item) => total + item.value, 0);

  const evolution = useMemo(
    () =>
      (data?.evolution || []).map((item) => ({
        ...item,
        label: new Date(item.key + "T12:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
      })),
    [data?.evolution],
  );

  const maxEvolution = Math.max(
    1,
    ...evolution.flatMap((item) => [item.receita, item.despesa]),
  );
  const points = (key: "receita" | "despesa") =>
    evolution
      .map((item, index) => {
        const x = (index / Math.max(1, evolution.length - 1)) * 100;
        const y = 92 - (item[key] / maxEvolution) * 78;
        return `${x},${y}`;
      })
      .join(" ");
  const chartRevenue = evolution.reduce(
    (sum, item) => sum + Number(item.receita || 0),
    0,
  );
  const chartExpense = evolution.reduce(
    (sum, item) => sum + Number(item.despesa || 0),
    0,
  );

  const donut = originTotal
    ? (() => {
        let cursor = 0;
        const parts = origins.map((item) => {
          const start = cursor;
          cursor += (item.value / originTotal) * 100;
          const css =
            item.origin === "reparo"
              ? "#68b5e4"
              : item.origin === "loja"
                ? "#3a4da1"
                : item.origin === "seminovo"
                  ? "#8d9ce4"
                  : "#7d879c";
          return `${css} ${start}% ${cursor}%`;
        });
        return `conic-gradient(${parts.join(",")})`;
      })()
    : "conic-gradient(#30384a 0 100%)";

  async function pay(item: Lancamento) {
    setBusy(true);
    setError("");
    try {
      const result = await supabase!
        .from("financeiro")
        .update({ status: "pago", pago_em: today() })
        .eq("id", item.id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await load(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  const entries = data?.entries || [];
  const recent = data?.recent || [];
  const pending = data?.pending || [];
  const currentDate = today();
  const margin = receita > 0 ? (saldo / receita) * 100 : 0;
  const expenseShare =
    receita > 0
      ? Math.min(100, (despesa / receita) * 100)
      : despesa > 0
        ? 100
        : 0;
  const topOrigin = origins.reduce(
    (best, item) => (item.value > best.value ? item : best),
    origins[0],
  );
  const topOriginPercent =
    originTotal && topOrigin
      ? Math.round((topOrigin.value / originTotal) * 100)
      : 0;

  function exportEntries() {
    if (!entries.length) return;
    const rows = [
      ["Descrição", "Tipo", "Valor", "Vencimento", "Status"],
      ...entries.map((item) => [
        item.descricao,
        item.tipo,
        String(item.valor).replace(".", ","),
        item.vencimento,
        item.status,
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `horaria-financeiro-${today()}-pagina-${page}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={ordemId ? "" : "finance-dashboard"}>
      <ErrorBox error={error} />

      {!ordemId && <DashboardFinance onNewLaunch={openNewLaunch} />}

      <section
        className={ordemId ? "panel" : "finance-card finance-entry-card"}
      >
        <div className="panel-head">
          <div>
            <PanelTitle
              title="Lançamentos"
              icon="receipt"
              subtitle={
                !ordemId ? "Controle manual de entradas e saídas." : undefined
              }
            />
          </div>
          <button
            className="primary"
            onClick={() => {
              if (adding) setAdding(false);
              else openNewLaunch();
            }}
          >
            {adding ? "Fechar" : "+ Novo lançamento"}
          </button>
        </div>

        {adding && (
          <form
            className="finance-entry-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget);
              try {
                await saveRow("financeiro", {
                  empresa_id: empresa.id,
                  ordem_id: ordemId || form.get("ordem") || null,
                  descricao: form.get("descricao"),
                  tipo: form.get("tipo"),
                  valor: Number(form.get("valor")),
                  vencimento: form.get("vencimento"),
                  status: form.get("pago") === "on" ? "pago" : "pendente",
                  pago_em: form.get("pago") === "on" ? today() : null,
                  origem:
                    form.get("tipo") === "despesa"
                      ? "despesa"
                      : ordemId || form.get("ordem")
                        ? "reparo"
                        : "manual",
                });
                setAdding(false);
                setPage(1);
                await load(true);
              } catch (caught) {
                setError(message(caught as Error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="finance-entry-intro">
              <span aria-hidden="true">
                <HorariaIcon name="receipt" />
              </span>
              <div>
                <strong>Novo lançamento financeiro</strong>
                <small>
                  Registre uma entrada ou saída e escolha se ela já foi paga.
                </small>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Descrição
                <input
                  name="descricao"
                  required
                  minLength={2}
                  maxLength={300}
                />
              </label>
              <label>
                Tipo
                <select name="tipo">
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </label>
              <label>
                Valor
                <input
                  name="valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Vencimento
                <input
                  name="vencimento"
                  type="date"
                  defaultValue={today()}
                  required
                />
              </label>
              {!ordemId && (
                <label>
                  Ordem (opcional)
                  <select name="ordem" disabled={ordersLoading}>
                    <option value="">
                      {ordersLoading ? "Carregando ordens..." : "Sem vínculo"}
                    </option>
                    {orderOptions.map((order) => (
                      <option key={order.id} value={order.id}>
                        OS #{order.numero}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="check-label">
                <input type="checkbox" name="pago" />
                Já recebido / pago hoje
              </label>
            </div>
            <button disabled={busy} className="primary">
              Salvar lançamento
            </button>
          </form>
        )}

        {loading && !data ? (
          <p>Carregando…</p>
        ) : !entries.length ? (
          <Empty title="Nenhum lançamento cadastrado" />
        ) : (
          <>
            <div className="table-scroll finance-table">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((item) => {
                    const overdue =
                      item.status === "pendente" &&
                      item.vencimento < currentDate;
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong className="finance-table-description">
                            {item.descricao}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`finance-type-pill ${
                              item.tipo === "receita" ? "income" : "expense"
                            }`}
                          >
                            {item.tipo === "receita" ? "Receita" : "Despesa"}
                          </span>
                        </td>
                        <td>
                          <strong
                            className={
                              item.tipo === "receita" ? "money-in" : "money-out"
                            }
                          >
                            {item.tipo === "receita" ? "+" : "-"}{" "}
                            {money(item.valor)}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={overdue ? "finance-date-overdue" : ""}
                          >
                            {item.vencimento.split("-").reverse().join("/")}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`finance-status-pill ${
                              item.status === "pago"
                                ? "paid"
                                : overdue
                                  ? "overdue"
                                  : "pending"
                            }`}
                          >
                            {item.status === "pago"
                              ? "Pago"
                              : overdue
                                ? "Vencido"
                                : "Pendente"}
                          </span>
                        </td>
                        <td>
                          {item.status === "pendente" ? (
                            <button
                              type="button"
                              className="finance-table-action"
                              disabled={busy}
                              onClick={() => pay(item)}
                            >
                              Registrar{" "}
                              {item.tipo === "receita"
                                ? "recebimento"
                                : "pagamento"}
                            </button>
                          ) : (
                            <span className="finance-paid-date">
                              {item.pago_em?.split("-").reverse().join("/") ||
                                "Pago"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data?.page || page}
              pageSize={data?.pageSize || 30}
              total={data?.total || 0}
              onPageChange={setPage}
            />
          </>
        )}
        <p className="hint">
          Registre movimentações realizadas ou previstas. A Horária não processa
          pagamentos.
        </p>
      </section>
    </div>
  );
}
