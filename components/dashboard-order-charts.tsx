import { trendGeometry, type DashboardData } from "@/lib/dashboard";
import { Empty } from "./ui";

const series = [
  { key: "opened", label: "Abertas", color: "#7c3aed" },
  { key: "active", label: "Em andamento", color: "#2563eb" },
  { key: "finalized", label: "Concluídas", color: "#16a34a" },
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
  return (
    <figure className="dashboard-order-chart">
      {geometry.hasData ? (
        <>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="Evolução diária das ordens: abertas, em andamento, concluídas e aguardando peças"
          >
            {[18, 36, 54, 72, 88].map((y) => (
              <line
                key={y}
                x1="0"
                x2="100"
                y1={y}
                y2={y}
                className="dash-grid-line"
              />
            ))}
            {series.map((item) => {
              const points = geometry.points(item.key);
              return (
                <g
                  key={item.key}
                  style={{ color: item.color }}
                  aria-label={item.label}
                >
                  <polyline
                    points={points
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                    className="dashboard-series-line"
                  />
                  {points
                    .filter((point) => point.value > 0 || points.length === 1)
                    .map((point) => (
                      <circle
                        key={point.key}
                        cx={point.x}
                        cy={point.y}
                        r="1.2"
                        className={`dash-point ${item.key}`}
                        style={{ fill: "currentColor" }}
                      >
                        <title>{`${item.label} — ${shortDate(point.key)}: ${point.value}`}</title>
                      </circle>
                    ))}
                </g>
              );
            })}
          </svg>
          <div className="dashboard-series-axis">
            {trend
              .filter(
                (_, index) =>
                  index === 0 ||
                  index === Math.floor((trend.length - 1) / 2) ||
                  index === trend.length - 1,
              )
              .map((point) => (
                <span key={point.key}>{shortDate(point.key)}</span>
              ))}
          </div>
        </>
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
