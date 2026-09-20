"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  type Cliente,
  type Equipamento,
  type Status,
  money,
  saveRow,
  phone,
  stamp,
} from "@/lib/assistencia";
import { useWorkspace } from "./workspace";
import { Heading, Empty, ErrorBox, Badge, Pagination } from "./ui";
import { message, supabase } from "@/lib/supabase";
import DeviceFields from "./device-fields";

type ClientItem = Cliente & {
  equipment_count: number;
  service_count: number;
  latest_order_at: string | null;
  relationship_total: number;
};

type DeviceItem = Equipamento & {
  cliente_nome: string | null;
  order_count: number;
  latest_status: Status | null;
};

type RecordsPageData = {
  page: number;
  pageSize: number;
  total: number;
  items: Array<ClientItem | DeviceItem>;
  metrics: {
    total: number;
    withEquipment?: number;
    withOpenOrder?: number;
    relationship?: number;
    inService?: number;
    finishedRepairs?: number;
    categories?: number;
  };
};

type CustomerOption = {
  id: string;
  nome: string;
};

export default function Records({
  kind,
}: {
  kind: "clientes" | "equipamentos";
}) {
  const { empresa } = useWorkspace();
  const isClient = kind === "clientes";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecordsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClientItem | DeviceItem | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [deviceDraft, setDeviceDraft] = useState<Record<string, string>>({
    categoria: "Celular",
    tipo_personalizado: "",
    marca: "",
    modelo: "",
    cor: "",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (silent = false) => {
      if (!supabase) return;
      if (!silent) setLoading(true);
      try {
        const result = await supabase.rpc("records_list_page", {
          p_kind: kind,
          p_page: page,
          p_page_size: 30,
          p_search: debouncedSearch || null,
        });
        if (result.error) throw result.error;
        setData(result.data as RecordsPageData);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [kind, page, debouncedSearch],
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

    const tables = isClient
      ? ["clientes", "equipamentos", "ordens_servico", "financeiro", "vendas"]
      : ["equipamentos", "clientes", "ordens_servico"];

    let channel = supabase.channel(`records-${kind}-${empresa.id}`);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      );
    }
    channel.subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, kind, isClient, load]);

  const loadCustomerOptions = useCallback(async () => {
    if (isClient || !supabase || customerOptions.length || customersLoading)
      return;

    setCustomersLoading(true);
    try {
      const all: CustomerOption[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await supabase
          .from("clientes")
          .select("id,nome")
          .eq("empresa_id", empresa.id)
          .order("nome")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        all.push(...((result.data || []) as CustomerOption[]));
        if ((result.data || []).length < 1000) break;
      }
      setCustomerOptions(all);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setCustomersLoading(false);
    }
  }, [
    isClient,
    empresa.id,
    customerOptions.length,
    customersLoading,
  ]);

  function openEditor(record: ClientItem | DeviceItem | null) {
    setEditing(record);
    if (!isClient) {
      const current = record as DeviceItem | null;
      setDeviceDraft({
        categoria: current?.categoria || "Celular",
        tipo_personalizado: current?.tipo_personalizado || "",
        marca: current?.marca || "",
        modelo: current?.modelo || "",
        cor: current?.cor || "",
      });
      void loadCustomerOptions();
    }
    setOpen(true);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const value: Record<string, unknown> = { empresa_id: empresa.id };
      for (const [key, v] of form.entries()) value[key] = String(v).trim() || null;
      if (isClient) value.whatsapp = phone(String(form.get("whatsapp")));
      else value.marca = String(form.get("marca") || "");
      await saveRow(kind, value, editing?.id);
      setOpen(false);
      setEditing(null);
      if (!editing) setPage(1);
      await load(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  const metrics = isClient
    ? [
        {
          name: "Clientes cadastrados",
          value: data?.metrics.total ?? 0,
          icon: "♙",
          tone: "blue",
          note: "Base total de clientes",
        },
        {
          name: "Clientes com equipamentos",
          value: data?.metrics.withEquipment ?? 0,
          icon: "▣",
          tone: "purple",
          note: "Com aparelhos cadastrados",
        },
        {
          name: "Com atendimento aberto",
          value: data?.metrics.withOpenOrder ?? 0,
          icon: "▤",
          tone: "amber",
          note: "Em atendimento agora",
        },
        {
          name: "Relacionamento gerado",
          value: money(data?.metrics.relationship ?? 0),
          icon: "▥",
          tone: "green",
          note: "Receitas e vendas registradas",
        },
      ]
    : [
        {
          name: "Equipamentos",
          value: data?.metrics.total ?? 0,
          icon: "▣",
          tone: "blue",
          note: "Total cadastrado",
        },
        {
          name: "Em atendimento",
          value: data?.metrics.inService ?? 0,
          icon: "⌘",
          tone: "amber",
          note: "Com OS aberta",
        },
        {
          name: "Reparos finalizados",
          value: data?.metrics.finishedRepairs ?? 0,
          icon: "✓",
          tone: "green",
          note: "Ordens concluídas",
        },
        {
          name: "Categorias",
          value: data?.metrics.categories ?? 0,
          icon: "▦",
          tone: "purple",
          note: "Tipos de equipamento",
        },
      ];

  const list = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <section className={`module dashboard-pro records-dashboard records-${kind}`}>
      <div className="dashboard-hero">
        <Heading
          title={isClient ? "Clientes" : "Equipamentos"}
          subtitle={
            isClient
              ? "Relacionamentos, histórico e valor gerado em um só lugar."
              : "Acompanhe aparelhos, reparos e histórico técnico com clareza."
          }
          action={`+ ${isClient ? "Novo cliente" : "Novo equipamento"}`}
          href="#novo-registro"
        />
        <div className="dashboard-callout">
          <span className="dashboard-callout-icon">{isClient ? "♙" : "▣"}</span>
          <div>
            <strong>
              {isClient ? "Conheça melhor cada cliente" : "Controle cada equipamento"}
            </strong>
            <small>
              {isClient
                ? "Histórico, atendimentos e relacionamento."
                : "Do cadastro ao reparo finalizado."}
            </small>
          </div>
          <span>→</span>
        </div>
      </div>

      <ErrorBox error={error} />

      <div className="dashboard-kpis records-kpis">
        {metrics.map((metric) => (
          <article key={metric.name} className={"dashboard-kpi " + metric.tone}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-icon">{metric.icon}</span>
              <span>{metric.name}</span>
            </div>
            <div className="dashboard-kpi-value">
              <strong>{loading && !data ? "—" : metric.value}</strong>
              <span className="mini-spark">⌁</span>
            </div>
            <small>{metric.note}</small>
          </article>
        ))}
      </div>

      <section className="dashboard-card records-main-card">
        <div className="dashboard-card-head records-card-head">
          <div>
            <h2>{isClient ? "Base de clientes" : "Equipamentos cadastrados"}</h2>
            <p>
              {total} {total === 1 ? "registro encontrado" : "registros encontrados"}.
            </p>
          </div>
          <div className="records-actions">
            <input
              aria-label="Buscar registros"
              placeholder={
                isClient
                  ? "Buscar cliente ou WhatsApp..."
                  : "Buscar modelo, série, IMEI..."
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              id="novo-registro"
              className="primary"
              onClick={() => openEditor(null)}
            >
              + {isClient ? "Novo cliente" : "Novo equipamento"}
            </button>
          </div>
        </div>

        {open && (
          <form onSubmit={save} className="records-editor" key={editing?.id || "new"}>
            <div className="records-editor-head">
              <div>
                <span className="eyebrow">CADASTRO</span>
                <h2>
                  {editing ? "Editar" : "Cadastrar"}{" "}
                  {isClient ? "cliente" : "equipamento"}
                </h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                Fechar ×
              </button>
            </div>
            <div className="form-grid">
              {isClient ? (
                <>
                  {[
                    ["nome", "Nome", "text"],
                    ["whatsapp", "WhatsApp", "tel"],
                    ["email", "E-mail", "email"],
                    ["documento", "CPF/CNPJ (opcional)", "text"],
                    ["telefone", "Telefone alternativo", "tel"],
                    ["endereco", "Endereço", "text"],
                  ].map(([name, label, type]) => (
                    <label key={name}>
                      {label}
                      <input
                        name={name}
                        type={type}
                        required={["nome", "whatsapp"].includes(name)}
                        defaultValue={String(
                          (editing as ClientItem | null)?.[
                            name as keyof ClientItem
                          ] || "",
                        )}
                        maxLength={120}
                      />
                    </label>
                  ))}
                  <label className="wide-field">
                    Observações
                    <textarea
                      name="observacoes"
                      maxLength={1000}
                      defaultValue={
                        (editing as ClientItem | null)?.observacoes || ""
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Cliente
                    <select
                      name="cliente_id"
                      required
                      defaultValue={
                        (editing as DeviceItem | null)?.cliente_id || ""
                      }
                      disabled={customersLoading}
                    >
                      <option value="">
                        {customersLoading
                          ? "Carregando clientes..."
                          : "Selecione o cliente"}
                      </option>
                      {customerOptions.map((customer) => (
                        <option value={customer.id} key={customer.id}>
                          {customer.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <DeviceFields value={deviceDraft} onChange={setDeviceDraft} />
                  {[
                    "categoria",
                    "tipo_personalizado",
                    "marca",
                    "modelo",
                    "cor",
                  ].map((name) => (
                    <input
                      key={name}
                      type="hidden"
                      name={name}
                      value={deviceDraft[name] || ""}
                    />
                  ))}
                  {[
                    ["numero_serie", "Número de série"],
                    ["imei", "IMEI"],
                    ["acessorios", "Acessórios entregues"],
                  ].map(([name, label]) => (
                    <label key={name}>
                      {label}
                      <input
                        name={name}
                        defaultValue={String(
                          (editing as DeviceItem | null)?.[
                            name as keyof DeviceItem
                          ] || "",
                        )}
                        maxLength={120}
                      />
                    </label>
                  ))}
                </>
              )}
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}

        {loading && !data ? (
          <Empty title="Carregando registros…" />
        ) : list.length ? (
          <>
            <div className="table-wrap dashboard-table records-table">
              <table>
                <thead>
                  <tr>
                    {(isClient
                      ? [
                          "Nome",
                          "WhatsApp",
                          "Equipamentos",
                          "Serviços",
                          "Último atendimento",
                          "Total gasto",
                          "Ações",
                        ]
                      : [
                          "Equipamento",
                          "Categoria",
                          "Cliente",
                          "Série / IMEI",
                          "Ordens",
                          "Status atual",
                          "Ações",
                        ]
                    ).map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((record) => {
                    const client = record as ClientItem;
                    const device = record as DeviceItem;

                    return (
                      <tr key={record.id}>
                        <td>
                          <Link
                            className="records-name"
                            href={`/painel/${kind}/${record.id}`}
                          >
                            <span className="records-avatar">
                              {(isClient
                                ? client.nome
                                : device.modelo || device.marca
                              )
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <strong>
                              {isClient
                                ? client.nome
                                : `${device.marca} ${device.modelo}`}
                            </strong>
                          </Link>
                        </td>
                        {isClient ? (
                          <>
                            <td>{client.whatsapp}</td>
                            <td>{client.equipment_count}</td>
                            <td>{client.service_count}</td>
                            <td>
                              {client.latest_order_at
                                ? stamp(client.latest_order_at)
                                : "—"}
                            </td>
                            <td>
                              <strong>{money(client.relationship_total)}</strong>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              {device.categoria === "Outro"
                                ? device.tipo_personalizado || "Outro"
                                : device.categoria}
                            </td>
                            <td>{device.cliente_nome || "—"}</td>
                            <td>
                              {device.numero_serie || "—"}
                              <small>{device.imei}</small>
                            </td>
                            <td>{device.order_count}</td>
                            <td>
                              {device.latest_status ? (
                                <Badge status={device.latest_status} />
                              ) : (
                                <span className="subtle">Sem OS</span>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          <button
                            className="records-edit"
                            onClick={() => openEditor(record)}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data?.page || page}
              pageSize={data?.pageSize || 30}
              total={total}
              onPageChange={setPage}
            />
          </>
        ) : (
          <Empty
            title={
              isClient
                ? "Nenhum cliente cadastrado."
                : "Nenhum equipamento cadastrado."
            }
          />
        )}
      </section>
    </section>
  );
}
