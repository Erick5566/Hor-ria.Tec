import type { DashboardData } from "@/lib/dashboard";
import { Empty } from "./ui";

const series = [
  {
    key: "bookings",
    label: "Agendamentos",
    lines: ["Agendamentos"],
    color: "#f97316",
  },
  { key: "opened", label: "Abertos", lines: ["Abertos"], color: "#7c3aed" },
  {
    key: "active",
    label: "Em andamento",
    lines: ["Em", "andamento"],
    color: "#2563eb",
  },
  {
    key: "parts",
    label: "Aguardando peça",
    lines: ["Aguardando", "peça"],
    color: "#d97706",
  },
  {
    key: "ready",
    label: "Pronto para retirada",
    lines: ["Pronto para", "retirada"],
    color: "#0d9488",
  },
  {
    key: "finished",
    label: "Concluídos",
    lines: ["Concluídos"],
    color: "#16a34a",
  },
] as const;

export function DashboardOrderCharts({
  counts,
}: {
  counts: DashboardData["serviceChart"];
}) {
  const values = series.map((item) => counts?.[item.key] ?? 0);
  const hasData = values.some((value) => value > 0);
  const tickStep = Math.max(1, Math.ceil(Math.max(1, ...values) / 5));
  const axisMax = Math.ceil(Math.max(1, ...values) / tickStep) * tickStep;
  const ticks = Array.from(
    { length: axisMax / tickStep + 1 },
    (_, index) => index * tickStep,
  );
  const y = (value: number) => 230 - (value / axisMax) * 196;
  return (
    <figure className="dashboard-order-chart">
      {hasData ? (
        <div className="dashboard-order-plot-scroll">
          <svg
            viewBox="0 0 720 290"
            role="img"
            aria-label="Quantidade de agendamentos e serviços por status no período selecionado"
          >
            {ticks.map((value) => (
              <g key={value} className="dashboard-chart-tick">
                <line
                  x1="46"
                  x2="708"
                  y1={y(value)}
                  y2={y(value)}
                  className="dash-grid-line"
                />
                <text x="36" y={y(value) + 4} textAnchor="end">
                  {value}
                </text>
              </g>
            ))}
            <path d="M46 34 V230 H708" className="dashboard-chart-axis-line" />
            {series.map((item, index) => {
              const value = values[index];
              const x = 104 + index * 108;
              return (
                <g key={item.key} aria-label={`${item.label}: ${value}`}>
                  <rect
                    x={x - 24}
                    y={y(value)}
                    width="48"
                    height={230 - y(value)}
                    fill={item.color}
                    className="dashboard-service-bar"
                  >
                    <title>{`${item.label}: ${value}`}</title>
                  </rect>
                  <text
                    x={x}
                    y={y(value) - 9}
                    textAnchor="middle"
                    className="dashboard-bar-value"
                  >
                    {value}
                  </text>
                  <text
                    x={x}
                    y="252"
                    textAnchor="middle"
                    className="dashboard-bar-label"
                  >
                    {item.lines.map((line, lineIndex) => (
                      <tspan key={line} x={x} dy={lineIndex === 0 ? 0 : 15}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <Empty title="Nenhum serviço ou agendamento no período selecionado." />
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
