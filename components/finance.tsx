"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { Lancamento, Ordem, money, useRows, saveRow } from "@/lib/assistencia";
import { supabase, message, today } from "@/lib/supabase";
import { ErrorBox, Empty } from "./ui";
export default function Finance({ ordemId }: { ordemId?: string }) {
  const { empresa } = useWorkspace(),
    entries = useRows<Lancamento>("financeiro"),
    orders = useRows<Ordem>("ordens_servico");
  const [adding, setAdding] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const data = entries.data.filter((x) => !ordemId || x.ordem_id === ordemId);
  const paid = data.filter((x) => x.status === "pago"),
    sum = (type: string) =>
      paid
        .filter((x) => x.tipo === type)
        .reduce((n, x) => n + Number(x.valor), 0);
  const revenueByOrigin = (origin: Lancamento["origem"]) =>
    paid
      .filter((x) => x.tipo === "receita" && x.origem === origin)
      .reduce((sum, item) => sum + Number(item.valor), 0);
  async function pay(x: Lancamento) {
    setBusy(true);
    setError("");
    const r = await supabase!
      .from("financeiro")
      .update({ status: "pago", pago_em: today() })
      .eq("id", x.id)
      .select("id")
      .single();
    if (r.error) setError(message(r.error));
    else await entries.reload();
    setBusy(false);
  }
  return (
    <>
      <ErrorBox error={error || entries.error || orders.error} />
      <div className="metrics">
        <section className="panel">
          <span>Receitas recebidas</span>
          <h2>{money(sum("receita"))}</h2>
        </section>
        <section className="panel">
          <span>Despesas pagas</span>
          <h2>{money(sum("despesa"))}</h2>
        </section>
        <section className="panel">
          <span>Saldo realizado</span>
          <h2>{money(sum("receita") - sum("despesa"))}</h2>
        </section>
      </div>
      {!ordemId && (
        <div className="metrics finance-origins">
          <section className="panel">
            <span>Receita com reparos</span>
            <h2>{money(revenueByOrigin("reparo"))}</h2>
          </section>
          <section className="panel">
            <span>Receita da loja</span>
            <h2>{money(revenueByOrigin("loja"))}</h2>
          </section>
          <section className="panel">
            <span>Receita de seminovos</span>
            <h2>{money(revenueByOrigin("seminovo"))}</h2>
          </section>
        </div>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>Lançamentos</h2>
          <button className="primary" onClick={() => setAdding(!adding)}>
            {adding ? "Fechar" : "+ Novo lançamento"}
          </button>
        </div>
        {adding && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await saveRow("financeiro", {
                  empresa_id: empresa.id,
                  ordem_id: ordemId || f.get("ordem") || null,
                  descricao: f.get("descricao"),
                  tipo: f.get("tipo"),
                  valor: Number(f.get("valor")),
                  vencimento: f.get("vencimento"),
                  status: f.get("pago") === "on" ? "pago" : "pendente",
                  pago_em: f.get("pago") === "on" ? today() : null,
                  origem:
                    f.get("tipo") === "despesa"
                      ? "despesa"
                      : ordemId || f.get("ordem")
                        ? "reparo"
                        : "manual",
                });
                setAdding(false);
                await entries.reload();
              } catch (e) {
                setError(message(e as Error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Descrição
                <input
                  name="descricao"
                  required
                  minLength={2}
                  maxLength={300}
                />
              </label>
              <label>
                Tipo
                <select name="tipo">
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </label>
              <label>
                Valor
                <input
                  name="valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Vencimento
                <input
                  name="vencimento"
                  type="date"
                  defaultValue={today()}
                  required
                />
              </label>
              {!ordemId && (
                <label>
                  Ordem (opcional)
                  <select name="ordem">
                    <option value="">Sem vínculo</option>
                    {orders.data.map((o) => (
                      <option key={o.id} value={o.id}>
                        OS #{o.numero}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="check-label">
                <input type="checkbox" name="pago" />
                Já recebido / pago hoje
              </label>
            </div>
            <button disabled={busy} className="primary">
              Salvar lançamento
            </button>
          </form>
        )}
        {entries.loading ? (
          <p>Carregando…</p>
        ) : !data.length ? (
          <Empty title="Nenhum lançamento cadastrado" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .sort((a, b) => b.vencimento.localeCompare(a.vencimento))
                  .map((x) => (
                    <tr key={x.id}>
                      <td>{x.descricao}</td>
                      <td>{x.tipo}</td>
                      <td>{money(x.valor)}</td>
                      <td>{x.vencimento.split("-").reverse().join("/")}</td>
                      <td>{x.status}</td>
                      <td>
                        {x.status === "pendente" ? (
                          <button disabled={busy} onClick={() => pay(x)}>
                            Registrar{" "}
                            {x.tipo === "receita" ? "recebimento" : "pagamento"}
                          </button>
                        ) : (
                          x.pago_em?.split("-").reverse().join("/")
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          Registre movimentações já realizadas ou previstas. A Horária não
          processa pagamentos.
        </p>
      </section>
    </>
  );
}
