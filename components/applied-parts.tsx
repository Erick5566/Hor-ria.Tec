"use client";
import { useCallback, useEffect, useState } from "react";
import { stamp, money } from "@/lib/assistencia";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, Empty } from "./ui";

type AppliedPart = {
  id: string;
  ordem_id: string;
  peca_id: string | null;
  nome: string;
  quantidade: number;
  custo_unitario: number;
  valor_venda_unitario: number;
  mao_obra: number;
  criado_em: string;
};

type StockOption = {
  id: string;
  nome: string;
  quantidade: number;
  custo: number;
  preco: number;
};

type AppliedPartsData = {
  applied: AppliedPart[];
  stock: StockOption[];
};

export default function AppliedParts({
  orderIds,
  readOnly = false,
}: {
  orderIds: string[];
  readOnly?: boolean;
}) {
  const orderId = orderIds[0];
  const [data, setData] = useState<AppliedPartsData>({
    applied: [],
    stock: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stockId, setStockId] = useState("");

  const load = useCallback(async () => {
    if (!orderId || !supabase) return;
    setLoading(true);
    try {
      const result = await supabase.rpc("applied_parts_options", {
        p_order: orderId,
      });
      if (result.error) throw result.error;
      setData(result.data as AppliedPartsData);
      setError("");
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">
      <h2>Peças aplicadas</h2>
      <p>
        Registre cada componente realmente usado no reparo. O vínculo com o
        estoque é opcional.
      </p>

      <ErrorBox error={error} />

      {!readOnly && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const form = event.currentTarget;
            const values = new FormData(form);
            const result = await supabase!.rpc(
              "registrar_peca_aplicada_valores",
              {
                p_ordem: orderId,
                p_nome: values.get("nome"),
                p_quantidade: Number(values.get("quantidade")),
                p_peca: stockId || null,
                p_custo_unitario: Number(values.get("custo")),
                p_valor_venda_unitario: Number(values.get("venda")),
                p_mao_obra: Number(values.get("mao_obra")),
              },
            );

            if (result.error) setError(message(result.error));
            else {
              form.reset();
              setStockId("");
              await load();
            }
            setBusy(false);
          }}
        >
          <div className="form-grid">
            <label>
              Peça utilizada
              <input
                name="nome"
                required
                minLength={2}
                maxLength={200}
                placeholder="Ex.: Conector USB-C compatível"
              />
            </label>

            <label>
              Quantidade
              <input
                name="quantidade"
                type="number"
                min={1}
                max={1000}
                defaultValue={1}
                required
              />
            </label>

            <label>
              Vincular ao estoque (opcional)
              <select
                value={stockId}
                disabled={loading}
                onChange={(event) => {
                  const id = event.target.value;
                  setStockId(id);
                  const selected = data.stock.find((part) => part.id === id);

                  const input = event.currentTarget.form?.elements.namedItem(
                    "nome",
                  ) as HTMLInputElement | null;
                  if (selected && input && !input.value)
                    input.value = selected.nome;

                  const cost = event.currentTarget.form?.elements.namedItem(
                    "custo",
                  ) as HTMLInputElement | null;
                  const sale = event.currentTarget.form?.elements.namedItem(
                    "venda",
                  ) as HTMLInputElement | null;

                  if (selected && cost) cost.value = String(selected.custo);
                  if (selected && sale) sale.value = String(selected.preco);
                }}
              >
                <option value="">
                  {loading ? "Carregando estoque..." : "Sem vínculo"}
                </option>
                {data.stock.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.nome} · {part.quantidade} disponíveis
                  </option>
                ))}
              </select>
            </label>

            <label>
              Custo unitário
              <input
                name="custo"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                required
              />
            </label>

            <label>
              Valor cobrado pela peça
              <input
                name="venda"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                required
              />
            </label>

            <label>
              Mão de obra
              <input
                name="mao_obra"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                required
              />
            </label>
          </div>

          <button disabled={busy || loading} className="outline">
            {busy ? "Registrando…" : "Registrar peça aplicada"}
          </button>

          <p className="hint">
            Ao vincular uma peça cadastrada, a quantidade é baixada do estoque
            automaticamente.
          </p>
        </form>
      )}

      {loading ? (
        <p>Carregando peças aplicadas…</p>
      ) : !data.applied.length ? (
        <Empty title="Nenhuma peça aplicada registrada." />
      ) : (
        data.applied.map((item) => (
          <div className="list-line" key={item.id}>
            <span>
              {item.nome} · {item.quantidade} unidade(s)
              {item.peca_id ? " · Estoque atualizado" : ""}
              <small>
                Custo: {money(Number(item.custo_unitario) * item.quantidade)} ·
                Peça:{" "}
                {money(Number(item.valor_venda_unitario) * item.quantidade)} ·
                Mão de obra: {money(item.mao_obra)} · Margem estimada:{" "}
                {money(
                  (Number(item.valor_venda_unitario) -
                    Number(item.custo_unitario)) *
                    item.quantidade +
                    Number(item.mao_obra),
                )}
              </small>
            </span>
            <small>{stamp(item.criado_em)}</small>
          </div>
        ))
      )}
    </section>
  );
}
