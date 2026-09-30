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
    <>
      {!geometry.hasData && (
        <Empty title="Nenhuma ordem no período selecionado." />
      )}
      <div className="dashboard-four-charts">
        {series.map((item) => {
          const points = geometry.points(item.key);
          const hasMovement = points.some((point) => point.value > 0);
          return (
            <figure
              key={item.key}
              className="dashboard-series-chart"
              style={{ color: item.color }}
            >
              <figcaption>
                <i aria-hidden="true" />
                <strong>{item.label}</strong>
              </figcaption>
              {hasMovement ? (
                <>
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`Evolução diária: ${item.label}`}
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
                          <title>{`${shortDate(point.key)}: ${point.value}`}</title>
                        </circle>
                      ))}
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
                <div className="dashboard-series-empty">
                  Sem movimento no período
                </div>
              )}
            </figure>
          );
        })}
      </div>
    </>
  );
}
