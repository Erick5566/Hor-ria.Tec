"use client";
import { useMemo, useState } from "react";
import { useWorkspace } from "./workspace";
import { Lancamento, Ordem, money, useRows, saveRow } from "@/lib/assistencia";
import { supabase, message, today } from "@/lib/supabase";
import { ErrorBox, Empty } from "./ui";

const originLabel: Record<Lancamento["origem"], string> = {
  reparo: "Reparos",
  loja: "Loja",
  seminovo: "Seminovos",
  manual: "Outros",
  despesa: "Despesas",
};

const originClass: Record<Lancamento["origem"], string> = {
  reparo: "repair",
  loja: "store",
  seminovo: "used",
  manual: "other",
  despesa: "expense",
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function Finance({ ordemId }: { ordemId?: string }) {
  const { empresa } = useWorkspace(),
    entries = useRows<Lancamento>("financeiro"),
    orders = useRows<Ordem>("ordens_servico");

  const [adding, setAdding] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  const data = useMemo(
    () => entries.data.filter((item) => !ordemId || item.ordem_id === ordemId),
    [entries.data, ordemId],
  );

  const paid = data.filter((item) => item.status === "pago");
  const sum = (type: Lancamento["tipo"]) =>
    paid
      .filter((item) => item.tipo === type)
      .reduce((total, item) => total + Number(item.valor), 0);

  const receita = sum("receita");
  const despesa = sum("despesa");
  const saldo = receita - despesa;
  const pendingRevenue = data
    .filter((item) => item.tipo === "receita" && item.status === "pendente")
    .reduce((total, item) => total + Number(item.valor), 0);
  const paidRevenueCount = paid.filter((item) => item.tipo === "receita").length;
  const ticket = paidRevenueCount ? receita / paidRevenueCount : 0;
  const finalizedOrders = orders.data.filter(
    (order) => order.status === "finalizado",
  ).length;

  const origins = (["reparo", "loja", "seminovo", "manual"] as const).map(
    (origin) => ({
      origin,
      value: paid
        .filter((item) => item.tipo === "receita" && item.origem === origin)
        .reduce((total, item) => total + Number(item.valor), 0),
    }),
  );
  const originTotal = origins.reduce((total, item) => total + item.value, 0);

  const recent = [...data]
    .sort((a, b) =>
      (b.pago_em || b.vencimento).localeCompare(a.pago_em || a.vencimento),
    )
    .slice(0, 6);

  const pending = [...data]
    .filter((item) => item.status === "pendente" && item.tipo === "receita")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 5);

  const evolution = useMemo(() => {
    const base = new Date(today() + "T12:00:00");
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() - (13 - index));
      const key = isoDay(date);
      const dayEntries = paid.filter((item) => item.pago_em === key);
      return {
        key,
        label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        receita: dayEntries
          .filter((item) => item.tipo === "receita")
          .reduce((total, item) => total + Number(item.valor), 0),
        despesa: dayEntries
          .filter((item) => item.tipo === "despesa")
          .reduce((total, item) => total + Number(item.valor), 0),
      };
    });
  }, [paid]);

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
    else await entries.reload();
    setBusy(false);
  }

  return (
    <div className={ordemId ? "" : "finance-dashboard"}>
      <ErrorBox error={error || entries.error || orders.error} />

      {!ordemId && (
        <>
          <div className="finance-kpis">
            <article>
              <span>Receita do período</span>
              <strong>{money(receita)}</strong>
              <small>Valores recebidos</small>
            </article>
            <article>
              <span>Despesas</span>
              <strong>{money(despesa)}</strong>
              <small>Pagamentos realizados</small>
            </article>
            <article>
              <span>Lucro / saldo</span>
              <strong>{money(saldo)}</strong>
              <small>Receitas menos despesas</small>
            </article>
            <article>
              <span>Ticket médio</span>
              <strong>{money(ticket)}</strong>
              <small>Por recebimento</small>
            </article>
            <article>
              <span>A receber</span>
              <strong>{money(pendingRevenue)}</strong>
              <small>{pending.length} títulos próximos</small>
            </article>
            <article>
              <span>Ordens finalizadas</span>
              <strong>{finalizedOrders}</strong>
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
                        <span className={"legend-dot " + originClass[item.origin]} />
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
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Gráfico de evolução financeira">
                  <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#68b5e4" stopOpacity=".35" />
                      <stop offset="100%" stopColor="#68b5e4" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[20, 40, 60, 80].map((y) => (
                    <line key={y} x1="0" x2="100" y1={y} y2={y} className="grid-line" />
                  ))}
                  <polygon
                    points={"0,92 " + points("receita") + " 100,92"}
                    fill="url(#incomeFill)"
                  />
                  <polyline points={points("receita")} className="income-line" />
                  <polyline points={points("despesa")} className="expense-line" />
                </svg>
                <div className="finance-axis">
                  {evolution.filter((_, index) => index % 3 === 0).map((item) => (
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
                <button className="finance-ghost" onClick={() => setAdding(true)}>
                  + Novo lançamento
                </button>
              </div>
              <div className="finance-movements">
                {recent.map((item) => (
                  <div key={item.id}>
                    <span className={item.tipo === "receita" ? "movement-icon in" : "movement-icon out"}>
                      {item.tipo === "receita" ? "↗" : "↘"}
                    </span>
                    <div>
                      <strong>{item.descricao}</strong>
                      <small>
                        {item.pago_em
                          ? item.pago_em.split("-").reverse().join("/")
                          : "Vence " + item.vencimento.split("-").reverse().join("/")}
                      </small>
                    </div>
                    <b className={item.tipo === "receita" ? "money-in" : "money-out"}>
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
                        ? `conic-gradient(#68b5e4 0 ${(receita / (receita + despesa)) * 100}%, #9a6070 ${(receita / (receita + despesa)) * 100}% 100%)`
                        : "conic-gradient(#30384a 0 100%)",
                  }}
                >
                  <div>
                    <strong>{money(receita + despesa)}</strong>
                    <small>Movimentado</small>
                  </div>
                </div>
                <div className="finance-balance-summary">
                  <div><span className="legend-dot repair" /><b>Receitas</b><strong>{money(receita)}</strong></div>
                  <div><span className="legend-dot expense" /><b>Despesas</b><strong>{money(despesa)}</strong></div>
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
                      <small>Vence {item.vencimento.split("-").reverse().join("/")}</small>
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
          <button className="primary" onClick={() => setAdding(!adding)}>
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
                await entries.reload();
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
                <input name="valor" type="number" min="0.01" step="0.01" required />
              </label>
              <label>
                Vencimento
                <input name="vencimento" type="date" defaultValue={today()} required />
              </label>
              {!ordemId && (
                <label>
                  Ordem (opcional)
                  <select name="ordem">
                    <option value="">Sem vínculo</option>
                    {orders.data.map((order) => (
                      <option key={order.id} value={order.id}>OS #{order.numero}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="check-label">
                <input type="checkbox" name="pago" />
                Já recebido / pago hoje
              </label>
            </div>
            <button disabled={busy} className="primary">Salvar lançamento</button>
          </form>
        )}

        {entries.loading ? (
          <p>Carregando…</p>
        ) : !data.length ? (
          <Empty title="Nenhum lançamento cadastrado" />
        ) : (
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
                {[...data]
                  .sort((a, b) => b.vencimento.localeCompare(a.vencimento))
                  .map((item) => (
                    <tr key={item.id}>
                      <td>{item.descricao}</td>
                      <td>{item.tipo}</td>
                      <td>{money(item.valor)}</td>
                      <td>{item.vencimento.split("-").reverse().join("/")}</td>
                      <td>{item.status}</td>
                      <td>
                        {item.status === "pendente" ? (
                          <button disabled={busy} onClick={() => pay(item)}>
                            Registrar {item.tipo === "receita" ? "recebimento" : "pagamento"}
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
        )}
        <p className="hint">
          Registre movimentações realizadas ou previstas. A Horária não processa pagamentos.
        </p>
      </section>
    </div>
  );
}
