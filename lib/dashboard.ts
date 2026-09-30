import type { Status } from "./assistencia";
export type Priority = "urgente" | "alta" | "normal" | "baixa";
export type DashboardData = {
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
    prioridade: Priority;
    prazo_previsto: string | null;
    cliente_nome: string;
    equipamento_modelo: string;
  }>;
  todayAgenda: Array<{
    id: string;
    inicio: string;
    prioridade: Priority;
    status: "aguardando" | "em_atendimento" | "concluido";
    nome_cliente: string | null;
    descricao: string | null;
  }>;
  priorities: Array<{
    id: string;
    numero: number;
    prioridade: Priority;
    prazo_previsto: string;
    equipamento_modelo: string;
  }>;
};

export const priorityLabels: Record<Priority, string> = {
  urgente: "Urgente",
  alta: "Alta",
  normal: "Média",
  baixa: "Baixa",
};
export function saoPauloDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function orderOverdue(
  order: { status: string; prazo_previsto: string | null },
  now = new Date(),
) {
  return (
    !["finalizado", "cancelado"].includes(order.status) &&
    !!order.prazo_previsto &&
    order.prazo_previsto.slice(0, 10) < saoPauloDay(now)
  );
}
export function appointmentOverdue(
  item: { status: string; inicio: string },
  now = new Date(),
) {
  return (
    item.status === "aguardando" &&
    new Date(item.inicio).getTime() < now.getTime()
  );
}
export function trendGeometry(trend: DashboardData["trend"]) {
  const max = Math.max(
    1,
    ...trend.flatMap((item) => [item.opened, item.active, item.finalized]),
  );
  const points = (key: "opened" | "active" | "finalized") =>
    trend.map((item, index) => ({
      x: trend.length === 1 ? 50 : 4 + (index / (trend.length - 1)) * 92,
      y: 88 - (item[key] / max) * 72,
      value: item[key],
      key: item.key,
    }));
  return {
    points,
    hasData: trend.some(
      (item) => item.opened > 0 || item.active > 0 || item.finalized > 0,
    ),
  };
}
export function normalizeDashboard(value: unknown): DashboardData {
  if (!value || typeof value !== "object")
    throw new Error("Não foi possível carregar os dados do Painel.");
  const data = value as DashboardData;
  if (
    !data.metrics ||
    !data.spark ||
    !data.status ||
    !data.performance ||
    ![data.trend, data.latestOrders, data.todayAgenda, data.priorities].every(
      Array.isArray,
    )
  )
    throw new Error("O Painel recebeu dados incompletos. Tente novamente.");
  const number = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
  return {
    ...data,
    metrics: Object.fromEntries(
      Object.entries(data.metrics).map(([key, n]) => [key, number(n)]),
    ) as DashboardData["metrics"],
    status: Object.fromEntries(
      Object.entries(data.status).map(([key, n]) => [key, number(n)]),
    ) as DashboardData["status"],
    performance: {
      completionRate: Math.min(100, number(data.performance.completionRate)),
      averageRepairDays:
        data.performance.averageRepairDays == null
          ? null
          : number(data.performance.averageRepairDays),
    },
    spark: Object.fromEntries(
      Object.entries(data.spark).map(([key, values]) => [
        key,
        Array.isArray(values) ? values.map(number) : [],
      ]),
    ) as DashboardData["spark"],
    trend: data.trend
      .filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.key))
      .map((item) => ({
        ...item,
        opened: number(item.opened),
        active: number(item.active),
        finalized: number(item.finalized),
      })),
  };
}
