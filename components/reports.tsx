"use client";
import { subscribeWorkspaceDataChanges } from "@/lib/data-change";
import { useCallback, useEffect, useRef, useState } from "react";
import { money, statuses, type Status } from "@/lib/assistencia";
import { message, supabase, today } from "@/lib/supabase";
import { ErrorBox, MetricCard, MetricGrid, PanelTitle } from "./ui";
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
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        requestRef.current?.abort();
        setLoading(true);
      }

      if (!supabase) {
        if (!silent) {
          setData(null);
          setError("Não foi possível conectar ao banco de dados.");
          setLoading(false);
        }
        return;
      }

      const controller = new AbortController();
      if (!silent) requestRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12000);

      try {
        const result = await supabase
          .rpc("reports_month_overview", { p_month: month })
          .abortSignal(controller.signal);

        if (controller.signal.aborted) {
          throw new Error(
            "O relatório demorou demais para responder. Tente novamente.",
          );
        }
        if (result.error) throw result.error;

        setData(
          (result.data as ReportsData | null) ?? {
            metrics: { orders: 0, income: 0, cost: 0 },
            statuses: {},
            rows: [],
          },
        );
        setError("");
      } catch (caught) {
        if (controller.signal.aborted) {
          setError(
            "O relatório demorou demais para responder. Tente novamente.",
          );
        } else {
          setError(message(caught as Error));
        }
      } finally {
        window.clearTimeout(timeout);
        if (!silent && requestRef.current === controller) {
          requestRef.current = null;
          setLoading(false);
        }
      }
    },
    [month],
  );

  useEffect(() => {
    setData(null);
    void load(false);
    return () => requestRef.current?.abort();
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

    const stopWorkspaceSync = subscribeWorkspaceDataChanges(refreshSoon, [
      "ordens_servico",
      "financeiro",
    ]);
    return () => {
      stopWorkspaceSync();
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, load]);

  function exportCSV() {
    if (!data?.rows.length || exporting) return;

    setExporting(true);
    try {
      const cell = (value: unknown) =>
        '"' +
        String(value ?? "")
          .replace(/^[=+@-]/, "'$&")
          .replaceAll('"', '""') +
        '"';

      const csv = [
        ["OS", "Entrada", "Equipamento", "Status"],
        ...data.rows.map((row) => [
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
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setExporting(false);
    }
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
        <button
          type="button"
          disabled={loading || exporting || !data?.rows.length}
          onClick={exportCSV}
        >
          {loading
            ? "Carregando ordens..."
            : exporting
              ? "Gerando CSV..."
              : data?.rows.length
                ? "Exportar ordens em CSV"
                : "Sem ordens para exportar"}
        </button>
      </div>

      <MetricGrid columns={4}>
        <MetricCard
          label="Ordens recebidas"
          value={loading && !data ? "—" : data?.metrics.orders || 0}
          note="Entradas no mês"
          iconName="orders"
        />
        <MetricCard
          label="Receitas"
          value={loading && !data ? "—" : money(income)}
          note="Entradas financeiras"
          iconName="trend"
          tone="success"
        />
        <MetricCard
          label="Despesas"
          value={loading && !data ? "—" : money(cost)}
          note="Saídas financeiras"
          iconName="receipt"
          tone="danger"
        />
        <MetricCard
          label="Saldo do mês"
          value={loading && !data ? "—" : money(income - cost)}
          note="Receitas menos despesas"
          iconName="finance"
          tone={income - cost < 0 ? "danger" : "primary"}
          active={income !== cost}
          emphasizeValue={income - cost < 0}
        />
      </MetricGrid>

      <section className="panel">
        <PanelTitle
          title="Situação das ordens recebidas no mês"
          icon="reports"
        />
        {Object.entries(statuses).map(([key, label]) => (
          <div className="list-line" key={key}>
            <span>{label}</span>
            <strong>{data?.statuses?.[key as Status] || 0}</strong>
          </div>
        ))}
      </section>
    </>
  );
}
