"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase, message, today, shift, Servico } from "@/lib/supabase";
import { Item, Orcamento, money } from "@/lib/assistencia";
import { ErrorBox, Empty } from "./ui";

function quoteStatus(status: string) {
  const labels: Record<string, string> = {
    rascunho: "Rascunho",
    enviado: "Enviado ao cliente",
    aprovado: "Aprovado",
    recusado: "Recusado",
    alteracao_solicitada: "Alteração solicitada",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function subtotal(items: Item[]) {
  return items.reduce(
    (sum, item) => sum + Number(item.quantidade) * Number(item.valor),
    0,
  );
}

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
    [catalog, setCatalog] = useState<(Servico & { preco: number })[]>([]),
    [stock, setStock] = useState<
      { id: string; nome: string; preco: number; quantidade: number }[]
    >([]),
    [catalogLoaded, setCatalogLoaded] = useState(false),
    [catalogLoading, setCatalogLoading] = useState(false),
    [labor, setLabor] = useState(0),
    [discount, setDiscount] = useState(0),
    [validity, setValidity] = useState(shift(today(), 7)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  const latest = quotes[0];
  const servicesSubtotal = subtotal(services);
  const partsSubtotal = subtotal(parts);
  const gross = servicesSubtotal + partsSubtotal + labor;
  const total = gross - discount;

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

  async function ensureCatalog() {
    if (catalogLoaded || catalogLoading) return;
    setCatalogLoading(true);
    try {
      const [servicesResult, stockResult] = await Promise.all([
        supabase!
          .from("servicos")
          .select("id,nome,preco,duracao,categoria,descricao,garantia_dias,ativo")
          .eq("ativo", true)
          .order("nome"),
        supabase!
          .from("pecas")
          .select("id,nome,preco,quantidade")
          .eq("ativo", true)
          .gt("quantidade", 0)
          .order("nome"),
      ]);
      if (servicesResult.error || stockResult.error)
        throw servicesResult.error || stockResult.error;
      setCatalog(
        (servicesResult.data || []) as (Servico & { preco: number })[],
      );
      setStock(
        (stockResult.data || []) as {
          id: string;
          nome: string;
          preco: number;
          quantidade: number;
        }[],
      );
      setCatalogLoaded(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setCatalogLoading(false);
    }
  }

  async function start() {
    setServices(latest?.servicos || []);
    setParts(latest?.pecas || []);
    setLabor(Number(latest?.mao_obra) || 0);
    setDiscount(Number(latest?.desconto) || 0);
    setValidity(shift(today(), 7));
    setEditing(true);
    await ensureCatalog();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
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
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  async function recordCustomerDecision(decision: string) {
    if (!latest) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!.rpc("responder_orcamento", {
        p_orcamento: latest.id,
        p_decisao: decision,
        p_observacao: "Resposta registrada manualmente pela assistência",
      });
      if (error) throw error;
      await load();
      onChanged();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  const editor = (
    items: Item[],
    set: (items: Item[]) => void,
    label: string,
  ) => (
    <div className="quote-editor-block">
      <div className="quote-editor-title">
        <h3>{label}</h3>
        <strong>{money(subtotal(items))}</strong>
      </div>
      {items.length === 0 && (
        <p className="quote-editor-empty">
          Nenhum item adicionado. Você pode selecionar um cadastro acima ou
          inserir manualmente.
        </p>
      )}
      {items.map((item, index) => (
        <div className="quote-item" key={index}>
          <label>
            Descrição
            <input
              required
              minLength={2}
              maxLength={200}
              value={item.nome}
              onChange={(event) =>
                set(
                  items.map((value, itemIndex) =>
                    itemIndex === index
                      ? { ...value, nome: event.target.value }
                      : value,
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
              onChange={(event) =>
                set(
                  items.map((value, itemIndex) =>
                    itemIndex === index
                      ? { ...value, quantidade: Number(event.target.value) }
                      : value,
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
              max={10000000}
              step="0.01"
              value={item.valor}
              onChange={(event) =>
                set(
                  items.map((value, itemIndex) =>
                    itemIndex === index
                      ? { ...value, valor: Number(event.target.value) }
                      : value,
                  ),
                )
              }
            />
          </label>
          <div className="quote-item-total">
            <small>Subtotal</small>
            <strong>
              {money(Number(item.quantidade) * Number(item.valor))}
            </strong>
          </div>
          <button
            type="button"
            aria-label={`Remover ${item.nome || label}`}
            onClick={() => set(items.filter((_, itemIndex) => index !== itemIndex))}
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
        + Adicionar item manualmente
      </button>
    </div>
  );

  const latestServicesSubtotal = latest ? subtotal(latest.servicos) : 0;
  const latestPartsSubtotal = latest ? subtotal(latest.pecas) : 0;

  return (
    <section className="panel quote-detail-panel">
      <div className="panel-head">
        <div>
          <h2>Orçamento detalhado</h2>
          <p>Informe serviços, peças, mão de obra, desconto e validade.</p>
        </div>
        <button className="outline" onClick={start}>
          {latest ? "Criar nova versão" : "+ Criar orçamento"}
        </button>
      </div>
      <ErrorBox error={error} />

      {editing ? (
        <form className="quote-editor-form" onSubmit={save}>
          <div className="quote-editor-notice">
            <strong>O cliente verá exatamente estes valores.</strong>
            <span>
              Ao salvar, esta versão será enviada para aprovação e a notificação
              de WhatsApp será enfileirada automaticamente.
            </span>
          </div>

          <div className="form-grid">
            <label>
              Adicionar serviço cadastrado
              <select
                value=""
                disabled={catalogLoading}
                onChange={(event) => {
                  const service = catalog.find(
                    (item) => item.id === event.target.value,
                  );
                  if (service)
                    setServices([
                      ...services,
                      {
                        nome: service.nome,
                        valor: Number(service.preco),
                        quantidade: 1,
                        servico_id: service.id,
                      },
                    ]);
                }}
              >
                <option value="">
                  {catalogLoading ? "Carregando serviços..." : "Selecione"}
                </option>
                {catalog.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nome} · {money(Number(service.preco))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Adicionar peça do estoque
              <select
                value=""
                disabled={catalogLoading}
                onChange={(event) => {
                  const part = stock.find(
                    (item) => item.id === event.target.value,
                  );
                  if (part)
                    setParts([
                      ...parts,
                      {
                        nome: part.nome,
                        valor: Number(part.preco),
                        quantidade: 1,
                        peca_id: part.id,
                      },
                    ]);
                }}
              >
                <option value="">
                  {catalogLoading ? "Carregando estoque..." : "Selecione"}
                </option>
                {stock.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.nome} · {money(Number(part.preco))} ·{" "}
                    {part.quantidade} em estoque
                  </option>
                ))}
              </select>
            </label>
          </div>

          {editor(services, setServices, "Serviços")}
          {editor(parts, setParts, "Peças e materiais")}

          <div className="form-grid quote-cost-fields">
            <label>
              Mão de obra
              <input
                type="number"
                min={0}
                max={10000000}
                step="0.01"
                value={labor}
                onChange={(event) => setLabor(Number(event.target.value))}
              />
            </label>
            <label>
              Desconto
              <input
                type="number"
                min={0}
                step="0.01"
                max={Math.max(0, gross)}
                value={discount}
                onChange={(event) => setDiscount(Number(event.target.value))}
              />
            </label>
            <label>
              Validade
              <input
                required
                type="date"
                min={today()}
                max={shift(today(), 90)}
                value={validity}
                onChange={(event) => setValidity(event.target.value)}
              />
            </label>
          </div>

          <div className="quote-editor-summary">
            <div>
              <span>Serviços</span>
              <strong>{money(servicesSubtotal)}</strong>
            </div>
            <div>
              <span>Peças e materiais</span>
              <strong>{money(partsSubtotal)}</strong>
            </div>
            <div>
              <span>Mão de obra</span>
              <strong>{money(labor)}</strong>
            </div>
            <div>
              <span>Desconto</span>
              <strong>- {money(discount)}</strong>
            </div>
            <div className="grand-total">
              <span>Total que o cliente receberá</span>
              <strong>{money(total)}</strong>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="outline"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy || total < 0}>
              {busy ? "Enviando…" : "Salvar e enviar ao cliente →"}
            </button>
          </div>
        </form>
      ) : latest ? (
        <div className="quote-current">
          <div className="quote-current-head">
            <div>
              <strong>Versão {latest.versao}</strong>
              <small>
                Validade:{" "}
                {latest.validade.slice(0, 10).split("-").reverse().join("/")}
              </small>
            </div>
            <span className={`quote-status ${latest.status}`}>
              {quoteStatus(latest.status)}
            </span>
          </div>

          {latest.servicos.length > 0 && (
            <div className="quote-review-block">
              <div className="quote-review-title">
                <strong>Serviços</strong>
                <span>{money(latestServicesSubtotal)}</span>
              </div>
              {latest.servicos.map((item, index) => (
                <div className="quote-review-line" key={`service-${index}`}>
                  <span>
                    <strong>{item.nome}</strong>
                    <small>
                      {item.quantidade} × {money(Number(item.valor))}
                    </small>
                  </span>
                  <b>{money(Number(item.quantidade) * Number(item.valor))}</b>
                </div>
              ))}
            </div>
          )}

          {latest.pecas.length > 0 && (
            <div className="quote-review-block">
              <div className="quote-review-title">
                <strong>Peças e materiais</strong>
                <span>{money(latestPartsSubtotal)}</span>
              </div>
              {latest.pecas.map((item, index) => (
                <div className="quote-review-line" key={`part-${index}`}>
                  <span>
                    <strong>{item.nome}</strong>
                    <small>
                      {item.quantidade} × {money(Number(item.valor))}
                    </small>
                  </span>
                  <b>{money(Number(item.quantidade) * Number(item.valor))}</b>
                </div>
              ))}
            </div>
          )}

          <div className="quote-editor-summary compact">
            <div>
              <span>Serviços</span>
              <strong>{money(latestServicesSubtotal)}</strong>
            </div>
            <div>
              <span>Peças e materiais</span>
              <strong>{money(latestPartsSubtotal)}</strong>
            </div>
            <div>
              <span>Mão de obra</span>
              <strong>{money(Number(latest.mao_obra))}</strong>
            </div>
            <div>
              <span>Desconto</span>
              <strong>- {money(Number(latest.desconto))}</strong>
            </div>
            <div className="grand-total">
              <span>Total do trabalho</span>
              <strong>{money(Number(latest.total))}</strong>
            </div>
          </div>

          {latest.resposta && (
            <div className="notice">
              <strong>Observação da resposta</strong>
              <p>{latest.resposta}</p>
            </div>
          )}

          {latest.status === "enviado" && (
            <>
              <div className="notice">
                <p>
                  O cliente recebeu o valor total e pode abrir o link para ver
                  serviços, peças, mão de obra, desconto e responder.
                </p>
                <a
                  className="outline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/${telefone.length <= 11 ? "55" : ""}${telefone}?text=${encodeURIComponent(
                    `Seu orçamento da OS está disponível. Total: ${money(
                      Number(latest.total),
                    )}. Veja os detalhes e responda: ${
                      typeof window === "undefined" ? "" : window.location.origin
                    }/acompanhar/${trackingToken}`,
                  )}`}
                >
                  Reenviar orçamento pelo WhatsApp ↗
                </a>
              </div>

              <details className="quote-manual-response">
                <summary>Registrar manualmente a resposta do cliente</summary>
                <p>
                  Use apenas quando o cliente responder fora do link, por
                  exemplo por telefone ou presencialmente.
                </p>
                <div className="inline-actions">
                  <button
                    disabled={busy}
                    onClick={() => recordCustomerDecision("aprovado")}
                  >
                    Registrar aprovação
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => recordCustomerDecision("recusado")}
                  >
                    Registrar recusa
                  </button>
                </div>
              </details>
            </>
          )}
        </div>
      ) : (
        <Empty title="Esta ordem ainda não tem orçamento." />
      )}

      {quotes.length > 1 && (
        <details className="quote-history">
          <summary>Versões anteriores ({quotes.length - 1})</summary>
          {quotes.slice(1).map((quote) => (
            <div className="list-line" key={quote.id}>
              <span>
                Versão {quote.versao} · {quoteStatus(quote.status)}
              </span>
              <strong>{money(Number(quote.total))}</strong>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
