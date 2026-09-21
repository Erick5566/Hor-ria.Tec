"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace";
import { Badge, Empty, ErrorBox } from "@/components/ui";
import { money, type Status } from "@/lib/assistencia";
import { message, supabase, time } from "@/lib/supabase";

type DashboardData = {
  metrics: {
    periodOrders: number;
    previousPeriodOrders: number;
    periodFinished: number;
    previousPeriodFinished: number;
    periodClients: number;
    previousPeriodClients: number;
    periodRevenue: number;
    previousPeriodRevenue: number;
    inProgress: number;
    awaitingParts: number;
  };
  spark: {
    orders: number[];
    active: number[];
    finished: number[];
    parts: number[];
    clients: number[];
    revenue: number[];
  };
  trend: Array<{
    key: string;
    opened: number;
    active: number;
    finalized: number;
  }>;
  status: {
    concluidas: number;
    andamento: number;
    pecas: number;
    orcamento: number;
    canceladas: number;
    outros: number;
  };
  performance: {
    completionRate: number;
    averageRepairDays: number | null;
  };
  latestOrders: Array<{
    id: string;
    numero: number;
    status: Status;
    criado_em: string;
    cliente_nome: string;
    equipamento_modelo: string;
  }>;
  todayAgenda: Array<{
    id: string;
    inicio: string;
    nome_cliente: string | null;
    descricao: string | null;
  }>;
  priorities: Array<{
    id: string;
    numero: number;
    prioridade: "baixa" | "normal" | "alta" | "urgente";
    prazo_previsto: string;
    equipamento_modelo: string;
  }>;
};

