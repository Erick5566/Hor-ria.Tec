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
    parts?: number;
    ready?: number;
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
    ...trend.flatMap((item) => [
      item.opened,
      item.active,
      item.ready ?? 0,
      item.parts ?? 0,
    ]),
  );
  const points = (key: "opened" | "active" | "finalized" | "parts" | "ready") =>
    trend.map((item, index) => ({
      x: trend.length === 1 ? 50 : 4 + (index / (trend.length - 1)) * 92,
      y: 88 - ((item[key] ?? 0) / max) * 72,
      value: item[key] ?? 0,
      key: item.key,
    }));
  return {
    points,
    hasData: trend.some(
      (item) =>
        item.opened > 0 ||
        item.active > 0 ||
        (item.ready ?? 0) > 0 ||
        (item.parts ?? 0) > 0,
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
        parts: number(item.parts),
        ready: number(item.ready),
      })),
  };
}

type SparkPoint = { x: number; y: number };

export function sparkGeometry(
  values: number[],
  width = 100,
  height = 46,
  padding = 4,
) {
  const safe = values.length ? values : [0, 0];
  const min = 0;
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
        : height - padding - ((value - min) / range) * (height - padding * 2);
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

  return { line, area, last, hasData: values.some((value) => value > 0) };
}
