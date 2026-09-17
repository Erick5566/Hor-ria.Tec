"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useRows, saveRow, Peca, categories, money } from "@/lib/assistencia";
import { Servico, message } from "@/lib/supabase";
import { ErrorBox, Empty } from "./ui";
type Service = Servico & {
  categoria: string;
  preco: number;
  descricao: string | null;
  garantia_dias: number;
  ativo: boolean;
};
export default function CatalogManagement({
  stock = false,
}: {
  stock?: boolean;
}) {
  const { empresa } = useWorkspace(),
    items = useRows<Peca & Service>(stock ? "pecas" : "servicos");
  const [editing, setEditing] = useState<(Peca & Service) | "new" | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const current = editing && editing !== "new" ? editing : null;
  return (
    <>
      <ErrorBox error={error || items.error} />
      <div className="toolbar">
        <input
          aria-label="Buscar"
          placeholder={
            stock ? "Buscar peça ou compatibilidade" : "Buscar serviço"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          + {stock ? "Nova peça" : "Novo serviço"}
        </button>
      </div>
      {editing && (
        <form
          className="panel"
          key={typeof editing === "string" ? editing : editing.id}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const value: Record<string, unknown> = {
                empresa_id: empresa.id,
                nome: f.get("nome"),
                preco: Number(f.get("preco")),
              };
              if (stock)
                Object.assign(value, {
                  compatibilidade: f.get("compatibilidade"),
                  quantidade: Number(f.get("quantidade")),
                  custo: Number(f.get("custo")),
                  fornecedor: f.get("fornecedor"),
                  estoque_minimo: Number(f.get("estoque_minimo")),
                });
              else
                Object.assign(value, {
                  categoria: f.get("categoria"),
                  duracao: Number(f.get("duracao")),
                  descricao: f.get("descricao") || null,
                  garantia_dias: Number(f.get("garantia")),
                  ativo: f.get("ativo") === "on",
                });
              await saveRow(stock ? "pecas" : "servicos", value, current?.id);
              setEditing(null);
              await items.reload();
            } catch (e) {
              setError(message(e as Error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            {current ? "Editar" : "Cadastrar"} {stock ? "peça" : "serviço"}
          </h2>
          <div className="form-grid">
            <label>
              Nome
              <input
                name="nome"
                required
                minLength={2}
                maxLength={100}
                defaultValue={current?.nome}
              />
            </label>
            <label>
              Preço de venda
              <input
                name="preco"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={current?.preco || 0}
              />
            </label>
            {stock ? (
              <>
                <label>
                  Compatibilidade
                  <input
                    name="compatibilidade"
                    defaultValue={current?.compatibilidade}
                  />
                </label>
                <label>
                  Quantidade
                  <input
                    name="quantidade"
                    type="number"
                    min={0}
                    required
                    defaultValue={current?.quantidade || 0}
                  />
                </label>
                <label>
                  Custo
                  <input
                    name="custo"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={current?.custo || 0}
                  />
                </label>
                <label>
                  Fornecedor
                  <input name="fornecedor" defaultValue={current?.fornecedor} />
                </label>
                <label>
                  Estoque mínimo
                  <input
                    name="estoque_minimo"
                    type="number"
                    min={0}
                    required
                    defaultValue={current?.estoque_minimo ?? 1}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Categoria
                  <select
                    name="categoria"
                    defaultValue={current?.categoria || "Celular"}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Duração média (minutos)
                  <input
                    name="duracao"
                    type="number"
                    min={5}
                    max={480}
                    defaultValue={current?.duracao || 30}
                    required
                  />
                </label>
                <label>
                  Garantia padrão
                  <select
                    name="garantia"
                    defaultValue={current?.garantia_dias ?? 0}
                  >
                    <option value={0}>Sem garantia</option>
                    <option value={30}>30 dias</option>
                    <option value={60}>60 dias</option>
                    <option value={90}>90 dias</option>
                    <option value={180}>6 meses</option>
                    <option value={365}>12 meses</option>
                  </select>
                </label>
              </>
            )}
          </div>
          {!stock && (
            <>
              <label>
                Descrição
                <textarea
                  name="descricao"
                  maxLength={1000}
                  defaultValue={current?.descricao || ""}
                />
              </label>
              <label className="check-label">
                <input
                  name="ativo"
                  type="checkbox"
                  defaultChecked={current?.ativo ?? true}
                />{" "}
                Serviço ativo
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="button" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              Salvar
            </button>
          </div>
        </form>
      )}
      <section className="panel">
        {items.loading ? (
          <p>Carregando…</p>
        ) : !items.data.length ? (
          <Empty
            title={
              stock ? "Nenhuma peça cadastrada" : "Nenhum serviço cadastrado"
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{stock ? "Peça" : "Serviço"}</th>
                  <th>{stock ? "Compatibilidade" : "Categoria"}</th>
                  <th>{stock ? "Quantidade" : "Duração"}</th>
                  {stock && (
                    <>
                      <th>Custo</th>
                      <th>Fornecedor</th>
                      <th>Mínimo</th>
                    </>
                  )}
                  <th>Preço</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.data
                  .filter((i) =>
                    (i.nome + " " + (i.compatibilidade || i.categoria))
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.nome}
                        {stock && i.quantidade <= i.estoque_minimo && (
                          <small className="stock-warning">Estoque baixo</small>
                        )}
                      </td>
                      <td>{stock ? i.compatibilidade : i.categoria}</td>
                      <td>
                        {stock
                          ? i.quantidade
                          : `${i.duracao} min${i.garantia_dias ? ` · ${i.garantia_dias} dias` : ""}`}
                      </td>
                      {stock && (
                        <>
                          <td>{money(i.custo)}</td>
                          <td>{i.fornecedor}</td>
                          <td>{i.estoque_minimo}</td>
                        </>
                      )}
                      <td>{money(i.preco)}</td>
                      <td>
                        <button onClick={() => setEditing(i)}>Editar</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {!stock && (
        <aside className="panel">
          <h2>Ideias para seu catálogo</h2>
          <p>Celular: troca de tela, bateria, conector e desoxidação.</p>
          <p>Notebook: SSD, RAM, teclado, limpeza e reparo de placa.</p>
          <p>Console: HDMI, limpeza, superaquecimento e controle.</p>
          <p>Computador: montagem, upgrade, diagnóstico, fonte e GPU.</p>
          <small>
            Cadastre apenas os serviços realizados pela sua assistência.
          </small>
        </aside>
      )}
    </>
  );
}
