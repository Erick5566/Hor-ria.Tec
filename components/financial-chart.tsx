"use client";

import { useId, useState, type PointerEvent } from "react";
import { money } from "@/lib/assistencia";

export type FinancialPoint = { key: string; revenue: number; expense: number };
const series = [
  { key: "revenue", label: "Receitas", color: "#15966b" },
  { key: "expense", label: "Despesas", color: "#e05a70" },
] as const;
const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const shortDate = (key: string) =>
  new Date(key + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

/** Shared presentation only: totals and paid-entry filtering belong to the caller. */
export function FinancialChart({
  data,
  variant = "line",
  loading = false,
}: {
  data: FinancialPoint[];
  variant?: "line" | "bar";
  loading?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedIndex = data.findIndex((point) => point.key === selectedKey);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : data.length - 1;
  const active = data[activeIndex];
  const hasMovement = data.some(
    (point) => point.revenue !== 0 || point.expense !== 0,
  );
  const max = Math.max(
    1,
    ...data.flatMap((point) => [point.revenue, point.expense]),
  );
  const min = Math.min(
    0,
    ...data.flatMap((point) => [point.revenue, point.expense]),
  );
  const x = (index: number) =>
    78 + (index / Math.max(1, data.length - 1)) * 550;
  const y = (value: number) => 216 - ((value - min) / (max - min)) * 180;
  const baseline = y(0);
  const points = (key: "revenue" | "expense") =>
    data.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");
  const readPoint = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const coordinate = ((event.clientX - bounds.left) / bounds.width) * 660;
    const index = Math.max(
      0,
      Math.min(
        data.length - 1,
        Math.round(((coordinate - 78) / 550) * (data.length - 1)),
      ),
    );
    if (data[index]) setSelectedKey(data[index].key);
  };
  const description = active
    ? `${shortDate(active.key)}: receitas ${money(active.revenue)}, despesas ${money(active.expense)}`
    : "";

  if (loading)
    return (
      <div className="analytics-chart-state" role="status">
        Carregando movimentações…
      </div>
    );
  if (!hasMovement)
    return (
      <div className="analytics-chart-state">
        <strong>Nenhuma movimentação neste período</strong>
        <span>As entradas e saídas pagas aparecerão aqui.</span>
      </div>
    );

  return (
    <figure className="analytics-financial-chart">
      <figcaption className="analytics-chart-legend">
        {series.map((item) => (
          <span key={item.key}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="analytics-chart-unit">Valores em R$</span>
      </figcaption>
      <div
        className="analytics-plot-scroll"
        tabIndex={0}
        role="region"
        aria-label="Gráfico diário; role horizontalmente em telas pequenas"
      >
        <svg
          viewBox="0 0 660 252"
          role="img"
          aria-label={
            variant === "line"
              ? "Evolução diária de receitas e despesas"
              : "Entradas e saídas pagas por dia"
          }
          onPointerMove={readPoint}
          onPointerDown={readPoint}
        >
          <title>{description}</title>
          <defs>
            {series.map((item) => (
              <linearGradient
                key={item.key}
                id={`${id}-${item.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity=".18" />
                <stop offset="100%" stopColor={item.color} stopOpacity=".01" />
              </linearGradient>
            ))}
          </defs>
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = min + ((max - min) * tick) / 4;
            return (
              <g key={tick}>
                <line
                  x1="66"
                  x2="640"
                  y1={y(value)}
                  y2={y(value)}
                  className="analytics-grid"
                />
                <text
                  x="56"
                  y={y(value) + 4}
                  textAnchor="end"
                  className="analytics-axis-label"
                >
                  {compact.format(value)}
                </text>
              </g>
            );
          })}
          {series.map((item, seriesIndex) =>
            variant === "line" ? (
              <g key={item.key}>
                <polygon
                  points={`78,${baseline} ${points(item.key)} ${x(data.length - 1)},${baseline}`}
                  fill={`url(#${id}-${item.key})`}
                />
                <polyline
                  points={points(item.key)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={item.key === "expense" ? "6 4" : undefined}
                />
              </g>
            ) : (
              <g key={item.key}>
                {data.map((point, index) => {
                  const width = Math.min(14, 220 / data.length);
                  return (
                    <rect
                      key={point.key}
                      x={x(index) + (seriesIndex === 0 ? -width - 1 : 1)}
                      y={Math.min(baseline, y(point[item.key]))}
                      width={width}
                      height={Math.abs(baseline - y(point[item.key]))}
                      rx="2"
                      fill={item.color}
                    >
                      <title>{`${shortDate(point.key)} · ${item.label}: ${money(point[item.key])}`}</title>
                    </rect>
                  );
                })}
              </g>
            ),
          )}
          <line
            x1={x(activeIndex)}
            x2={x(activeIndex)}
            y1="30"
            y2="216"
            className="analytics-cursor"
          />
          {data.map((point, index) =>
            index === 0 ||
            index === data.length - 1 ||
            index % Math.max(1, Math.ceil(data.length / 4)) === 0 ? (
              <text
                key={point.key}
                x={x(index)}
                y="242"
                textAnchor="middle"
                className="analytics-axis-label"
              >
                {shortDate(point.key)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <label className="analytics-day-picker">
        <span>
          Consultar dia <b>{active ? shortDate(active.key) : "—"}</b>
        </span>
        <input
          type="range"
          min="0"
          max={Math.max(0, data.length - 1)}
          value={Math.max(0, activeIndex)}
          onChange={(event) =>
            setSelectedKey(data[Number(event.target.value)].key)
          }
          aria-label="Dia do gráfico"
          aria-valuetext={description}
        />
      </label>
      {active ? (
        <dl className="analytics-day-values">
          <div>
            <dt>Receitas</dt>
            <dd>{money(active.revenue)}</dd>
          </div>
          <div>
            <dt>Despesas</dt>
            <dd>{money(active.expense)}</dd>
          </div>
          <div>
            <dt>Saldo do dia</dt>
            <dd>{money(active.revenue - active.expense)}</dd>
          </div>
        </dl>
      ) : null}
      <details className="analytics-data-table">
        <summary>Ver valores em tabela</summary>
        <div
          className="analytics-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Valores diários do gráfico"
        >
          <table>
            <caption>Movimentações pagas por dia</caption>
            <thead>
              <tr>
                <th scope="col">Dia</th>
                <th scope="col">Receitas</th>
                <th scope="col">Despesas</th>
                <th scope="col">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.key}>
                  <th scope="row">{shortDate(point.key)}</th>
                  <td>{money(point.revenue)}</td>
                  <td>{money(point.expense)}</td>
                  <td>{money(point.revenue - point.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
