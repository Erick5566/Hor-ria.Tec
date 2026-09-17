"use client";
import { useState } from "react";
import {
  Ordem,
  Lancamento,
  Equipamento,
  useRows,
  money,
  statuses,
} from "@/lib/assistencia";
import { today } from "@/lib/supabase";
import { ErrorBox } from "./ui";
export default function Reports() {
  const orders = useRows<Ordem>("ordens_servico"),
    fin = useRows<Lancamento>("financeiro"),
    eq = useRows<Equipamento>("equipamentos");
  const [month, setMonth] = useState(today().slice(0, 7));
  const rows = orders.data.filter((o) => o.criado_em.slice(0, 7) === month),
    paid = fin.data.filter(
      (x) => x.status === "pago" && x.pago_em?.startsWith(month),
    ),
    income = paid
      .filter((x) => x.tipo === "receita")
      .reduce((n, x) => n + Number(x.valor), 0),
    cost = paid
      .filter((x) => x.tipo === "despesa")
      .reduce((n, x) => n + Number(x.valor), 0);
  function exportCSV() {
    const cell = (s: unknown) =>
      '"' +
      String(s ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      ["OS", "Entrada", "Equipamento", "Status"],
      ...rows.map((o) => [
        o.numero,
        o.criado_em,
        eq.data.find((e) => e.id === o.equipamento_id)?.modelo,
        statuses[o.status],
      ]),
    ]
      .map((r) => r.map(cell).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `horaria-ordens-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <ErrorBox error={orders.error || fin.error || eq.error} />
      <div className="toolbar">
        <label>
          Mês
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button disabled={orders.loading || eq.loading} onClick={exportCSV}>
          Exportar ordens em CSV
        </button>
      </div>
      <div className="metrics">
        {[
          ["Ordens recebidas", rows.length],
          ["Receitas", money(income)],
          ["Despesas", money(cost)],
          ["Saldo do mês", money(income - cost)],
        ].map(([label, value]) => (
          <section className="panel" key={label}>
            <span>{label}</span>
            <h2>{value}</h2>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Situação das ordens recebidas no mês</h2>
        {Object.entries(statuses).map(([key, label]) => (
          <div className="list-line" key={key}>
            <span>{label}</span>
            <strong>{rows.filter((o) => o.status === key).length}</strong>
          </div>
        ))}
      </section>
    </>
  );
}
