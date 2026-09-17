"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase, message, today, shift, Servico } from "@/lib/supabase";
import { Item, Orcamento, Peca, money, useRows } from "@/lib/assistencia";
import { ErrorBox, Empty } from "./ui";
export default function Quote({
  ordemId,
  trackingToken,
  telefone,
  onChanged,
}: {
  ordemId: string;
  trackingToken: string;
  telefone: string;
  onChanged: () => void;
}) {
  const [quotes, setQuotes] = useState<Orcamento[]>([]),
    [editing, setEditing] = useState(false),
    [services, setServices] = useState<Item[]>([]),
    [parts, setParts] = useState<Item[]>([]),
    [labor, setLabor] = useState(0),
    [discount, setDiscount] = useState(0),
    [validity, setValidity] = useState(shift(today(), 7)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const catalog = useRows<Servico & { preco: number }>("servicos"),
    stock = useRows<Peca>("pecas");
  const latest = quotes[0];
  const load = useCallback(async () => {
    const { data, error } = await supabase!
      .from("orcamentos")
      .select("*")
      .eq("ordem_id", ordemId)
      .order("versao", { ascending: false });
    if (error) setError(message(error));
    else setQuotes(data as Orcamento[]);
  }, [ordemId]);
  useEffect(() => {
    load();
  }, [load]);
  const total =
    [...services, ...parts].reduce((n, i) => n + i.quantidade * i.valor, 0) +
    labor -
    discount;
  function start() {
    setServices(latest?.servicos || []);
    setParts(latest?.pecas || []);
    setLabor(Number(latest?.mao_obra) || 0);
    setDiscount(Number(latest?.desconto) || 0);
    setEditing(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!.rpc("salvar_orcamento", {
        p_ordem: ordemId,
        p_servicos: services,
        p_pecas: parts,
        p_mao_obra: labor,
        p_desconto: discount,
        p_validade: validity,
      });
      if (error) throw error;
      setEditing(false);
      await load();
      onChanged();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string, decision?: string) {
    if (!latest) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!.rpc(
        name,
        decision
          ? {
              p_orcamento: latest.id,
              p_decisao: decision,
              p_observacao: "Resposta registrada pela assistência",
            }
          : { p_orcamento: latest.id },
      );
      if (error) throw error;
      await load();
      onChanged();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  const editor = (items: Item[], set: (x: Item[]) => void, label: string) => (
    <div>
      <h3>{label}</h3>
      {items.map((item, i) => (
        <div className="quote-item" key={i}>
          <label>
            Descrição
            <input
              required
              minLength={2}
              maxLength={200}
              value={item.nome}
              onChange={(e) =>
                set(
                  items.map((v, j) =>
                    j === i ? { ...v, nome: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Qtd.
            <input
              type="number"
              required
              min={1}
              max={1000}
              value={item.quantidade}
              onChange={(e) =>
                set(
                  items.map((v, j) =>
                    j === i ? { ...v, quantidade: Number(e.target.value) } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Valor unitário
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={item.valor}
              onChange={(e) =>
                set(
                  items.map((v, j) =>
                    j === i ? { ...v, valor: Number(e.target.value) } : v,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label={`Remover ${item.nome || label}`}
            onClick={() => set(items.filter((_, j) => i !== j))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="outline"
        onClick={() => set([...items, { nome: "", quantidade: 1, valor: 0 }])}
      >
        + Adicionar item
      </button>
    </div>
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Orçamento</h2>
        <button className="outline" onClick={start}>
          {latest ? "Criar nova versão" : "+ Criar orçamento"}
        </button>
      </div>
      <ErrorBox error={error || catalog.error || stock.error} />
      {editing ? (
        <form onSubmit={save}>
          <div className="form-grid">
            <label>
              Adicionar serviço cadastrado
              <select
                value=""
                onChange={(e) => {
                  const s = catalog.data.find((s) => s.id === e.target.value);
                  if (s)
                    setServices([
                      ...services,
                      {
                        nome: s.nome,
                        valor: Number(s.preco),
                        quantidade: 1,
                        servico_id: s.id,
                      },
                    ]);
                }}
              >
                <option value="">Selecione</option>
                {catalog.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Adicionar peça do estoque
              <select
                value=""
                onChange={(e) => {
                  const p = stock.data.find((p) => p.id === e.target.value);
                  if (p)
                    setParts([
                      ...parts,
                      {
                        nome: p.nome,
                        valor: Number(p.preco),
                        quantidade: 1,
                        peca_id: p.id,
                      },
                    ]);
                }}
              >
                <option value="">Selecione</option>
                {stock.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {p.quantidade} em estoque
                  </option>
                ))}
              </select>
            </label>
          </div>
          {editor(services, setServices, "Serviços")}
          {editor(parts, setParts, "Peças")}
          <div className="form-grid">
            <label>
              Mão de obra
              <input
                type="number"
                min={0}
                step="0.01"
                value={labor}
                onChange={(e) => setLabor(Number(e.target.value))}
              />
            </label>
            <label>
              Desconto
              <input
                type="number"
                min={0}
                step="0.01"
                max={Math.max(0, total + discount)}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </label>
            <label>
              Validade
              <input
                required
                type="date"
                min={today()}
                value={validity}
                onChange={(e) => setValidity(e.target.value)}
              />
            </label>
          </div>
          <div className="total-line">Total: {money(total)}</div>
          <div className="form-actions">
            <button
              type="button"
              className="outline"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy || total < 0}>
              Salvar versão
            </button>
          </div>
        </form>
      ) : latest ? (
        <>
          <p>
            Versão {latest.versao} · {latest.status} · Validade:{" "}
            {latest.validade.slice(0, 10).split("-").reverse().join("/")}
          </p>
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Qtd.</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {[...latest.servicos, ...latest.pecas].map((i, n) => (
                <tr key={n}>
                  <td>{i.nome}</td>
                  <td>{i.quantidade}</td>
                  <td>{money(i.valor * i.quantidade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Mão de obra: {money(latest.mao_obra)} · Desconto:{" "}
            {money(latest.desconto)}
          </p>
          <div className="total-line">{money(latest.total)}</div>
          {latest.resposta && <p>{latest.resposta}</p>}
          <div className="inline-actions">
            {latest.status === "enviado" && (
              <>
                {[
                  ["aprovado", "Aprovar"],
                  ["recusado", "Recusar"],
                  ["alteracao_solicitada", "Solicitar alteração"],
                ].map(([decision, label]) => (
                  <button
                    key={decision}
                    disabled={busy}
                    onClick={() => action("responder_orcamento", decision)}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
          </div>
          {latest.status === "enviado" && (
            <div className="notice">
              <p>
                Orçamento publicado e notificação automática enfileirada. O
                cliente também pode acessar pelo link seguro abaixo.
              </p>
              <a
                className="outline"
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${telefone.length <= 11 ? "55" : ""}${telefone}?text=${encodeURIComponent(`Seu orçamento está disponível: ${typeof window === "undefined" ? "" : window.location.origin}/acompanhar/${trackingToken}`)}`}
              >
                Reenviar manualmente pelo WhatsApp ↗
              </a>
            </div>
          )}
        </>
      ) : (
        <Empty title="Esta ordem ainda não tem orçamento." />
      )}
      {quotes.length > 1 && (
        <details>
          <summary>Versões anteriores ({quotes.length - 1})</summary>
          {quotes.slice(1).map((q) => (
            <div className="list-line" key={q.id}>
              <span>
                Versão {q.versao} · {q.status}
              </span>
              <strong>{money(q.total)}</strong>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
