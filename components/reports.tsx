"use client";
import { useCallback, useEffect, useState } from "react";
import { money, statuses, type Status } from "@/lib/assistencia";
import { message, supabase, today } from "@/lib/supabase";
import { ErrorBox, MetricCard, MetricGrid } from "./ui";
import { useWorkspace } from "./workspace";

type ReportRow = {
  id: string;
  numero: number;
  criado_em: string;
  status: Status;
  equipamento_modelo: string;
};

type ReportsData = {
  metrics: {
    orders: number;
    income: number;
    cost: number;
  };
  statuses: Partial<Record<Status, number>>;
  rows: ReportRow[];
};

export default function Reports() {
  const { empresa } = useWorkspace();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!supabase) return;
      if (!silent) setLoading(true);
      try {
        const result = await supabase.rpc("reports_month_overview", {
          p_month: month,
        });
        if (result.error) throw result.error;
        setData(result.data as ReportsData);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [month],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!supabase || !empresa.id) return;

    let timer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(true), 300);
    };

    const channel = supabase
      .channel(`reports-${empresa.id}`)
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
          table: "financeiro",
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

  function exportCSV() {
    const cell = (value: unknown) =>
      '"' +
      String(value ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';

    const csv = [
      ["OS", "Entrada", "Equipamento", "Status"],
      ...(data?.rows || []).map((row) => [
        row.numero,
        row.criado_em,
        row.equipamento_modelo,
        statuses[row.status],
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `horaria-ordens-${month}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const income = Number(data?.metrics.income || 0);
  const cost = Number(data?.metrics.cost || 0);

  return (
    <>
      <ErrorBox error={error} />

      <div className="toolbar">
        <label>
          Mês
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <button disabled={loading || !data?.rows.length} onClick={exportCSV}>
          Exportar ordens em CSV
        </button>
      </div>

      <MetricGrid columns={4}>
        <MetricCard
          label="Ordens recebidas"
          value={loading && !data ? "—" : data?.metrics.orders || 0}
          note="Entradas no mês"
          icon="▤"
        />
        <MetricCard
          label="Receitas"
          value={loading && !data ? "—" : money(income)}
          note="Entradas financeiras"
          icon="↗"
          tone="success"
        />
        <MetricCard
          label="Despesas"
          value={loading && !data ? "—" : money(cost)}
          note="Saídas financeiras"
          icon="↘"
          tone="danger"
        />
        <MetricCard
          label="Saldo do mês"
          value={loading && !data ? "—" : money(income - cost)}
          note="Receitas menos despesas"
          icon="="
          tone={income - cost < 0 ? "danger" : "primary"}
          active={income !== cost}
          emphasizeValue={income - cost < 0}
        />
      </MetricGrid>

      <section className="panel">
        <h2>Situação das ordens recebidas no mês</h2>
        {Object.entries(statuses).map(([key, label]) => (
          <div className="list-line" key={key}>
            <span>{label}</span>
            <strong>
              {data?.statuses?.[key as Status] || 0}
            </strong>
          </div>
        ))}
      </section>
    </>
  );
}
