"use client";
import { useMemo, useState } from "react";
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
  const filtered = items.data.filter((item) =>
    (item.nome + " " + (item.compatibilidade || item.categoria))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const averagePrice = items.data.length
    ? items.data.reduce((sum, item) => sum + Number(item.preco || 0), 0) / items.data.length
    : 0;
  const activeCount = stock
    ? items.data.filter((item) => Number(item.quantidade) > 0).length
    : items.data.filter((item) => item.ativo).length;
  const categoriesCount = useMemo(
    () =>
      new Set(
        items.data
          .map((item) => (stock ? item.compatibilidade : item.categoria))
          .filter(Boolean),
      ).size,
    [items.data, stock],
  );
  const averageDuration =
    !stock && items.data.length
      ? Math.round(
          items.data.reduce((sum, item) => sum + Number(item.duracao || 0), 0) /
            items.data.length,
        )
      : 0;

  const metrics = [
    {
      name: stock ? "Itens cadastrados" : "Serviços cadastrados",
      value: items.data.length,
      icon: stock ? "▦" : "⌘",
      tone: "blue",
      note: "Catálogo total",
    },
    {
      name: stock ? "Com estoque" : "Serviços ativos",
      value: activeCount,
      icon: "✓",
      tone: "green",
      note: stock ? "Disponíveis agora" : "Disponíveis para atendimento",
    },
    {
      name: "Preço médio",
      value: money(averagePrice),
      icon: "▥",
      tone: "purple",
      note: "Valor médio do catálogo",
    },
    {
      name: stock ? "Compatibilidades" : "Duração média",
      value: stock ? categoriesCount : `${averageDuration} min`,
      icon: stock ? "▣" : "◷",
      tone: "amber",
      note: stock ? "Grupos cadastrados" : "Tempo estimado",
    },
  ];

  return (
    <div className="catalog-dashboard">
      <ErrorBox error={error || items.error} />

      <div className="dashboard-kpis catalog-kpis">
        {metrics.map((metric) => (
          <article key={metric.name} className={"dashboard-kpi " + metric.tone}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-icon">{metric.icon}</span>
              <span>{metric.name}</span>
            </div>
            <div className="dashboard-kpi-value">
              <strong>{metric.value}</strong>
              <span className="mini-spark">⌁</span>
            </div>
            <small>{metric.note}</small>
          </article>
        ))}
      </div>

      <section className="dashboard-card catalog-main-card">
        <div className="dashboard-card-head catalog-card-head">
          <div>
            <h2>{stock ? "Estoque e peças" : "Catálogo de serviços"}</h2>
            <p>
              {stock
                ? "Organize peças, disponibilidade e preços."
                : "Defina os serviços que sua assistência oferece aos clientes."}
            </p>
          </div>
          <div className="catalog-actions">
            <input
              aria-label="Buscar"
              placeholder={stock ? "Buscar peça ou compatibilidade..." : "Buscar serviço ou categoria..."}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="primary" onClick={() => setEditing("new")}>
              + {stock ? "Nova peça" : "Novo serviço"}
            </button>
          </div>
        </div>

        {editing && (
          <form
            className="catalog-editor"
            key={typeof editing === "string" ? editing : editing.id}
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget);
              try {
                const value: Record<string, unknown> = {
                  empresa_id: empresa.id,
                  nome: form.get("nome"),
                  preco: Number(form.get("preco")),
                };
                if (stock)
                  Object.assign(value, {
                    compatibilidade: form.get("compatibilidade"),
                    quantidade: Number(form.get("quantidade")),
                    custo: Number(form.get("custo")),
                    fornecedor: form.get("fornecedor"),
                    estoque_minimo: Number(form.get("estoque_minimo")),
                  });
                else
                  Object.assign(value, {
                    categoria: form.get("categoria"),
                    duracao: Number(form.get("duracao")),
                    descricao: form.get("descricao") || null,
                    garantia_dias: Number(form.get("garantia")),
                    ativo: form.get("ativo") === "on",
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
            <div className="catalog-editor-head">
              <div>
                <span className="eyebrow">CATÁLOGO</span>
                <h2>{current ? "Editar" : "Cadastrar"} {stock ? "peça" : "serviço"}</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)}>Fechar ×</button>
            </div>

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
                    <input name="compatibilidade" defaultValue={current?.compatibilidade} />
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
                    <select name="categoria" defaultValue={current?.categoria || "Celular"}>
                      {categories.map((category) => (
                        <option key={category}>{category}</option>
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
                    <select name="garantia" defaultValue={current?.garantia_dias ?? 0}>
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
                  <textarea name="descricao" maxLength={1000} defaultValue={current?.descricao || ""} />
                </label>
                <label className="check-label">
                  <input name="ativo" type="checkbox" defaultChecked={current?.ativo ?? true} />
                  Serviço ativo
                </label>
              </>
            )}

            <div className="form-actions">
              <button type="button" className="outline" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}

        {items.loading ? (
          <Empty title="Carregando catálogo..." />
        ) : !items.data.length ? (
          <Empty title={stock ? "Nenhuma peça cadastrada" : "Nenhum serviço cadastrado"} />
        ) : (
          <div className="table-wrap dashboard-table catalog-table">
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
                  {!stock && <th>Status</th>}
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="catalog-name">{item.nome}</strong>
                      {stock && item.quantidade <= item.estoque_minimo && (
                        <small className="stock-warning">Estoque baixo</small>
                      )}
                      {!stock && item.descricao && (
                        <small className="catalog-description">{item.descricao}</small>
                      )}
                    </td>
                    <td>{stock ? item.compatibilidade : item.categoria}</td>
                    <td>
                      {stock
                        ? item.quantidade
                        : `${item.duracao} min${item.garantia_dias ? ` · ${item.garantia_dias} dias garantia` : ""}`}
                    </td>
                    {stock && (
                      <>
                        <td>{money(item.custo)}</td>
                        <td>{item.fornecedor}</td>
                        <td>{item.estoque_minimo}</td>
                      </>
                    )}
                    <td><strong>{money(item.preco)}</strong></td>
                    {!stock && (
                      <td>
                        <span className={`catalog-status ${item.ativo ? "active" : "inactive"}`}>
                          {item.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                    )}
                    <td>
                      <button className="catalog-edit" onClick={() => setEditing(item)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!stock && (
        <section className="dashboard-card catalog-insights">
          <div className="dashboard-card-head">
            <div>
              <h2>Oportunidades para o catálogo</h2>
              <p>Alguns serviços comuns que podem ajudar a completar sua oferta.</p>
            </div>
          </div>
          <div className="catalog-ideas">
            <article><span>▣</span><div><strong>Celular</strong><small>Troca de tela, bateria, conector e desoxidação.</small></div></article>
            <article><span>▤</span><div><strong>Notebook</strong><small>SSD, RAM, teclado, limpeza e reparo de placa.</small></div></article>
            <article><span>⌘</span><div><strong>Console</strong><small>HDMI, limpeza, superaquecimento e controle.</small></div></article>
            <article><span>▦</span><div><strong>Computador</strong><small>Montagem, upgrade, diagnóstico, fonte e GPU.</small></div></article>
          </div>
        </section>
      )}
    </div>
  );
}
