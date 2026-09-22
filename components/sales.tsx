"use client";
import { useMemo, useState } from "react";
import { Cliente, money, Peca, stamp, useRows, Venda } from "@/lib/assistencia";
import { message, supabase, today } from "@/lib/supabase";
import { useWorkspace } from "./workspace";
import { Empty, ErrorBox, MetricCard, MetricGrid } from "./ui";

type CartItem = {
  peca_id: string;
  nome: string;
  quantidade: number;
  preco: number;
  estoque: number;
};

export default function Sales() {
  const { empresa } = useWorkspace();
  const products = useRows<Peca>("pecas");
  const customers = useRows<Cliente>("clientes");
  const sales = useRows<Venda>("vendas");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    numero: number;
    total: number;
    lucro: number;
  } | null>(null);
  const [discount, setDiscount] = useState(0);
  const subtotal = cart.reduce(
    (sum, item) => sum + item.quantidade * item.preco,
    0,
  );
  const todaySales = useMemo(
    () =>
      sales.data.filter(
        (sale) =>
          sale.vendido_em.startsWith(today()) && sale.status === "finalizada",
      ),
    [sales.data],
  );
  const revenue = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const profit = todaySales.reduce(
    (sum, sale) => sum + Number(sale.total) - Number(sale.custo_total),
    0,
  );
  function add(product: Peca) {
    const current = cart.find((item) => item.peca_id === product.id);
    if (current)
      setCart(
        cart.map((item) =>
          item.peca_id === product.id
            ? {
                ...item,
                quantidade: Math.min(item.estoque, item.quantidade + 1),
              }
            : item,
        ),
      );
    else
      setCart([
        ...cart,
        {
          peca_id: product.id,
          nome: product.nome,
          quantidade: 1,
          preco: Number(product.preco),
          estoque: product.quantidade,
        },
      ]);
  }
  return (
    <>
      <ErrorBox
        error={error || products.error || customers.error || sales.error}
      />
      <MetricGrid columns={3} className="sales-metrics">
        <MetricCard
          label="Vendas de hoje"
          value={todaySales.length}
          note="Vendas finalizadas"
          icon="▤"
        />
        <MetricCard
          label="Faturamento da loja"
          value={money(revenue)}
          note="Total vendido hoje"
          icon="↗"
          tone="success"
        />
        <MetricCard
          label="Lucro bruto estimado"
          value={money(profit)}
          note="Venda menos custo"
          icon="▥"
          tone={profit < 0 ? "danger" : "purple"}
          active={profit !== 0}
          emphasizeValue={profit < 0}
        />
      </MetricGrid>
      <div className="toolbar">
        <div>
          <strong>Venda de balcão</strong>
          <small>Produtos, acessórios e peças sem necessidade de OS.</small>
        </div>
        <button
          className="primary"
          onClick={() => {
            setOpen(true);
            setReceipt(null);
          }}
        >
          + Nova venda
        </button>
      </div>
      {open && (
        <section className="panel sale-editor">
          <div className="panel-head">
            <div>
              <h2>Nova venda</h2>
              <p>Selecione os produtos disponíveis e confirme o pagamento.</p>
            </div>
            <button onClick={() => setOpen(false)}>Fechar</button>
          </div>
          {receipt ? (
            <div className="confirmation">
              <h3>Venda #{receipt.numero} finalizada</h3>
              <strong>{money(receipt.total)}</strong>
              <p>
                Lucro bruto estimado: {money(receipt.lucro)}. Estoque e
                financeiro foram atualizados.
              </p>
              <button
                className="primary"
                onClick={() => {
                  setReceipt(null);
                  setCart([]);
                  setDiscount(0);
                }}
              >
                Iniciar outra venda
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(event.currentTarget);
                const result = await supabase!.rpc("finalizar_venda", {
                  p_empresa: empresa.id,
                  p_cliente: form.get("cliente") || null,
                  p_itens: cart.map(({ peca_id, quantidade, preco }) => ({
                    peca_id,
                    quantidade,
                    preco,
                  })),
                  p_desconto: discount,
                  p_forma: form.get("forma"),
                  p_observacoes: form.get("observacoes") || null,
                });
                if (result.error) setError(message(result.error));
                else {
                  setReceipt(result.data);
                  await Promise.all([products.reload(), sales.reload()]);
                }
                setBusy(false);
              }}
            >
              <div className="sale-layout">
                <div>
                  <label>
                    Adicionar produto
                    <select
                      value=""
                      onChange={(event) => {
                        const product = products.data.find(
                          (item) => item.id === event.target.value,
                        );
                        if (product) add(product);
                      }}
                    >
                      <option value="">Selecione um item</option>
                      {products.data
                        .filter((item) => item.ativo && item.quantidade > 0)
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.nome} · {item.quantidade} disponíveis ·{" "}
                            {money(item.preco)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="sale-cart">
                    {cart.map((item) => (
                      <article key={item.peca_id}>
                        <div>
                          <strong>{item.nome}</strong>
                          <small>{money(item.preco)} por unidade</small>
                        </div>
                        <label>
                          Qtd.
                          <input
                            aria-label={`Quantidade de ${item.nome}`}
                            type="number"
                            min={1}
                            max={item.estoque}
                            value={item.quantidade}
                            onChange={(event) =>
                              setCart(
                                cart.map((value) =>
                                  value.peca_id === item.peca_id
                                    ? {
                                        ...value,
                                        quantidade: Number(event.target.value),
                                      }
                                    : value,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Preço
                          <input
                            aria-label={`Preço de ${item.nome}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.preco}
                            onChange={(event) =>
                              setCart(
                                cart.map((value) =>
                                  value.peca_id === item.peca_id
                                    ? {
                                        ...value,
                                        preco: Number(event.target.value),
                                      }
                                    : value,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={`Remover ${item.nome}`}
                          onClick={() =>
                            setCart(
                              cart.filter(
                                (value) => value.peca_id !== item.peca_id,
                              ),
                            )
                          }
                        >
                          ×
                        </button>
                      </article>
                    ))}
                  </div>
                  {!cart.length && (
                    <Empty
                      title="Carrinho vazio"
                      text="Adicione um produto disponível no estoque."
                    />
                  )}
                </div>
                <aside className="sale-summary">
                  <label>
                    Cliente (opcional)
                    <select name="cliente">
                      <option value="">Consumidor não identificado</option>
                      {customers.data.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.nome} · {customer.whatsapp}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Forma de pagamento
                    <select name="forma" required>
                      <option value="pix">Pix</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="credito">Crédito</option>
                      <option value="debito">Débito</option>
                      <option value="outro">Outro</option>
                    </select>
                  </label>
                  <label>
                    Desconto
                    <input
                      type="number"
                      min={0}
                      max={subtotal}
                      step="0.01"
                      value={discount}
                      onChange={(event) =>
                        setDiscount(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Observações
                    <textarea name="observacoes" maxLength={1000} />
                  </label>
                  <div className="total-line">
                    <span>Total</span>
                    {money(Math.max(0, subtotal - discount))}
                  </div>
                  <button className="primary" disabled={busy || !cart.length}>
                    {busy ? "Finalizando…" : "Finalizar venda"}
                  </button>
                </aside>
              </div>
            </form>
          )}
        </section>
      )}
      <section className="panel">
        <h2>Últimas vendas</h2>
        {sales.loading ? (
          <p>Carregando…</p>
        ) : !sales.data.length ? (
          <Empty title="Nenhuma venda registrada" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Venda</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Pagamento</th>
                  <th>Custo</th>
                  <th>Lucro estimado</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.data
                  .slice()
                  .sort((a, b) => b.vendido_em.localeCompare(a.vendido_em))
                  .slice(0, 50)
                  .map((sale) => (
                    <tr key={sale.id}>
                      <td>#{sale.numero}</td>
                      <td>
                        {customers.data.find(
                          (item) => item.id === sale.cliente_id,
                        )?.nome || "Consumidor"}
                      </td>
                      <td>{stamp(sale.vendido_em)}</td>
                      <td>{sale.status}</td>
                      <td>{money(sale.custo_total)}</td>
                      <td>
                        {money(Number(sale.total) - Number(sale.custo_total))}
                      </td>
                      <td>
                        <strong>{money(sale.total)}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
