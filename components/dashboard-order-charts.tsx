import { trendGeometry, type DashboardData } from "@/lib/dashboard";
import { Empty } from "./ui";

const series = [
  { key: "opened", label: "Abertas", color: "#7c3aed" },
  { key: "active", label: "Em andamento", color: "#2563eb" },
  { key: "ready", label: "Pronto para retirada", color: "#16a34a" },
  { key: "parts", label: "Aguardando peças", color: "#d97706" },
] as const;
const shortDate = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

export function DashboardOrderCharts({
  trend,
}: {
  trend: DashboardData["trend"];
}) {
  const geometry = trendGeometry(trend);
  const firstDay = trend[0]?.key;
  const lastDay = trend.at(-1)?.key;
  const monthView =
    firstDay?.endsWith("-01") && firstDay?.slice(0, 7) === lastDay?.slice(0, 7);
  const daysInMonth = firstDay
    ? new Date(
        Date.UTC(Number(firstDay.slice(0, 4)), Number(firstDay.slice(5, 7)), 0),
      ).getUTCDate()
    : 0;
  const axisDays = monthView
    ? Array.from(
        { length: daysInMonth },
        (_, index) =>
          `${firstDay!.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`,
      )
    : trend.map((point) => point.key);
  const maxValue = Math.max(
    1,
    ...trend.flatMap((point) => [
      point.opened,
      point.active,
      point.ready ?? 0,
      point.parts ?? 0,
    ]),
  );
  const tickStep = Math.max(1, Math.ceil(maxValue / 5));
  const axisMax = Math.ceil(maxValue / tickStep) * tickStep;
  const yTicks = Array.from(
    { length: axisMax / tickStep + 1 },
    (_, index) => index * tickStep,
  );
  const x = (index: number) =>
    axisDays.length === 1 ? 467 : 44 + (index / (axisDays.length - 1)) * 846;
  const y = (value: number) => 216 - (value / axisMax) * 196;
  return (
    <figure className="dashboard-order-chart">
      {geometry.hasData ? (
        <div className="dashboard-order-plot-scroll">
          <svg
            viewBox="0 0 910 252"
            preserveAspectRatio="none"
            role="img"
            aria-label="Evolução diária das ordens: abertas, em andamento, prontas para retirada e aguardando peças. Eixo horizontal: dias. Eixo vertical: quantidade de ordens."
          >
            {yTicks.map((value) => (
              <g key={value} className="dashboard-chart-tick">
                <line
                  x1="44"
                  x2="890"
                  y1={y(value)}
                  y2={y(value)}
                  className="dash-grid-line"
                />
                <text x="34" y={y(value) + 4} textAnchor="end">
                  {value}
                </text>
              </g>
            ))}
            <path d="M44 20 V216 H890" className="dashboard-chart-axis-line" />
            {axisDays.map((day, index) => (
              <g key={day} className="dashboard-chart-tick">
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1="216"
                  y2="222"
                  className="dashboard-chart-axis-line"
                />
                <text x={x(index)} y="240" textAnchor="middle">
                  {Number(day.slice(8, 10))}
                  <title>{shortDate(day)}</title>
                </text>
              </g>
            ))}
            {series.map((item) => {
              const points = trend.map((point, index) => ({
                x: x(index),
                y: y(point[item.key] ?? 0),
              }));
              // A short segment keeps a single day's value visible without a dot.
              const linePoints =
                points.length === 1
                  ? `${points[0].x - 5},${points[0].y} ${points[0].x + 5},${points[0].y}`
                  : points.map((point) => `${point.x},${point.y}`).join(" ");
              return (
                <polyline
                  key={item.key}
                  style={{ color: item.color }}
                  aria-label={item.label}
                  points={linePoints}
                  className="dashboard-series-line"
                >
                  <title>{`${item.label}: ${trend.map((point) => `${shortDate(point.key)}: ${point[item.key] ?? 0}`).join("; ")}`}</title>
                </polyline>
              );
            })}
          </svg>
        </div>
      ) : (
        <Empty title="Nenhuma ordem no período selecionado." />
      )}
      <figcaption className="dashboard-order-legend">
        {series.map((item) => (
          <span key={item.key} style={{ color: item.color }}>
            <i aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
