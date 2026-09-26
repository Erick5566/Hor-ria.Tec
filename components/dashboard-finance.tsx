"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace";
import { HorariaIcon, type HorariaIconName } from "@/components/horaria-icon";
import { ErrorBox } from "@/components/ui";
import { money, type Lancamento } from "@/lib/assistencia";
import { message, supabase, today } from "@/lib/supabase";

type FinanceCategory = "all" | "reparo" | "loja" | "seminovo" | "manual";

type OrderDetail = {
  numero: number;
  clienteNome: string;
  tecnico: string;
};

const categoryOptions: Array<{ value: FinanceCategory; label: string }> = [
  { value: "all", label: "Todas as categorias" },
  { value: "reparo", label: "Reparos" },
  { value: "loja", label: "Loja" },
  { value: "seminovo", label: "Seminovos" },
  { value: "manual", label: "Outros" },
];

const originLabel: Record<string, string> = {
  reparo: "Reparos",
  loja: "Loja",
  seminovo: "Seminovos",
  manual: "Outros",
  despesa: "Despesas",
};

function shiftDate(value: string, days: number) {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  return new Date(value + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function rowDate(item: Lancamento) {
  return item.pago_em || item.vencimento;
}

function percentageDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function Variation({
  value,
  period,
  inverse = false,
}: {
  value: number | null;
  period: number;
  inverse?: boolean;
}) {
  if (value == null) {
    return (
      <div className="dashboard-finance-variation neutral">
        <span>—</span>
        <small>sem base anterior para comparar</small>
      </div>
    );
  }

  const improved = inverse ? value <= 0 : value >= 0;
  const arrow = value >= 0 ? "↗" : "↘";

  return (
    <div
      className={
        "dashboard-finance-variation " + (improved ? "positive" : "negative")
      }
    >
      <span>
        {arrow} {value >= 0 ? "+" : ""}
        {value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      </span>
      <small>em relação aos {period} dias anteriores</small>
    </div>
  );
}

function FinanceMetricCard({
  title,
  value,
  icon,
  tone,
  variation,
  period,
  inverseVariation = false,
}: {
  title: string;
  value: string;
  icon: HorariaIconName;
  tone: "green" | "red" | "blue" | "purple";
  variation: number | null;
  period: number;
  inverseVariation?: boolean;
}) {
  return (
    <article className={"dashboard-finance-metric " + tone}>
      <div className="dashboard-finance-metric-head">
        <span className="dashboard-finance-metric-icon" aria-hidden="true">
          <HorariaIcon name={icon} />
        </span>
        <strong>{title}</strong>
        <button type="button" aria-label={"Mais opções de " + title}>
          ⋮
        </button>
      </div>
      <b>{value}</b>
      <Variation
        value={variation}
        period={period}
        inverse={inverseVariation}
      />
    </article>
  );
}

export default function DashboardFinance() {
  const { empresa } = useWorkspace();
  const [rows, setRows] = useState<Lancamento[]>([]);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>(
    {},
  );
  const [period, setPeriod] = useState(14);
  const [category, setCategory] = useState<FinanceCategory>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!supabase || !empresa.id) return;
      if (!silent) setLoading(true);

      try {
        const financeResult = await supabase
          .from("financeiro")
          .select(
            "id,empresa_id,ordem_id,descricao,tipo,valor,status,vencimento,pago_em,origem,venda_id",
          )
          .eq("empresa_id", empresa.id)
          .order("vencimento", { ascending: false })
          .limit(1000);

        if (financeResult.error) throw financeResult.error;

        const financeRows = (financeResult.data || []) as Lancamento[];
        setRows(financeRows);

        const orderIds = Array.from(
          new Set(
            financeRows
              .slice(0, 100)
              .map((item) => item.ordem_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        if (!orderIds.length) {
          setOrderDetails({});
          setError("");
          return;
        }

        const orderResult = await supabase
          .from("ordens_servico")
          .select("id,numero,cliente_id,tecnico")
          .eq("empresa_id", empresa.id)
          .in("id", orderIds);

        if (orderResult.error) {
          setOrderDetails({});
          setError("");
          return;
        }

        const orders = (orderResult.data || []) as Array<{
          id: string;
          numero: number;
          cliente_id: string;
          tecnico: string | null;
        }>;

        const clientIds = Array.from(
          new Set(orders.map((item) => item.cliente_id).filter(Boolean)),
        );

        let clients: Array<{ id: string; nome: string }> = [];
        if (clientIds.length) {
          const clientResult = await supabase
            .from("clientes")
            .select("id,nome")
            .eq("empresa_id", empresa.id)
            .in("id", clientIds);
          if (!clientResult.error) {
            clients = (clientResult.data || []) as Array<{
              id: string;
              nome: string;
            }>;
          }
        }

        const clientName = new Map(clients.map((item) => [item.id, item.nome]));
        const details: Record<string, OrderDetail> = {};

        orders.forEach((item) => {
          details[item.id] = {
            numero: item.numero,
            clienteNome: clientName.get(item.cliente_id) || "",
            tecnico: item.tecnico || "",
          };
        });

        setOrderDetails(details);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [empresa.id],
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

    const channel = supabase
      .channel("dashboard-finance-" + empresa.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "financeiro",
          filter: "empresa_id=eq." + empresa.id,
        },
        refreshSoon,
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, load]);

  const end = today();
  const currentStart = shiftDate(end, -(period - 1));
  const previousEnd = shiftDate(currentStart, -1);
  const previousStart = shiftDate(previousEnd, -(period - 1));

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (item) => category === "all" || item.origem === category,
      ),
    [rows, category],
  );

  const currentPaid = useMemo(
    () =>
      filteredRows.filter((item) => {
        if (item.status !== "pago") return false;
        const key = rowDate(item);
        return key >= currentStart && key <= end;
      }),
    [filteredRows, currentStart, end],
  );

  const previousPaid = useMemo(
    () =>
      filteredRows.filter((item) => {
        if (item.status !== "pago") return false;
        const key = rowDate(item);
        return key >= previousStart && key <= previousEnd;
      }),
    [filteredRows, previousStart, previousEnd],
  );

  const summarize = (items: Lancamento[]) => {
    const revenue = items
      .filter((item) => item.tipo === "receita")
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const expense = items
      .filter((item) => item.tipo === "despesa")
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);
    return {
      revenue,
      expense,
      balance: revenue - expense,
      profit: revenue - expense,
    };
  };

  const current = summarize(currentPaid);
  const previous = summarize(previousPaid);

  const days = useMemo(
    () =>
      Array.from({ length: period }, (_, index) =>
        shiftDate(currentStart, index),
      ),
    [period, currentStart],
  );

  const chartData = useMemo(
    () =>
      days.map((key) => {
        const dayRows = currentPaid.filter((item) => rowDate(item) === key);
        const revenue = dayRows
          .filter((item) => item.tipo === "receita")
          .reduce((sum, item) => sum + Number(item.valor || 0), 0);
        const expense = dayRows
          .filter((item) => item.tipo === "despesa")
          .reduce((sum, item) => sum + Number(item.valor || 0), 0);
        return { key, revenue, expense };
      }),
    [days, currentPaid],
  );

  const chartMax = Math.max(
    1,
    ...chartData.flatMap((item) => [item.revenue, item.expense]),
  );

  const linePoints = (key: "revenue" | "expense") =>
    chartData
      .map((item, index) => {
        const x =
          chartData.length === 1
            ? 50
            : (index / Math.max(1, chartData.length - 1)) * 100;
        const y = 88 - (item[key] / chartMax) * 72;
        return x.toFixed(2) + "," + y.toFixed(2);
      })
      .join(" ");

  const axisEvery = Math.max(1, Math.ceil(period / 6));

  const distributionBase =
    current.revenue + current.expense + Math.max(current.profit, 0);
  const revenuePercent = distributionBase
    ? (current.revenue / distributionBase) * 100
    : 0;
  const expensePercent = distributionBase
    ? (current.expense / distributionBase) * 100
    : 0;
  const profitPercent = distributionBase
    ? (Math.max(current.profit, 0) / distributionBase) * 100
    : 0;

  const donutBackground = distributionBase
    ? "conic-gradient(#20b26b 0 " +
      revenuePercent +
      "%, #ef4d57 " +
      revenuePercent +
      "% " +
      (revenuePercent + expensePercent) +
      "%, #2f80ed " +
      (revenuePercent + expensePercent) +
      "% 100%)"
    : "conic-gradient(#e8edf5 0 100%)";

  const margin =
    current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0;
  const progressWidth = Math.max(0, Math.min(100, margin));

  const latestEntries = useMemo(
    () =>
      filteredRows
        .filter((item) => {
          const key = rowDate(item);
          return key >= currentStart && key <= end;
        })
        .slice()
        .sort((a, b) => rowDate(b).localeCompare(rowDate(a)))
        .slice(0, 6),
    [filteredRows, currentStart, end],
  );

  return (
    <section
      className="dashboard-finance-reference"
      aria-label="Resumo financeiro do painel"
    >
      <ErrorBox error={error} />

      <div className="dashboard-finance-toolbar">
        <div className="dashboard-finance-toolbar-copy">
          <span className="dashboard-finance-toolbar-icon" aria-hidden="true">
            <HorariaIcon name="finance" />
          </span>
          <div>
            <strong>Financeiro</strong>
            <small>Receitas, despesas e caixa no mesmo resumo.</small>
          </div>
        </div>

        <div className="dashboard-finance-filters">
          <label>
            <span className="sr-only">Período financeiro</span>
            <HorariaIcon name="calendar" />
            <select
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value))}
              aria-label="Período financeiro"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
          </label>

          <label>
            <span className="sr-only">Categoria financeira</span>
            <HorariaIcon name="category" />
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as FinanceCategory)
              }
              aria-label="Categoria financeira"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <Link
            className="dashboard-finance-new"
            href="/painel/financeiro"
            aria-label="Ir para o financeiro e criar novo lançamento"
          >
            <span aria-hidden="true">＋</span>
            Novo lançamento
          </Link>
        </div>
      </div>

      <div className="dashboard-finance-metrics">
        <FinanceMetricCard
          title="Receitas"
          value={loading ? "—" : money(current.revenue)}
          icon="trend"
          tone="green"
          variation={percentageDelta(current.revenue, previous.revenue)}
          period={period}
        />
        <FinanceMetricCard
          title="Despesas"
          value={loading ? "—" : money(current.expense)}
          icon="receipt"
          tone="red"
          variation={percentageDelta(current.expense, previous.expense)}
          period={period}
          inverseVariation
        />
        <FinanceMetricCard
          title="Saldo do período"
          value={loading ? "—" : money(current.balance)}
          icon="finance"
          tone="blue"
          variation={percentageDelta(current.balance, previous.balance)}
          period={period}
        />
        <FinanceMetricCard
          title="Lucro líquido"
          value={loading ? "—" : money(current.profit)}
          icon="reports"
          tone="purple"
          variation={percentageDelta(current.profit, previous.profit)}
          period={period}
        />
      </div>

      <div className="dashboard-finance-charts">
        <article className="dashboard-finance-card dashboard-finance-line-card">
          <div className="dashboard-finance-card-head">
            <div>
              <span className="dashboard-finance-card-icon green" aria-hidden="true">
                <HorariaIcon name="trend" />
              </span>
              <strong>Receitas x Despesas</strong>
            </div>
            <span>Últimos {period} dias</span>
          </div>

          <div className="dashboard-finance-legend">
            <span><i className="revenue" /> Receitas</span>
            <span><i className="expense" /> Despesas</span>
          </div>

          <div className="dashboard-finance-line-chart">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label="Receitas e despesas no período"
            >
              <defs>
                <linearGradient id="dashboardRevenueArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#20b26b" stopOpacity=".18" />
                  <stop offset="100%" stopColor="#20b26b" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="dashboardExpenseArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4d57" stopOpacity=".14" />
                  <stop offset="100%" stopColor="#ef4d57" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[18, 36, 54, 72, 90].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="100"
                  y1={y}
                  y2={y}
                  className="grid"
                />
              ))}
              <polygon
                points={"0,90 " + linePoints("revenue") + " 100,90"}
                fill="url(#dashboardRevenueArea)"
              />
              <polygon
                points={"0,90 " + linePoints("expense") + " 100,90"}
                fill="url(#dashboardExpenseArea)"
              />
              <polyline
                points={linePoints("revenue")}
                className="revenue-line"
              />
              <polyline
                points={linePoints("expense")}
                className="expense-line"
              />
            </svg>
            <div className="dashboard-finance-axis">
              {chartData
                .filter(
                  (_, index) =>
                    index % axisEvery === 0 || index === chartData.length - 1,
                )
                .map((item) => (
                  <span key={item.key}>{formatShortDate(item.key)}</span>
                ))}
            </div>
          </div>
        </article>

        <article className="dashboard-finance-card dashboard-finance-flow-card">
          <div className="dashboard-finance-card-head">
            <div>
              <span className="dashboard-finance-card-icon blue" aria-hidden="true">
                <HorariaIcon name="finance" />
              </span>
              <strong>Fluxo de caixa</strong>
            </div>
            <span>Últimos {period} dias</span>
          </div>

          <div className="dashboard-finance-legend">
            <span><i className="revenue" /> Entradas</span>
            <span><i className="expense" /> Saídas</span>
          </div>

          <div
            className="dashboard-finance-bars"
            role="img"
            aria-label="Entradas e saídas por dia"
          >
            {chartData.map((item, index) => (
              <div className="dashboard-finance-bar-day" key={item.key}>
                <div>
                  <i
                    className="revenue"
                    style={{
                      height:
                        Math.max(
                          item.revenue > 0 ? 4 : 0,
                          (item.revenue / chartMax) * 100,
                        ) + "%",
                    }}
                  />
                  <i
                    className="expense"
                    style={{
                      height:
                        Math.max(
                          item.expense > 0 ? 4 : 0,
                          (item.expense / chartMax) * 100,
                        ) + "%",
                    }}
                  />
                </div>
                {(index % axisEvery === 0 ||
                  index === chartData.length - 1) && (
                  <small>{formatShortDate(item.key)}</small>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-finance-card dashboard-finance-summary-card">
          <div className="dashboard-finance-card-head">
            <div>
              <span className="dashboard-finance-card-icon purple" aria-hidden="true">
                <HorariaIcon name="donut" />
              </span>
              <strong>Resumo financeiro</strong>
            </div>
            <span>Últimos {period} dias</span>
          </div>

          <div className="dashboard-finance-summary">
            <div
              className="dashboard-finance-donut"
              style={{ background: donutBackground }}
              aria-label="Distribuição financeira"
            >
              <div>
                <strong>{money(current.revenue)}</strong>
                <small>Total</small>
              </div>
            </div>

            <div className="dashboard-finance-summary-legend">
              <div>
                <i className="revenue" />
                <span>Receitas</span>
                <strong>{revenuePercent.toFixed(1)}%</strong>
              </div>
              <div>
                <i className="expense" />
                <span>Despesas</span>
                <strong>{expensePercent.toFixed(1)}%</strong>
              </div>
              <div>
                <i className="profit" />
                <span>Lucro líquido</span>
                <strong>{profitPercent.toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          <div className="dashboard-finance-margin">
            <div>
              <span>
                <HorariaIcon name="reports" />
                Margem de lucro
              </span>
              <strong>{margin.toFixed(1)}%</strong>
            </div>
            <div className="dashboard-finance-margin-track" aria-hidden="true">
              <i style={{ width: progressWidth + "%" }} />
            </div>
          </div>
        </article>
      </div>

      <article className="dashboard-finance-card dashboard-finance-table-card">
        <div className="dashboard-finance-card-head">
          <div>
            <span className="dashboard-finance-card-icon blue" aria-hidden="true">
              <HorariaIcon name="receipt" />
            </span>
            <strong>Últimos lançamentos</strong>
          </div>
          <Link href="/painel/financeiro">Ver todos ›</Link>
        </div>

        <div className="dashboard-finance-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Cliente / Profissional</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {latestEntries.map((item) => {
                const detail = item.ordem_id
                  ? orderDetails[item.ordem_id]
                  : undefined;
                const overdue =
                  item.status === "pendente" && item.vencimento < end;
                return (
                  <tr key={item.id}>
                    <td>{formatShortDate(rowDate(item))}</td>
                    <td>
                      <strong>{item.descricao}</strong>
                      {detail && <small>OS #{detail.numero}</small>}
                    </td>
                    <td>{originLabel[item.origem] || "Outros"}</td>
                    <td>
                      {detail?.clienteNome || detail?.tecnico || "—"}
                    </td>
                    <td>
                      <span
                        className={
                          "dashboard-finance-type " +
                          (item.tipo === "receita" ? "revenue" : "expense")
                        }
                      >
                        {item.tipo === "receita" ? "↗ Receita" : "↘ Despesa"}
                      </span>
                    </td>
                    <td>
                      <b
                        className={
                          item.tipo === "receita" ? "money-in" : "money-out"
                        }
                      >
                        {item.tipo === "receita" ? "+" : "-"} {money(item.valor)}
                      </b>
                    </td>
                    <td>
                      <span
                        className={
                          "dashboard-finance-status " +
                          (item.status === "pago"
                            ? "paid"
                            : overdue
                              ? "overdue"
                              : "pending")
                        }
                      >
                        {item.status === "pago"
                          ? "Pago"
                          : overdue
                            ? "Atrasado"
                            : "Pendente"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && !latestEntries.length && (
                <tr>
                  <td colSpan={7} className="dashboard-finance-empty">
                    Nenhum lançamento neste período.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="dashboard-finance-empty">
                    Carregando financeiro…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
