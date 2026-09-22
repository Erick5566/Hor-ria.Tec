"use client";
import { useCallback, useEffect, useState } from "react";
import { money, type Peca, saveRow, stamp } from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import { Empty, ErrorBox, MetricCard, MetricGrid, Pagination } from "./ui";
import { useWorkspace } from "./workspace";

type Movement = {
  id: string;
  peca_id: string;
  ordem_id: string | null;
  quantidade: number;
  motivo: string;
  criado_em: string;
  peca_nome: string;
};

type InventoryData = {
  page: number;
  pageSize: number;
  total: number;
  items: Peca[];
  metrics: {
    units: number;
    value: number;
    low: number;
    empty: number;
  };
  movements: Movement[];
};

const productCategories = [
  "Telas",
  "Baterias",
  "Conectores",
  "Câmeras",
  "Placas e componentes",
  "Capinhas",
  "Películas",
  "Carregadores",
  "Cabos",
  "Fones de ouvido",
  "Controles",
  "Memória e armazenamento",
  "Ferramentas",
  "Outros",
];

export default function InventoryManagement() {
  const { empresa } = useWorkspace();
  const [data, setData] = useState<InventoryData | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Peca | "new" | null>(null);
  const [moving, setMoving] = useState<Peca | null>(null);
  const [movementType, setMovementType] = useState<"entrada" | "saida">("entrada");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [type, setType] = useState("Todos");
  const [availability, setAvailability] = useState("Todos");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const current = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (silent = false) => {
      if (!supabase) return;
      if (!silent) setLoading(true);
      try {
        const result = await supabase.rpc("inventory_page", {
          p_page: page,
          p_page_size: 24,
          p_search: debouncedQuery || null,
          p_type: type,
          p_availability: availability,
        });
        if (result.error) throw result.error;
        setData(result.data as InventoryData);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, debouncedQuery, type, availability],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!supabase || !empresa.id) return;
    let timer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(true), 250);
    };

    const channel = supabase
      .channel(`inventory-${empresa.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pecas",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "movimentos_estoque",
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

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      const record: Record<string, unknown> = {
        empresa_id: empresa.id,
        nome: values.get("nome"),
        tipo: values.get("tipo"),
        categoria: values.get("categoria"),
        sku: values.get("sku") || null,
        codigo_barras: values.get("codigo_barras") || null,
        unidade: values.get("unidade"),
        compatibilidade: values.get("compatibilidade"),
        descricao: values.get("descricao") || null,
        foto_url: values.get("foto_url") || null,
        custo: Number(values.get("custo")),
        preco: Number(values.get("preco")),
        fornecedor: values.get("fornecedor"),
        estoque_minimo: Number(values.get("estoque_minimo")),
        ativo: values.get("ativo") === "on",
      };
      if (!current) record.quantidade = Number(values.get("quantidade"));
      await saveRow("pecas", record, current?.id);
      setEditing(null);
      if (!current) setPage(1);
      await load(true);
    } catch (reason) {
      setError(message(reason as Error));
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items || [];
  const movements = data?.movements || [];
  const metrics = data?.metrics || { units: 0, value: 0, low: 0, empty: 0 };

  return (
    <>
      <ErrorBox error={error} />

      <MetricGrid columns={4} className="inventory-summary">
        <MetricCard
          label="Unidades disponíveis"
          value={loading && !data ? "—" : metrics.units}
          note="Total disponível no estoque"
          icon="▣"
        />
        <MetricCard
          label="Valor investido"
          value={loading && !data ? "—" : money(metrics.value)}
          note="Custo total do estoque"
          icon="$"
          tone="purple"
        />
        <MetricCard
          label="Estoque baixo"
          value={loading && !data ? "—" : metrics.low}
          note="Itens abaixo do mínimo"
          icon="!"
          tone="amber"
          active={metrics.low > 0}
          emphasizeValue
        />
        <MetricCard
          label="Sem estoque"
          value={loading && !data ? "—" : metrics.empty}
          note="Itens indisponíveis"
          icon="×"
          tone="red"
          active={metrics.empty > 0}
          emphasizeValue
        />
      </MetricGrid>

      <div className="toolbar inventory-toolbar">
        <input
          aria-label="Buscar no estoque"
          placeholder="Buscar nome, SKU ou código de barras..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="inventory-filter">
          <span>Tipo</span>
          <select
            aria-label="Filtrar por tipo"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option>Todos</option>
            <option>Peça</option>
            <option>Acessório</option>
            <option>Produto</option>
          </select>
        </label>
        <label className="inventory-filter">
          <span>Status do estoque</span>
          <select
            aria-label="Filtrar por status do estoque"
            value={availability}
            onChange={(event) => {
              setAvailability(event.target.value);
              setPage(1);
            }}
          >
            <option>Todos</option>
            <option>Disponível</option>
            <option>Baixo</option>
            <option>Sem estoque</option>
          </select>
        </label>
        <button className="primary" onClick={() => setEditing("new")}>
          + Novo item
        </button>
      </div>

      {editing && (
        <form className="panel" onSubmit={save}>
          <div className="panel-head">
            <div>
              <h2>{current ? "Editar item" : "Cadastrar no estoque"}</h2>
              <p>
                Use para peças de reparo, acessórios e produtos vendidos no
                balcão.
              </p>
            </div>
            <button type="button" onClick={() => setEditing(null)}>
              Fechar
            </button>
          </div>
          <div className="form-grid inventory-form">
            <label>
              Tipo
              <select name="tipo" defaultValue={current?.tipo || "Peça"}>
                <option>Peça</option>
                <option>Acessório</option>
                <option>Produto</option>
              </select>
            </label>
            <label>
              Nome
              <input
                name="nome"
                required
                minLength={2}
                maxLength={150}
                defaultValue={current?.nome}
                placeholder="Ex.: Carregador USB-C 20W"
              />
            </label>
            <label>
              Categoria
              <input
                name="categoria"
                list="stock-categories"
                required
                maxLength={100}
                defaultValue={current?.categoria || "Outros"}
              />
              <datalist id="stock-categories">
                {productCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </datalist>
            </label>
            <label>
              SKU / código interno
              <input
                name="sku"
                maxLength={80}
                defaultValue={current?.sku || ""}
                placeholder="Ex.: CAR-USB20-BR"
              />
            </label>
            <label>
              Código de barras
              <input
                name="codigo_barras"
                inputMode="numeric"
                maxLength={80}
                defaultValue={current?.codigo_barras || ""}
              />
            </label>
            <label>
              Compatibilidade
              <input
                name="compatibilidade"
                maxLength={300}
                defaultValue={current?.compatibilidade || ""}
                placeholder="Ex.: iPhone 12 ao 15, USB-C"
              />
            </label>
            <label>
              Unidade
              <select name="unidade" defaultValue={current?.unidade || "un"}>
                <option value="un">Unidade</option>
                <option value="kit">Kit</option>
                <option value="par">Par</option>
                <option value="m">Metro</option>
                <option value="caixa">Caixa</option>
              </select>
            </label>
            {!current && (
              <label>
                Quantidade inicial
                <input
                  name="quantidade"
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={0}
                  required
                />
              </label>
            )}
            <label>
              Estoque mínimo
              <input
                name="estoque_minimo"
                type="number"
                min={0}
                max={100000}
                defaultValue={current?.estoque_minimo ?? 2}
                required
              />
            </label>
            <label>
              Custo unitário
              <input
                name="custo"
                type="number"
                min={0}
                step="0.01"
                defaultValue={current?.custo || 0}
                required
              />
            </label>
            <label>
              Preço de venda
              <input
                name="preco"
                type="number"
                min={0}
                step="0.01"
                defaultValue={current?.preco || 0}
                required
              />
            </label>
            <label>
              Fornecedor
              <input
                name="fornecedor"
                maxLength={200}
                defaultValue={current?.fornecedor || ""}
              />
            </label>
            <label>
              Foto (URL do storage)
              <input
                name="foto_url"
                type="url"
                maxLength={1000}
                defaultValue={current?.foto_url || ""}
                placeholder="https://…"
              />
            </label>
          </div>
          <label>
            Descrição
            <textarea
              name="descricao"
              maxLength={1000}
              defaultValue={current?.descricao || ""}
              placeholder="Detalhes do produto, peça ou acessório"
            />
          </label>
          <label className="check-label">
            <input
              name="ativo"
              type="checkbox"
              defaultChecked={current?.ativo ?? true}
            />
            Item ativo no estoque
          </label>
          <div className="form-actions">
            <button type="button" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar item"}
            </button>
          </div>
        </form>
      )}

      {loading && !data ? (
        <section className="panel">Carregando estoque…</section>
      ) : !items.length ? (
        <Empty
          title="Nenhum item encontrado"
          text="Cadastre peças, capinhas, carregadores ou outros produtos."
        />
      ) : (
        <>
          <div className="inventory-grid">
            {items.map((item) => {
              const status =
                item.quantidade === 0
                  ? "Sem estoque"
                  : item.quantidade <= item.estoque_minimo
                    ? "Estoque baixo"
                    : "Disponível";
              return (
                <article
                  className={`inventory-card ${item.ativo ? "" : "inactive"}`}
                  key={item.id}
                >
                  <div className="inventory-card-head">
                    <span className="stock-kind">{item.tipo}</span>
                    <span
                      className={`stock-state ${
                        status === "Disponível"
                          ? "available"
                          : status === "Estoque baixo"
                            ? "low"
                            : "empty"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  {item.foto_url && (
                    <img
                      className="inventory-photo"
                      src={item.foto_url}
                      alt={`Foto de ${item.nome}`}
                      loading="lazy"
                    />
                  )}
                  <h2>{item.nome}</h2>
                  <p>
                    {item.categoria}
                    {item.compatibilidade ? ` · ${item.compatibilidade}` : ""}
                  </p>
                  {item.descricao && <small>{item.descricao}</small>}
                  <div className="stock-quantity">
                    <strong>{item.quantidade}</strong>
                    <span>
                      {item.unidade}(s)
                      <small>Mínimo: {item.estoque_minimo}</small>
                    </span>
                  </div>
                  {(item.sku || item.codigo_barras) && (
                    <small>
                      SKU: {item.sku || "—"} · Código:{" "}
                      {item.codigo_barras || "—"}
                    </small>
                  )}
                  <dl>
                    <div>
                      <dt>Custo</dt>
                      <dd>{money(item.custo)}</dd>
                    </div>
                    <div>
                      <dt>Venda</dt>
                      <dd>{money(item.preco)}</dd>
                    </div>
                    <div>
                      <dt>Margem</dt>
                      <dd>
                        {Number(item.preco)
                          ? `${Math.round(
                              ((Number(item.preco) - Number(item.custo)) /
                                Number(item.preco)) *
                                100,
                            )}%`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="inline-actions">
                    <button
                      className="primary"
                      onClick={() => {
                        setMoving(item);
                        setMovementType("entrada");
                      }}
                    >
                      Movimentar
                    </button>
                    <button onClick={() => setEditing(item)}>Editar</button>
                  </div>
                </article>
              );
            })}
          </div>
          <Pagination
            page={data?.page || page}
            pageSize={data?.pageSize || 24}
            total={data?.total || 0}
            onPageChange={setPage}
          />
        </>
      )}

      <section className="panel">
        <h2>Últimas movimentações</h2>
        {!movements.length ? (
          <Empty title="Nenhuma movimentação registrada" />
        ) : (
          movements.map((movement) => (
            <div className="list-line" key={movement.id}>
              <span>
                <strong
                  className={
                    movement.quantidade > 0 ? "movement-in" : "movement-out"
                  }
                >
                  {movement.quantidade > 0 ? "+" : ""}
                  {movement.quantidade}
                </strong>{" "}
                · {movement.peca_nome}
                <small>
                  {movement.motivo}
                  {movement.ordem_id ? " · Vinculado a uma OS" : ""}
                </small>
              </span>
              <small>{stamp(movement.criado_em)}</small>
            </div>
          ))
        )}
      </section>

      {moving && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="movement-title"
          >
            <button
              className="close"
              onClick={() => setMoving(null)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h2 id="movement-title">Movimentar {moving.nome}</h2>
            <p>
              Disponível agora:{" "}
              <strong>
                {moving.quantidade} {moving.unidade}(s)
              </strong>
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(event.currentTarget);
                const quantity =
                  Number(form.get("quantidade")) *
                  (movementType === "entrada" ? 1 : -1);
                const result = await supabase!.rpc("movimentar_estoque", {
                  p_peca: moving.id,
                  p_quantidade: quantity,
                  p_motivo: form.get("motivo"),
                });
                if (result.error) setError(message(result.error));
                else {
                  setMoving(null);
                  await load(true);
                }
                setBusy(false);
              }}
            >
              <div className="movement-toggle">
                <button
                  type="button"
                  className={movementType === "entrada" ? "selected" : ""}
                  onClick={() => setMovementType("entrada")}
                >
                  Entrada
                </button>
                <button
                  type="button"
                  className={movementType === "saida" ? "selected" : ""}
                  onClick={() => setMovementType("saida")}
                >
                  Saída / venda
                </button>
              </div>
              <label>
                Quantidade
                <input
                  name="quantidade"
                  type="number"
                  min={1}
                  max={100000}
                  required
                />
              </label>
              <label>
                Motivo
                <input
                  name="motivo"
                  minLength={2}
                  maxLength={200}
                  required
                  placeholder={
                    movementType === "entrada"
                      ? "Ex.: Compra do fornecedor"
                      : "Ex.: Venda no balcão"
                  }
                />
              </label>
              <ErrorBox error={error} />
              <button className="primary" disabled={busy}>
                {busy ? "Registrando…" : "Confirmar movimentação"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
