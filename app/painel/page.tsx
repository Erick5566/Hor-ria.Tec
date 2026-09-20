"use client";
import Link from "next/link";
import { useState } from "react";
import {
  useRows,
  Ordem,
  Cliente,
  Equipamento,
  Lancamento,
  money,
} from "@/lib/assistencia";
import { Agendamento, today, time } from "@/lib/supabase";
import { Empty, Badge, ErrorBox } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";

function dateKey(value: string) {
  return value.slice(0, 10);
}

function monthBefore(month: string) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function percentageDelta(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function daysBetween(start: string, end: string) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, diff / 86400000);
}

export default function Overview() {
  const { selectedMonth } = useWorkspace();
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(30);
  const [statusFilter, setStatusFilter] = useState("todos");

  const os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes"),
    eq = useRows<Equipamento>("equipamentos"),
    agenda = useRows<Agendamento>("agendamentos"),
    fin = useRows<Lancamento>("financeiro");

  const day = today();
  const month = selectedMonth;
  const previousMonth = monthBefore(month);

  const openOrders = os.data.filter(
    (item) => !["finalizado", "cancelado"].includes(item.status),
  );
  const monthOrders = os.data.filter((item) => item.criado_em.startsWith(month));
  const previousMonthOrders = os.data.filter((item) =>
    item.criado_em.startsWith(previousMonth),
  );
  const monthFinished = os.data.filter(
    (item) => item.status === "finalizado" && item.atualizado_em.startsWith(month),
  );
  const previousMonthFinished = os.data.filter(
    (item) =>
      item.status === "finalizado" &&
      item.atualizado_em.startsWith(previousMonth),
  );
  const monthClients = cs.data.filter((item) => item.criado_em.startsWith(month));
  const previousMonthClients = cs.data.filter((item) =>
    item.criado_em.startsWith(previousMonth),
  );

  const monthRevenue = fin.data
    .filter(
      (item) =>
        item.tipo === "receita" &&
        item.status === "pago" &&
        item.pago_em?.startsWith(month),
    )
    .reduce((sum, item) => sum + Number(item.valor), 0);
  const previousMonthRevenue = fin.data
    .filter(
      (item) =>
        item.tipo === "receita" &&
        item.status === "pago" &&
        item.pago_em?.startsWith(previousMonth),
    )
    .reduce((sum, item) => sum + Number(item.valor), 0);

  const inProgress = openOrders.length;
  const awaitingParts = os.data.filter(
    (item) => item.status === "aguardando_peca",
  ).length;

  const metrics = [
    {
      name: "Ordens de serviço",
      value: monthOrders.length,
      icon: "▤",
      tone: "blue",
      trend: percentageDelta(monthOrders.length, previousMonthOrders.length),
      note: "em relação ao mês anterior",
    },
    {
      name: "Em andamento",
      value: inProgress,
      icon: "⌘",
      tone: "amber",
      trend: null,
      note: "ordens abertas agora",
    },
    {
      name: "Concluídas",
      value: monthFinished.length,
      icon: "✓",
      tone: "green",
      trend: percentageDelta(monthFinished.length, previousMonthFinished.length),
      note: "em relação ao mês anterior",
    },
    {
      name: "Aguardando peças",
      value: awaitingParts,
      icon: "◷",
      tone: "purple",
      trend: null,
      note: "situação atual",
    },
    {
      name: "Novos clientes",
      value: monthClients.length,
      icon: "♙",
      tone: "sky",
      trend: percentageDelta(monthClients.length, previousMonthClients.length),
      note: "em relação ao mês anterior",
    },
    {
      name: "Faturamento do mês",
      value: money(monthRevenue),
      icon: "＄",
      tone: "green",
      trend: percentageDelta(monthRevenue, previousMonthRevenue),
      note: "em relação ao mês anterior",
    },
  ];

  const chartAnchor = (() => {
    if (selectedMonth === day.slice(0, 7)) return new Date(day + "T12:00:00");
    const [year, value] = selectedMonth.split("-").map(Number);
    return new Date(year, value, 0, 12, 0, 0);
  })();

  const trendData = Array.from({ length: chartDays }, (_, index) => {
    const date = new Date(chartAnchor);
    date.setDate(date.getDate() - (chartDays - 1 - index));
    const key = date.toISOString().slice(0, 10);
    const endOfDay = key + "T23:59:59";

    const opened = os.data.filter((item) => item.criado_em <= endOfDay).length;
    const finalized = os.data.filter(
      (item) =>
        item.status === "finalizado" &&
        item.atualizado_em <= endOfDay,
    ).length;

    return {
      key,
      label: date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      opened,
      active: Math.max(0, opened - finalized),
      finalized,
    };
  });

  const maxTrend = Math.max(
    1,
    ...trendData.flatMap((item) => [item.opened, item.active, item.finalized]),
  );

  const trendPoints = (key: "opened" | "active" | "finalized") =>
    trendData
      .map((item, index) => {
        const x = (index / Math.max(1, trendData.length - 1)) * 100;
        const y = 88 - (item[key] / maxTrend) * 72;
        return `${x},${y}`;
      })
      .join(" ");

  const periodOrders = os.data.filter((item) => item.criado_em.startsWith(month));
  const statusGroups = [
    {
      key: "concluidas",
      label: "Concluídas",
      color: "#25b47e",
      match: (item: Ordem) => item.status === "finalizado",
    },
    {
      key: "andamento",
      label: "Em andamento",
      color: "#2d8cff",
      match: (item: Ordem) =>
        !["finalizado", "cancelado", "aguardando_peca", "aguardando_orcamento", "orcamento_enviado", "aguardando_aprovacao"].includes(
          item.status,
        ),
    },
    {
      key: "pecas",
      label: "Aguardando peças",
      color: "#f5b83d",
      match: (item: Ordem) => item.status === "aguardando_peca",
    },
    {
      key: "orcamento",
      label: "Aguardando orçamento",
      color: "#8e58e9",
      match: (item: Ordem) =>
        ["aguardando_orcamento", "orcamento_enviado", "aguardando_aprovacao"].includes(
          item.status,
        ),
    },
    {
      key: "canceladas",
      label: "Canceladas",
      color: "#ef4b76",
      match: (item: Ordem) => item.status === "cancelado",
    },
  ];

  const statusWithCounts = statusGroups.map((group) => ({
    key: group.key,
    label: group.label,
    color: group.color,
    count: periodOrders.filter(group.match).length,
  }));
  const groupedCount = statusWithCounts.reduce((sum, item) => sum + item.count, 0);
  const allStatusData = [
    ...statusWithCounts,
    {
      key: "outros",
      label: "Outros",
      color: "#99a8bd",
      count: Math.max(0, periodOrders.length - groupedCount),
    },
  ];
  const statusData =
    statusFilter === "todos"
      ? allStatusData
      : allStatusData.filter((item) => item.key === statusFilter);
  const statusTotal = Math.max(
    1,
    statusData.reduce((sum, item) => sum + item.count, 0),
  );
  let cursor = 0;
  const donut = `conic-gradient(${statusData
    .map((item) => {
      const start = cursor;
      cursor += (item.count / statusTotal) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    })
    .join(",")})`;

  const completionRate = periodOrders.length
    ? Math.round(
        (periodOrders.filter((item) => item.status === "finalizado").length /
          periodOrders.length) *
          100,
      )
    : 0;

  const repairDurations = periodOrders
    .filter((item) => item.status === "finalizado")
    .map((item) =>
      daysBetween(item.iniciado_em || item.criado_em, item.atualizado_em),
    )
    .filter((value) => Number.isFinite(value));
  const averageRepairDays = repairDurations.length
    ? (
        repairDurations.reduce((sum, value) => sum + value, 0) /
        repairDurations.length
      ).toFixed(1)
    : "—";

  const latestOrders = [...os.data]
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, 6);

  const todayAgenda = agenda.data
    .filter((item) => !item.bloqueio && dateKey(item.inicio) === day)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 6);

  const priorities = openOrders
    .filter((item) => item.prazo_previsto)
    .sort((a, b) => {
      const priority = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
      return (
        priority[a.prioridade] - priority[b.prioridade] ||
        (a.prazo_previsto || "").localeCompare(b.prazo_previsto || "")
      );
    })
    .slice(0, 6);

  const rows = [os, cs, eq, agenda, fin];
  const error = rows.find((item) => item.error)?.error;
  const loading = rows.some((item) => item.loading);

  const priorityLabel: Record<Ordem["prioridade"], string> = {
    urgente: "Urgente",
    alta: "Alta",
    normal: "Normal",
    baixa: "Baixa",
  };

  return (
    <section className="module dashboard-pro dashboard-reference">
      <div className="dashboard-hero">
        <div className="dashboard-heading-wrap">
          <span className="dashboard-welcome">Olá, seja bem-vindo! 👋</span>
          <div className="dashboard-reference-heading">
            <div>
              <h1>Visão geral</h1>
              <p>Tudo o que importa da sua assistência técnica, em um só lugar.</p>
            </div>
          </div>
        </div>

        <Link className="dashboard-callout" href="/painel/ajuda">
          <span className="dashboard-callout-icon">▥</span>
          <div>
            <strong>Aumente a produtividade da sua assistência</strong>
            <small>Dicas, tutoriais e novidades da Horária.</small>
          </div>
          <span>→</span>
        </Link>

        <Link className="dashboard-new-order" href="/painel/ordens/nova">
          <span>＋</span>
          Nova Ordem
        </Link>
      </div>

      <ErrorBox error={error} />

      <div className="dashboard-kpis">
        {metrics.map((metric) => (
          <article key={metric.name} className={"dashboard-kpi " + metric.tone}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-icon">{metric.icon}</span>
              <span>{metric.name}</span>
            </div>
            <div className="dashboard-kpi-value">
              <strong>{loading ? "—" : metric.value}</strong>
              <span className="dashboard-mini-line" />
            </div>
            <div className="dashboard-trend-note">
              {metric.trend !== null ? (
                <b className={metric.trend >= 0 ? "positive" : "negative"}>
                  {metric.trend >= 0 ? "↑" : "↓"} {Math.abs(metric.trend)}%
                </b>
              ) : (
                <b className="neutral">—</b>
              )}
              <small>{metric.note}</small>
            </div>
          </article>
        ))}
      </div>

      <div className="dashboard-analytics">
        <section className="dashboard-card dashboard-trend">
          <div className="dashboard-card-head">
            <div>
              <h2>▥ Evolução de ordens de serviço</h2>
              <p>Acompanhe o volume de ordens ao longo do tempo.</p>
            </div>
            <select
              className="dashboard-filter"
              aria-label="Período do gráfico"
              value={chartDays}
              onChange={(event) => setChartDays(Number(event.target.value) as 7 | 14 | 30)}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
          </div>

          <div className="dashboard-line-chart dashboard-line-chart-reference">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-label="Evolução das ordens"
            >
              <defs>
                <linearGradient id="referenceArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#176dff" stopOpacity=".23" />
                  <stop offset="100%" stopColor="#176dff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[18, 36, 54, 72, 90].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="100"
                  y1={y}
                  y2={y}
                  className="dash-grid-line"
                />
              ))}
              <polygon
                points={"0,88 " + trendPoints("opened") + " 100,88"}
                fill="url(#referenceArea)"
              />
              <polyline points={trendPoints("opened")} className="dash-open-line" />
              <polyline points={trendPoints("active")} className="dash-active-line" />
              <polyline
                points={trendPoints("finalized")}
                className="dash-final-line"
              />
            </svg>

            <div className="dashboard-chart-axis">
              {trendData
                .filter((_, index) => index % 6 === 0 || index === trendData.length - 1)
                .map((item) => (
                  <span key={item.key}>{item.label}</span>
                ))}
            </div>

            <div className="dashboard-chart-legend">
              <span><i className="open" /> Abertas</span>
              <span><i className="active" /> Em andamento</span>
              <span><i className="done" /> Concluídas</span>
            </div>
          </div>
        </section>

        <section className="dashboard-card dashboard-status">
          <div className="dashboard-card-head">
            <div>
              <h2>◔ Status das ordens</h2>
              <p>Distribuição das ordens no período.</p>
            </div>
            <select
              className="dashboard-filter"
              aria-label="Filtrar status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="concluidas">Concluídas</option>
              <option value="andamento">Em andamento</option>
              <option value="pecas">Aguardando peças</option>
              <option value="orcamento">Aguardando orçamento</option>
              <option value="canceladas">Canceladas</option>
              <option value="outros">Outros</option>
            </select>
          </div>

          <div className="dashboard-status-layout">
            <div className="dashboard-status-donut" style={{ background: donut }}>
              <div>
                <strong>{statusTotal}</strong>
                <small>Ordens no período</small>
              </div>
            </div>
            <div className="dashboard-status-legend">
              {statusData.map((item) => (
                <div key={item.key}>
                  <span style={{ background: item.color }} />
                  <b>{item.label}</b>
                  <strong>{Math.round((item.count / statusTotal) * 100)}%</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-card dashboard-performance">
          <div className="dashboard-card-head">
            <div>
              <h2>▥ Desempenho da assistência</h2>
            </div>
            <select
              className="dashboard-filter"
              aria-label="Período de desempenho"
              value={chartDays}
              onChange={(event) => setChartDays(Number(event.target.value) as 7 | 14 | 30)}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
          </div>

          <div className="dashboard-performance-list">
            <article>
              <span>◷</span>
              <div>
                <small>Tempo médio de reparo</small>
                <strong>{averageRepairDays === "—" ? "—" : averageRepairDays + " dias"}</strong>
              </div>
            </article>
            <article>
              <span>✓</span>
              <div>
                <small>Taxa de conclusão</small>
                <strong>{completionRate}%</strong>
              </div>
            </article>
            <article>
              <span>☆</span>
              <div>
                <small>Avaliação dos clientes</small>
                <strong>—</strong>
                <em>Sem avaliações conectadas</em>
              </div>
            </article>
          </div>
        </section>
      </div>

      <div className="dashboard-bottom">
        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div><h2>▤ Últimas ordens de serviço</h2></div>
            <Link href="/painel/ordens">Ver todas</Link>
          </div>
          {latestOrders.length ? (
            <div className="table-wrap dashboard-table">
              <table>
                <thead>
                  <tr>
                    <th>#OS</th>
                    <th>Cliente</th>
                    <th>Equipamento</th>
                    <th>Status</th>
                    <th>Data</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {latestOrders.map((order) => (
                    <tr key={order.id}>
                      <td>#{order.numero}</td>
                      <td>{cs.data.find((item) => item.id === order.cliente_id)?.nome || "Cliente"}</td>
                      <td>{eq.data.find((item) => item.id === order.equipamento_id)?.modelo || "Equipamento"}</td>
                      <td><Badge status={order.status} /></td>
                      <td>{new Date(order.criado_em).toLocaleDateString("pt-BR")} {new Date(order.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td><Link href={"/painel/ordens/" + order.id}>⋮</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Nenhuma ordem cadastrada." />
          )}
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div>
              <h2>▦ Agenda de hoje</h2>
              <p>Atendimentos e atividades do dia.</p>
            </div>
            <Link href="/painel/agenda">Ver agenda</Link>
          </div>
          <div className="dashboard-agenda-list">
            {todayAgenda.map((appointment) => (
              <Link href="/painel/agenda" key={appointment.id}>
                <strong>{time(appointment.inicio)}</strong>
                <span />
                <div>
                  <b>{appointment.nome_cliente || "Cliente"}</b>
                  <small>{appointment.descricao || "Atendimento"}</small>
                </div>
                <i>□</i>
                <em>⋮</em>
              </Link>
            ))}
            {!todayAgenda.length && <Empty title="Nenhum atendimento hoje." />}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div><h2>ϟ Prioridades / Próximos prazos</h2></div>
            <Link href="/painel/mesa-reparo">Ver todos</Link>
          </div>
          <div className="dashboard-priority-list">
            {priorities.map((order) => {
              const deadline = order.prazo_previsto
                ? Math.ceil(
                    (new Date(order.prazo_previsto).getTime() -
                      new Date(day + "T00:00:00").getTime()) /
                      86400000,
                  )
                : null;
              return (
                <Link href={"/painel/ordens/" + order.id} key={order.id}>
                  <strong>#{order.numero}</strong>
                  <div>
                    <b>{eq.data.find((item) => item.id === order.equipamento_id)?.modelo || "Equipamento"}</b>
                  </div>
                  <span className={"priority-chip " + order.prioridade}>
                    {priorityLabel[order.prioridade]}
                  </span>
                  <em className={deadline !== null && deadline <= 0 ? "deadline-hot" : ""}>
                    {deadline === null
                      ? "—"
                      : deadline <= 0
                        ? "Hoje"
                        : deadline === 1
                          ? "1 dia"
                          : `${deadline} dias`}
                  </em>
                  <i>⋮</i>
                </Link>
              );
            })}
            {!priorities.length && <Empty title="Nenhuma prioridade pendente." />}
          </div>
        </section>
      </div>

      <footer className="dashboard-reference-footer">
        Horária · Gestão simples, resultados reais.
      </footer>
    </section>
  );
}
