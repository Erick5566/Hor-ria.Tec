"use client";

import Link from "next/link";
import { DashboardOrderCharts } from "@/components/dashboard-order-charts";
import { watchDashboard } from "@/lib/dashboard-live";
import {
  normalizeDashboard,
  sparkGeometry,
  orderOverdue,
  appointmentOverdue,
  priorityLabels,
  saoPauloDay,
  type DashboardData,
} from "@/lib/dashboard";
import { PriorityBadge, DashboardContent } from "@/components/dashboard-state";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "@/components/workspace";
import {
  Badge,
  Empty,
  ErrorBox,
  MetricCard,
  MetricGrid,
  PanelTitle,
} from "@/components/ui";
import { HorariaIcon, type HorariaIconName } from "@/components/horaria-icon";
import { money } from "@/lib/assistencia";
import { message, supabase, time } from "@/lib/supabase";

function percentageDelta(current: number, previous?: number | null) {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function comparisonNote(previous?: number | null) {
  return previous != null && previous > 0
    ? "comparado ao período anterior"
    : "sem dados do período anterior";
}

function KpiSparkline({
  values,
  tone,
  label,
}: {
  values: number[];
  tone: string;
  label: string;
}) {
  const rawId = useId();
  const gradientId = `kpi-${rawId.replace(/:/g, "")}`;
  const { line, area, last, hasData } = sparkGeometry(values);
  if (!hasData) return <span className="kpi-trend-empty">Sem movimento</span>;

  return (
    <span
      className={"kpi-trend-v2 " + tone}
      title={`Evolução diária no período selecionado (${values.length} dias)`}
    >
      <svg
        viewBox="0 0 100 46"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evolução diária: ${label}`}
      >
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
        <circle className="kpi-trend-v2-dot" cx={last.x} cy={last.y} r="2.35" />
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
  const { empresa, access, periodStart, periodEnd } = useWorkspace();
  const canViewFinance = ["OWNER", "ADMIN"].includes(
    access.company?.role || "",
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  const requestRef = useRef<AbortController | null>(null);
  const load = useCallback(
    async (silent = false) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      if (!silent) setLoading(true);
      try {
        if (!supabase) throw new Error("Conexão com o banco não configurada.");
        const result = await supabase
          .rpc("dashboard_overview", { p_start: periodStart, p_end: periodEnd })
          .abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (result.error) throw result.error;
        setData(normalizeDashboard(result.data));
        setError("");
      } catch (caught) {
        if (!controller.signal.aborted) setError(message(caught as Error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [empresa.id, periodStart, periodEnd],
  );

  useEffect(() => {
    setData(null);
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!supabase || !empresa.id) return;
    return watchDashboard(
      supabase,
      empresa.id,
      () => load(true),
      canViewFinance,
    );
  }, [empresa.id, load, canViewFinance]);

  const contentProps = {
    loading,
    error,
    hasData: !!data,
    retry: () => void load(!!data),
  };
  const metrics = useMemo(() => {
    const m = data?.metrics;
    const spark = data?.spark;
    return [
      {
        name: "Ordens de serviço",
        value: m?.periodOrders ?? 0,
        iconName: "orders" as HorariaIconName,
        tone: "blue",
        trend: percentageDelta(m?.periodOrders ?? 0, m?.previousPeriodOrders),
        note: comparisonNote(m?.previousPeriodOrders),
        spark: spark?.orders ?? [],
      },
      {
        name: "Em andamento",
        value: m?.inProgress ?? 0,
        iconName: "services" as HorariaIconName,
        tone: "amber",
        trend: null,
        note: "ordens abertas agora",
        spark: spark?.active ?? [],
      },
      {
        name: "Concluídas",
        value: m?.periodFinished ?? 0,
        iconName: "check" as HorariaIconName,
        tone: "green",
        trend: percentageDelta(
          m?.periodFinished ?? 0,
          m?.previousPeriodFinished,
        ),
        note: comparisonNote(m?.previousPeriodFinished),
        spark: spark?.finished ?? [],
      },
      {
        name: "Aguardando peças",
        value: m?.awaitingParts ?? 0,
        iconName: "hourglass" as HorariaIconName,
        tone: "purple",
        trend: null,
        note: "situação atual",
        spark: spark?.parts ?? [],
      },
      {
        name: "Novos clientes",
        value: m?.periodClients ?? 0,
        iconName: "clients" as HorariaIconName,
        tone: "sky",
        trend: percentageDelta(m?.periodClients ?? 0, m?.previousPeriodClients),
        note: comparisonNote(m?.previousPeriodClients),
        spark: spark?.clients ?? [],
      },
      ...(canViewFinance
        ? [
            {
              name: "Faturamento do período",
              value: money(m?.periodRevenue ?? 0),
              iconName: "finance" as HorariaIconName,
              tone: "green",
              trend: percentageDelta(
                m?.periodRevenue ?? 0,
                m?.previousPeriodRevenue,
              ),
              note: comparisonNote(m?.previousPeriodRevenue),
              spark: spark?.revenue ?? [],
            },
          ]
        : []),
    ];
  }, [data, canViewFinance]);

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
  const statusTotal = statusData.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;
  const donut = `conic-gradient(${statusData
    .map((item) => {
      const start = cursor;
      cursor += (item.count / statusTotal) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    })
    .join(",")})`;

  const today = saoPauloDay();

  return (
    <section className="module dashboard-pro dashboard-reference">
      <div className="dashboard-hero">
        <div className="dashboard-heading-wrap">
          <span className="dashboard-welcome">Olá, seja bem-vindo! 👋</span>
          <div className="dashboard-reference-heading">
            <div className="dashboard-main-title">
              <span className="module-heading-icon" aria-hidden="true">
                <HorariaIcon name="home" />
              </span>
              <div>
                <h1>Visão geral</h1>
              </div>
            </div>
          </div>
        </div>

        <Link className="dashboard-new-order" href="/painel/ordens/nova">
          <HorariaIcon name="receive" />
          Nova Ordem
        </Link>

        <Link className="dashboard-callout" href="/painel/ajuda">
          <span className="dashboard-callout-icon">
            <HorariaIcon name="trend" />
          </span>
          <div>
            <strong>Aumente a produtividade da sua assistência</strong>
            <small>Dicas, tutoriais e novidades da Horária.</small>
          </div>
          <span>→</span>
        </Link>
      </div>

      <ErrorBox error={error} />

      <DashboardContent {...contentProps}>
        <MetricGrid columns={canViewFinance ? 6 : 5} className="dashboard-kpis">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.name}
              label={metric.name}
              value={loading && !data ? "—" : metric.value}
              iconName={metric.iconName}
              tone={
                metric.tone === "sky"
                  ? "primary"
                  : (metric.tone as "blue" | "amber" | "green" | "purple")
              }
              afterValue={
                <KpiSparkline
                  values={metric.spark}
                  tone={metric.tone}
                  label={metric.name}
                />
              }
              footer={
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
              }
            />
          ))}
        </MetricGrid>
      </DashboardContent>

      <div className="dashboard-analytics">
        <section className="dashboard-card dashboard-trend">
          <div className="dashboard-card-head">
            <PanelTitle
              title="Serviços e agendamentos"
              icon="trend"
              subtitle="Dados reais do período selecionado."
            />
          </div>

          <DashboardContent {...contentProps}>
            <DashboardOrderCharts counts={data?.serviceChart} />
          </DashboardContent>
        </section>

        <section className="dashboard-card dashboard-status">
          <div className="dashboard-card-head">
            <PanelTitle
              title="Status das ordens"
              icon="donut"
              subtitle="Distribuição das ordens no período."
            />
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

          <DashboardContent {...contentProps}>
            {statusTotal > 0 ? (
              <div className="dashboard-status-layout">
                <div
                  className="dashboard-status-donut"
                  style={{ background: donut }}
                >
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
                      <strong>
                        {Math.round((item.count / statusTotal) * 100)}%
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty title="Nenhuma ordem para este status no período." />
            )}
          </DashboardContent>
        </section>

        <section className="dashboard-card dashboard-performance">
          <div className="dashboard-card-head">
            <PanelTitle title="Desempenho da assistência" icon="reports" />
          </div>
          <DashboardContent {...contentProps}>
            <div className="dashboard-performance-list">
              <article>
                <span>
                  <HorariaIcon name="clock" />
                </span>
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
                <span>
                  <HorariaIcon name="check" />
                </span>
                <div>
                  <small>Taxa de conclusão</small>
                  <strong>{data?.performance.completionRate ?? 0}%</strong>
                </div>
              </article>
              <article>
                <span>
                  <HorariaIcon name="star" />
                </span>
                <div>
                  <small>Avaliação dos clientes</small>
                  <strong>—</strong>
                  <em>Sem avaliações conectadas</em>
                </div>
              </article>
            </div>
          </DashboardContent>
        </section>
      </div>

      <div className="dashboard-bottom">
        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <PanelTitle title="Ordens de serviço" icon="orders" />
            <Link href="/painel/ordens">Ver todas</Link>
          </div>
          <DashboardContent {...contentProps}>
            {data?.latestOrders.length ? (
              <div className="table-wrap dashboard-table">
                <table>
                  <thead>
                    <tr>
                      <th>#OS</th>
                      <th>Cliente</th>
                      <th>Equipamento</th>
                      <th>Status</th>
                      <th>Prioridade</th>
                      <th>Horário / Prazo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.latestOrders.map((order) => {
                      const orderHref = "/painel/ordens/" + order.id;
                      const orderLabel = `Abrir ordem #${order.numero}`;
                      return (
                        <tr
                          key={order.id}
                          className={`dashboard-order-row ${order.prioridade === "urgente" ? "dashboard-urgent" : ""} ${orderOverdue(order) ? "dashboard-overdue" : ""}`}
                        >
                          <td>
                            <Link
                              className="dashboard-order-cell-link"
                              href={orderHref}
                              aria-label={orderLabel}
                            >
                              #{order.numero}
                            </Link>
                          </td>
                          <td>
                            <Link
                              className="dashboard-order-cell-link"
                              href={orderHref}
                              aria-label={orderLabel}
                            >
                              {order.cliente_nome}
                            </Link>
                          </td>
                          <td>
                            <Link
                              className="dashboard-order-cell-link"
                              href={orderHref}
                              aria-label={orderLabel}
                            >
                              {order.equipamento_modelo}
                            </Link>
                          </td>
                          <td>
                            <Link
                              className="dashboard-order-cell-link"
                              href={orderHref}
                              aria-label={orderLabel}
                            >
                              <Badge status={order.status} />
                            </Link>
                          </td>
                          <td>
                            <PriorityBadge priority={order.prioridade} />
                          </td>
                          <td>
                            <Link
                              className="dashboard-order-cell-link"
                              href={orderHref}
                              aria-label={orderLabel}
                            >
                              {orderOverdue(order) && (
                                <b className="dashboard-late-label">
                                  Atrasada ·{" "}
                                </b>
                              )}
                              {order.prazo_previsto
                                ? `Prazo: ${formatShortDate(order.prazo_previsto)}`
                                : ""}
                              {new Date(order.criado_em).toLocaleString(
                                "pt-BR",
                                {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                  timeZone: "America/Sao_Paulo",
                                },
                              )}
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
              <Empty title="Nenhuma ordem cadastrada no período." />
            )}
          </DashboardContent>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <PanelTitle
              title="Agenda de hoje"
              icon="calendar"
              subtitle="Atendimentos e atividades do dia."
            />
            <Link href="/painel/agenda">Ver agenda</Link>
          </div>
          <DashboardContent {...contentProps}>
            <div className="dashboard-agenda-list">
              {data?.todayAgenda.map((appointment) => (
                <Link
                  href="/painel/agenda"
                  key={appointment.id}
                  className={`${appointment.prioridade === "urgente" ? "dashboard-urgent" : ""} ${appointmentOverdue(appointment) ? "dashboard-overdue" : ""}`}
                >
                  <strong>{time(appointment.inicio)}</strong>
                  <span />
                  <div>
                    <b>{appointment.nome_cliente || "Cliente"}</b>
                    <small>{appointment.descricao || "Atendimento"}</small>
                    <PriorityBadge priority={appointment.prioridade} />
                    {appointmentOverdue(appointment) && (
                      <b className="dashboard-late-label">Atrasado</b>
                    )}
                  </div>
                  <i>□</i>
                  <em>⋮</em>
                </Link>
              ))}
              {!data?.todayAgenda.length && (
                <Empty title="Nenhum atendimento hoje." />
              )}
            </div>
          </DashboardContent>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <PanelTitle title="Prioridades / Próximos prazos" icon="alert" />
            <Link href="/painel/mesa-reparo">Ver todos</Link>
          </div>
          <DashboardContent {...contentProps}>
            <div className="dashboard-priority-list">
              {data?.priorities.map((order) => {
                const deadline = Math.ceil(
                  (new Date(order.prazo_previsto + "T12:00:00Z").getTime() -
                    new Date(today + "T12:00:00Z").getTime()) /
                    86400000,
                );
                return (
                  <Link href={"/painel/ordens/" + order.id} key={order.id}>
                    <strong>#{order.numero}</strong>
                    <div>
                      <b>{order.equipamento_modelo}</b>
                    </div>
                    <span className={"priority-chip " + order.prioridade}>
                      {priorityLabels[order.prioridade]}
                    </span>
                    <em className={deadline <= 0 ? "deadline-hot" : ""}>
                      {deadline < 0
                        ? `${Math.abs(deadline)} dia(s) atrasada`
                        : deadline === 0
                          ? "Hoje"
                          : deadline === 1
                            ? "1 dia"
                            : `${deadline} dias`}
                    </em>
                    <i>⋮</i>
                  </Link>
                );
              })}
              {!data?.priorities.length && (
                <Empty title="Nenhuma prioridade pendente." />
              )}
            </div>
          </DashboardContent>
        </section>
      </div>

      <footer className="dashboard-reference-footer">
        Horária · Gestão simples, resultados reais.
      </footer>
    </section>
  );
}