function percentageDelta(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

type SparkPoint = { x: number; y: number };

function sparkGeometry(
  values: number[],
  width = 100,
  height = 46,
  padding = 4,
) {
  const safe = values.length ? values : [0, 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = Math.max(max - min, 1);

  const points: SparkPoint[] = safe.map((value, index) => {
    const x =
      safe.length === 1
        ? width / 2
        : padding + (index / (safe.length - 1)) * (width - padding * 2);
    const y =
      max === min
        ? height / 2
        : height -
          padding -
          ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const clampY = (value: number) =>
    Math.max(padding, Math.min(height - padding, value));

  let line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  if (points.length === 2) {
    line += ` L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  } else if (points.length > 2) {
    const tension = 0.78;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index - 1] ?? points[index];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[index + 2] ?? p2;

      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
      const cp1y = clampY(p1.y + ((p2.y - p0.y) / 6) * tension);
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
      const cp2y = clampY(p2.y - ((p3.y - p1.y) / 6) * tension);

      line +=
        ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)},` +
        ` ${cp2x.toFixed(2)} ${cp2y.toFixed(2)},` +
        ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
  }

  const first = points[0];
  const last = points[points.length - 1];
  const baseline = (height - padding).toFixed(2);
  const area =
    `${line} L ${last.x.toFixed(2)} ${baseline}` +
    ` L ${first.x.toFixed(2)} ${baseline} Z`;

  return { line, area, last };
}

function KpiSparkline({
  values,
  tone,
}: {
  values: number[];
  tone: string;
}) {
  const rawId = useId();
  const gradientId = `kpi-${rawId.replace(/:/g, "")}`;
  const { line, area, last } = sparkGeometry(values);

  return (
    <span className={"kpi-trend-v2 " + tone} aria-hidden="true">
      <svg viewBox="0 0 100 46" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity=".02" />
          </linearGradient>
        </defs>
        <path
          className="kpi-trend-v2-area"
          d={area}
          fill={`url(#${gradientId})`}
        />
        <path className="kpi-trend-v2-line" d={line} />
        <circle
          className="kpi-trend-v2-dot"
          cx={last.x}
          cy={last.y}
          r="2.35"
        />
      </svg>
    </span>
  );
}

function formatShortDate(value: string) {
  return new Date(value + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function Overview() {
  const { empresa, periodStart, periodEnd } = useWorkspace();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const load = useCallback(
    async (silent = false) => {
      if (!supabase) return;
      if (!silent) setLoading(true);
      try {
        const result = await supabase.rpc("dashboard_overview", {
          p_start: periodStart,
          p_end: periodEnd,
        });
        if (result.error) throw result.error;
        setData(result.data as DashboardData);
        setError("");
      } catch (e) {
        setError(message(e as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [periodStart, periodEnd],
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
      .channel(`dashboard-${empresa.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ordens_servico",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clientes",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "financeiro",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, load]);

  const metrics = useMemo(() => {
    const m = data?.metrics;
    const spark = data?.spark;
    return [
      {
        name: "Ordens de serviço",
        value: m?.periodOrders ?? 0,
        icon: "▤",
        tone: "blue",
        trend: percentageDelta(
          m?.periodOrders ?? 0,
          m?.previousPeriodOrders ?? 0,
        ),
        note: "comparado ao período anterior",
        spark: spark?.orders ?? [],
      },
      {
        name: "Em andamento",
        value: m?.inProgress ?? 0,
        icon: "⌘",
        tone: "amber",
        trend: null,
        note: "ordens abertas agora",
        spark: spark?.active ?? [],
      },
      {
        name: "Concluídas",
        value: m?.periodFinished ?? 0,
        icon: "✓",
        tone: "green",
        trend: percentageDelta(
          m?.periodFinished ?? 0,
          m?.previousPeriodFinished ?? 0,
        ),
        note: "comparado ao período anterior",
        spark: spark?.finished ?? [],
      },
      {
        name: "Aguardando peças",
        value: m?.awaitingParts ?? 0,
        icon: "◷",
        tone: "purple",
        trend: null,
        note: "situação atual",
        spark: spark?.parts ?? [],
      },
      {
        name: "Novos clientes",
        value: m?.periodClients ?? 0,
        icon: "♙",
        tone: "sky",
        trend: percentageDelta(
          m?.periodClients ?? 0,
          m?.previousPeriodClients ?? 0,
        ),
        note: "comparado ao período anterior",
        spark: spark?.clients ?? [],
      },
      {
        name: "Faturamento do período",
        value: money(m?.periodRevenue ?? 0),
        icon: "＄",
        tone: "green",
        trend: percentageDelta(
          m?.periodRevenue ?? 0,
          m?.previousPeriodRevenue ?? 0,
        ),
        note: "comparado ao período anterior",
        spark: spark?.revenue ?? [],
      },
    ];
  }, [data]);

  const trendData = data?.trend ?? [];
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

  const allStatusData = [
    {
      key: "concluidas",
      label: "Concluídas",
      color: "#25b47e",
      count: data?.status.concluidas ?? 0,
    },
    {
      key: "andamento",
      label: "Em andamento",
      color: "#2d8cff",
      count: data?.status.andamento ?? 0,
    },
    {
      key: "pecas",
      label: "Aguardando peças",
      color: "#f5b83d",
      count: data?.status.pecas ?? 0,
    },
    {
      key: "orcamento",
      label: "Aguardando orçamento",
      color: "#8e58e9",
      count: data?.status.orcamento ?? 0,
    },
    {
      key: "canceladas",
      label: "Canceladas",
      color: "#ef4b76",
      count: data?.status.canceladas ?? 0,
    },
    {
      key: "outros",
      label: "Outros",
      color: "#99a8bd",
      count: data?.status.outros ?? 0,
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

  const priorityLabel: Record<
    DashboardData["priorities"][number]["prioridade"],
    string
  > = {
    urgente: "Urgente",
    alta: "Alta",
    normal: "Normal",
    baixa: "Baixa",
  };

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

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

        <Link className="dashboard-new-order" href="/painel/ordens/nova">
          <span>＋</span>
          Nova Ordem
        </Link>

        <Link className="dashboard-callout" href="/painel/ajuda">
          <span className="dashboard-callout-icon">▥</span>
          <div>
            <strong>Aumente a produtividade da sua assistência</strong>
            <small>Dicas, tutoriais e novidades da Horária.</small>
          </div>
          <span>→</span>
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
              <strong>{loading && !data ? "—" : metric.value}</strong>
              <KpiSparkline values={metric.spark} tone={metric.tone} />
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
          </div>

          <div className="dashboard-line-chart dashboard-line-chart-reference">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-label="Evolução das ordens"
            >
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
              <polyline points={trendPoints("opened")} className="dash-open-line" />
              <polyline points={trendPoints("active")} className="dash-active-line" />
              <polyline
                points={trendPoints("finalized")}
                className="dash-final-line"
              />
            </svg>

            <div className="dashboard-chart-axis">
              {trendData
                .filter(
                  (_, index) =>
                    index % 6 === 0 || index === trendData.length - 1,
                )
                .map((item) => (
                  <span key={item.key}>{formatShortDate(item.key)}</span>
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
            <div><h2>▥ Desempenho da assistência</h2></div>
          </div>
          <div className="dashboard-performance-list">
            <article>
              <span>◷</span>
              <div>
                <small>Tempo médio de reparo</small>
                <strong>
                  {data?.performance.averageRepairDays == null
                    ? "—"
                    : data.performance.averageRepairDays + " dias"}
                </strong>
              </div>
            </article>
            <article>
              <span>✓</span>
              <div>
                <small>Taxa de conclusão</small>
                <strong>{data?.performance.completionRate ?? 0}%</strong>
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
          {data?.latestOrders.length ? (
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
                  {data.latestOrders.map((order) => {
                    const orderHref = "/painel/ordens/" + order.id;
                    const orderLabel = `Abrir ordem #${order.numero}`;
                    return (
                      <tr key={order.id} className="dashboard-order-row">
                        <td>
                          <Link className="dashboard-order-cell-link" href={orderHref} aria-label={orderLabel}>
                            #{order.numero}
                          </Link>
                        </td>
                        <td>
                          <Link className="dashboard-order-cell-link" href={orderHref} aria-label={orderLabel}>
                            {order.cliente_nome}
                          </Link>
                        </td>
                        <td>
                          <Link className="dashboard-order-cell-link" href={orderHref} aria-label={orderLabel}>
                            {order.equipamento_modelo}
                          </Link>
                        </td>
                        <td>
                          <Link className="dashboard-order-cell-link" href={orderHref} aria-label={orderLabel}>
                            <Badge status={order.status} />
                          </Link>
                        </td>
                        <td>
                          <Link className="dashboard-order-cell-link" href={orderHref} aria-label={orderLabel}>
                            {new Date(order.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </Link>
                        </td>
                        <td className="dashboard-order-action">
                          <Link href={orderHref} aria-label={orderLabel}>
                            <span>Abrir</span>
                            <b aria-hidden="true">→</b>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
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
            {data?.todayAgenda.map((appointment) => (
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
            {!data?.todayAgenda.length && <Empty title="Nenhum atendimento hoje." />}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div><h2>ϟ Prioridades / Próximos prazos</h2></div>
            <Link href="/painel/mesa-reparo">Ver todos</Link>
          </div>
          <div className="dashboard-priority-list">
            {data?.priorities.map((order) => {
              const deadline = Math.ceil(
                (new Date(order.prazo_previsto).getTime() -
                  new Date(today + "T00:00:00").getTime()) /
                  86400000,
              );
              return (
                <Link href={"/painel/ordens/" + order.id} key={order.id}>
                  <strong>#{order.numero}</strong>
                  <div><b>{order.equipamento_modelo}</b></div>
                  <span className={"priority-chip " + order.prioridade}>
                    {priorityLabel[order.prioridade]}
                  </span>
                  <em className={deadline <= 0 ? "deadline-hot" : ""}>
                    {deadline <= 0
                      ? "Hoje"
                      : deadline === 1
                        ? "1 dia"
                        : `${deadline} dias`}
                  </em>
                  <i>⋮</i>
                </Link>
              );
            })}
            {!data?.priorities.length && <Empty title="Nenhuma prioridade pendente." />}
          </div>
        </section>
      </div>

      <footer className="dashboard-reference-footer">
        Horária · Gestão simples, resultados reais.
      </footer>
    </section>
  );
}
