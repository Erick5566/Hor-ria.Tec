"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./workspace";
import {
  type Lancamento,
  money,
  saveRow,
} from "@/lib/assistencia";
import { supabase, message, today } from "@/lib/supabase";
import { ErrorBox, Empty, Pagination } from "./ui";

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
  }, [
    ordemId,
    empresa.id,
    orderOptions.length,
    ordersLoading,
  ]);

  function openNewLaunch() {
    setAdding(true);
    void loadOrderOptions();
  }

  const metrics = data?.metrics;
  const receita = Number(metrics?.revenue || 0);
  const despesa = Number(metrics?.expense || 0);
  const saldo = receita - despesa;
  const pendingRevenue = Number(metrics?.pendingRevenue || 0);
  const paidRevenueCount = metrics?.paidRevenueCount || 0;
  const ticket = paidRevenueCount ? receita / paidRevenueCount : 0;

  const origins = (
    ["reparo", "loja", "seminovo", "manual"] as const
  ).map((origin) => ({
    origin,
    value: Number(data?.origins?.[origin] || 0),
  }));
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
    const result = await supabase!
      .from("financeiro")
      .update({ status: "pago", pago_em: today() })
      .eq("id", item.id)
      .select("id")
      .single();
    if (result.error) setError(message(result.error));
    else await load(true);
    setBusy(false);
  }

  const entries = data?.entries || [];
  const recent = data?.recent || [];
  const pending = data?.pending || [];

  return (
    <div className={ordemId ? "" : "finance-dashboard"}>
      <ErrorBox error={error} />

      {!ordemId && (
        <>
          <div className="finance-kpis">
            <article>
              <span>Receita do período</span>
              <strong>{loading && !data ? "—" : money(receita)}</strong>
              <small>Valores recebidos</small>
            </article>
            <article>
              <span>Despesas</span>
              <strong>{loading && !data ? "—" : money(despesa)}</strong>
              <small>Pagamentos realizados</small>
            </article>
            <article>
              <span>Lucro / saldo</span>
              <strong>{loading && !data ? "—" : money(saldo)}</strong>
              <small>Receitas menos despesas</small>
            </article>
            <article>
              <span>Ticket médio</span>
              <strong>{loading && !data ? "—" : money(ticket)}</strong>
              <small>Por recebimento</small>
            </article>
            <article>
              <span>A receber</span>
              <strong>{loading && !data ? "—" : money(pendingRevenue)}</strong>
              <small>{metrics?.pendingCount || 0} títulos pendentes</small>
            </article>
            <article>
              <span>Ordens finalizadas</span>
              <strong>{loading && !data ? "—" : metrics?.finalizedOrders || 0}</strong>
              <small>Total concluído</small>
            </article>
          </div>

          <div className="finance-chart-grid">
            <section className="finance-card finance-origin-card">
              <div className="finance-card-head">
                <div>
                  <h2>Origem do faturamento</h2>
                  <p>Veja de onde vem sua receita.</p>
                </div>
                <span className="finance-period">Período atual</span>
              </div>
              <div className="finance-donut-layout">
                <div className="finance-donut" style={{ background: donut }}>
                  <div>
                    <strong>{money(originTotal)}</strong>
                    <small>Total recebido</small>
                  </div>
                </div>
                <div className="finance-legend">
                  {origins.map((item) => {
                    const percent = originTotal
                      ? Math.round((item.value / originTotal) * 100)
                      : 0;
                    return (
                      <div key={item.origin}>
                        <span
                          className={"legend-dot " + originClass[item.origin]}
                        />
                        <b>{originLabel[item.origin]}</b>
                        <em>{percent}%</em>
                        <strong>{money(item.value)}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="finance-card finance-evolution-card">
              <div className="finance-card-head">
                <div>
                  <h2>Evolução financeira</h2>
                  <p>Receitas e despesas dos últimos 14 dias.</p>
                </div>
                <div className="finance-line-legend">
                  <span><i className="income" /> Receita</span>
                  <span><i className="outcome" /> Despesas</span>
                </div>
              </div>
              <div className="finance-line-chart">
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-label="Gráfico de evolução financeira"
                >
                  <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#68b5e4" stopOpacity=".35" />
                      <stop offset="100%" stopColor="#68b5e4" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[20, 40, 60, 80].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      x2="100"
                      y1={y}
                      y2={y}
                      className="grid-line"
                    />
                  ))}
                  <polygon
                    points={"0,92 " + points("receita") + " 100,92"}
                    fill="url(#incomeFill)"
                  />
                  <polyline points={points("receita")} className="income-line" />
                  <polyline points={points("despesa")} className="expense-line" />
                </svg>
                <div className="finance-axis">
                  {evolution
                    .filter((_, index) => index % 3 === 0)
                    .map((item) => (
                      <span key={item.key}>{item.label}</span>
                    ))}
                </div>
              </div>
            </section>
          </div>

          <div className="finance-lower-grid">
            <section className="finance-card">
              <div className="finance-card-head">
                <div>
                  <h2>Últimas movimentações</h2>
                  <p>Entradas e saídas registradas recentemente.</p>
                </div>
                <button className="finance-ghost" onClick={openNewLaunch}>
                  + Novo lançamento
                </button>
              </div>
              <div className="finance-movements">
                {recent.map((item) => (
                  <div key={item.id}>
                    <span
                      className={
                        item.tipo === "receita"
                          ? "movement-icon in"
                          : "movement-icon out"
                      }
                    >
                      {item.tipo === "receita" ? "↗" : "↘"}
                    </span>
                    <div>
                      <strong>{item.descricao}</strong>
                      <small>
                        {item.pago_em
                          ? item.pago_em.split("-").reverse().join("/")
                          : "Vence " +
                            item.vencimento.split("-").reverse().join("/")}
                      </small>
                    </div>
                    <b
                      className={
                        item.tipo === "receita" ? "money-in" : "money-out"
                      }
                    >
                      {item.tipo === "receita" ? "+" : "-"} {money(item.valor)}
                    </b>
                  </div>
                ))}
                {!recent.length && <Empty title="Nenhuma movimentação ainda." />}
              </div>
            </section>

            <section className="finance-card">
              <div className="finance-card-head">
                <div>
                  <h2>Receitas x despesas</h2>
                  <p>Distribuição do valor realizado.</p>
                </div>
              </div>
              <div className="finance-balance-ring">
                <div
                  className="finance-donut small"
                  style={{
                    background:
                      receita + despesa > 0
                        ? `conic-gradient(#68b5e4 0 ${
                            (receita / (receita + despesa)) * 100
                          }%, #9a6070 ${
                            (receita / (receita + despesa)) * 100
                          }% 100%)`
                        : "conic-gradient(#30384a 0 100%)",
                  }}
                >
                  <div>
                    <strong>{money(receita + despesa)}</strong>
                    <small>Movimentado</small>
                  </div>
                </div>
                <div className="finance-balance-summary">
                  <div>
                    <span className="legend-dot repair" />
                    <b>Receitas</b>
                    <strong>{money(receita)}</strong>
                  </div>
                  <div>
                    <span className="legend-dot expense" />
                    <b>Despesas</b>
                    <strong>{money(despesa)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="finance-card">
              <div className="finance-card-head">
                <div>
                  <h2>Contas a receber</h2>
                  <p>Receitas ainda pendentes.</p>
                </div>
              </div>
              <div className="finance-pending">
                {pending.map((item) => (
                  <div key={item.id}>
                    <div>
                      <strong>{item.descricao}</strong>
                      <small>
                        Vence {item.vencimento.split("-").reverse().join("/")}
                      </small>
                    </div>
                    <b>{money(item.valor)}</b>
                  </div>
                ))}
                {!pending.length && <Empty title="Nenhuma conta pendente." />}
              </div>
            </section>
          </div>
        </>
      )}

      <section className={ordemId ? "panel" : "finance-card finance-entry-card"}>
        <div className="panel-head">
          <div>
            <h2>Lançamentos</h2>
            {!ordemId && <p>Controle manual de entradas e saídas.</p>}
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
            <div className="form-grid">
              <label>
                Descrição
                <input name="descricao" required minLength={2} maxLength={300} />
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
                  {entries.map((item) => (
                    <tr key={item.id}>
                      <td>{item.descricao}</td>
                      <td>{item.tipo}</td>
                      <td>{money(item.valor)}</td>
                      <td>{item.vencimento.split("-").reverse().join("/")}</td>
                      <td>{item.status}</td>
                      <td>
                        {item.status === "pendente" ? (
                          <button disabled={busy} onClick={() => pay(item)}>
                            Registrar{" "}
                            {item.tipo === "receita"
                              ? "recebimento"
                              : "pagamento"}
                          </button>
                        ) : (
                          item.pago_em?.split("-").reverse().join("/")
                        )}
                      </td>
                    </tr>
                  ))}
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
