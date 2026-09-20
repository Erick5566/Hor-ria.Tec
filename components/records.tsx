"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useRows,
  Cliente,
  Equipamento,
  Ordem,
  Lancamento,
  money,
  saveRow,
  phone,
  stamp,
  Venda,
} from "@/lib/assistencia";
import { useWorkspace } from "./workspace";
import { Heading, Empty, ErrorBox, Badge } from "./ui";
import { message } from "@/lib/supabase";
import DeviceFields from "./device-fields";

export default function Records({
  kind,
}: {
  kind: "clientes" | "equipamentos";
}) {
  const { empresa } = useWorkspace();
  const customers = useRows<Cliente>("clientes"),
    devices = useRows<Equipamento>("equipamentos"),
    orders = useRows<Ordem>("ordens_servico"),
    fin = useRows<Lancamento>("financeiro");
  const sales = useRows<Venda>("vendas");

  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Cliente | Equipamento | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deviceDraft, setDeviceDraft] = useState<Record<string, string>>({
      categoria: "Celular",
      tipo_personalizado: "",
      marca: "",
      modelo: "",
      cor: "",
    });

  const isClient = kind === "clientes";
  const source = isClient ? customers.data : devices.data;
  const list = source.filter((record) =>
    JSON.stringify(record).toLowerCase().includes(search.toLowerCase()),
  );

  const openOrders = orders.data.filter(
    (order) => !["finalizado", "cancelado"].includes(order.status),
  );
  const relationshipRevenue = fin.data
    .filter((item) => item.tipo === "receita" && item.status === "pago")
    .reduce((sum, item) => sum + Number(item.valor), 0);
  const salesRevenue = sales.data
    .filter((sale) => sale.status === "finalizada")
    .reduce((sum, sale) => sum + Number(sale.total), 0);

  const categoriesCount = useMemo(
    () => new Set(devices.data.map((item) => item.categoria).filter(Boolean)).size,
    [devices.data],
  );

  const metrics = isClient
    ? [
        {
          name: "Clientes cadastrados",
          value: customers.data.length,
          icon: "♙",
          tone: "blue",
          note: "Base total de clientes",
        },
        {
          name: "Clientes com equipamentos",
          value: new Set(devices.data.map((item) => item.cliente_id)).size,
          icon: "▣",
          tone: "purple",
          note: "Com aparelhos cadastrados",
        },
        {
          name: "Com atendimento aberto",
          value: new Set(openOrders.map((item) => item.cliente_id)).size,
          icon: "▤",
          tone: "amber",
          note: "Em atendimento agora",
        },
        {
          name: "Relacionamento gerado",
          value: money(relationshipRevenue + salesRevenue),
          icon: "▥",
          tone: "green",
          note: "Receitas e vendas registradas",
        },
      ]
    : [
        {
          name: "Equipamentos",
          value: devices.data.length,
          icon: "▣",
          tone: "blue",
          note: "Total cadastrado",
        },
        {
          name: "Em atendimento",
          value: new Set(openOrders.map((item) => item.equipamento_id)).size,
          icon: "⌘",
          tone: "amber",
          note: "Com OS aberta",
        },
        {
          name: "Reparos finalizados",
          value: orders.data.filter((item) => item.status === "finalizado").length,
          icon: "✓",
          tone: "green",
          note: "Ordens concluídas",
        },
        {
          name: "Categorias",
          value: categoriesCount,
          icon: "▦",
          tone: "purple",
          note: "Tipos de equipamento",
        },
      ];

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
      await (isClient ? customers : devices).reload();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }

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
            <strong>{isClient ? "Conheça melhor cada cliente" : "Controle cada equipamento"}</strong>
            <small>{isClient ? "Histórico, atendimentos e relacionamento." : "Do cadastro ao reparo finalizado."}</small>
          </div>
          <span>→</span>
        </div>
      </div>

      <ErrorBox
        error={
          error ||
          customers.error ||
          devices.error ||
          orders.error ||
          fin.error ||
          sales.error
        }
      />

      <div className="dashboard-kpis records-kpis">
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

      <section className="dashboard-card records-main-card">
        <div className="dashboard-card-head records-card-head">
          <div>
            <h2>{isClient ? "Base de clientes" : "Equipamentos cadastrados"}</h2>
            <p>{list.length} {list.length === 1 ? "registro encontrado" : "registros encontrados"}.</p>
          </div>
          <div className="records-actions">
            <input
              aria-label="Buscar registros"
              placeholder={isClient ? "Buscar cliente ou WhatsApp..." : "Buscar modelo, série, IMEI..."}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              id="novo-registro"
              className="primary"
              onClick={() => {
                setEditing(null);
                if (!isClient)
                  setDeviceDraft({
                    categoria: "Celular",
                    tipo_personalizado: "",
                    marca: "",
                    modelo: "",
                    cor: "",
                  });
                setOpen(true);
              }}
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
                <h2>{editing ? "Editar" : "Cadastrar"} {isClient ? "cliente" : "equipamento"}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>Fechar ×</button>
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
                          (editing as Cliente | null)?.[name as keyof Cliente] || "",
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
                      defaultValue={(editing as Cliente | null)?.observacoes || ""}
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
                      defaultValue={(editing as Equipamento | null)?.cliente_id || ""}
                    >
                      <option value="">Selecione o cliente</option>
                      {customers.data.map((customer) => (
                        <option value={customer.id} key={customer.id}>{customer.nome}</option>
                      ))}
                    </select>
                  </label>
                  <DeviceFields value={deviceDraft} onChange={setDeviceDraft} />
                  {["categoria", "tipo_personalizado", "marca", "modelo", "cor"].map((name) => (
                    <input key={name} type="hidden" name={name} value={deviceDraft[name] || ""} />
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
                          (editing as Equipamento | null)?.[name as keyof Equipamento] || "",
                        )}
                        maxLength={120}
                      />
                    </label>
                  ))}
                </>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="outline" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="primary" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        )}

        {list.length ? (
          <div className="table-wrap dashboard-table records-table">
            <table>
              <thead>
                <tr>
                  {(isClient
                    ? ["Nome", "WhatsApp", "Equipamentos", "Serviços", "Último atendimento", "Total gasto", "Ações"]
                    : ["Equipamento", "Categoria", "Cliente", "Série / IMEI", "Ordens", "Status atual", "Ações"]
                  ).map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {list.map((record) => {
                  const client = record as Cliente;
                  const device = record as Equipamento;
                  const relatedOrders = orders.data.filter((order) =>
                    isClient ? order.cliente_id === record.id : order.equipamento_id === record.id,
                  );
                  const total = fin.data
                    .filter(
                      (item) =>
                        item.tipo === "receita" &&
                        item.status === "pago" &&
                        relatedOrders.some((order) => order.id === item.ordem_id),
                    )
                    .reduce((sum, item) => sum + Number(item.valor), 0);
                  const purchases = isClient
                    ? sales.data.filter(
                        (sale) => sale.cliente_id === client.id && sale.status === "finalizada",
                      )
                    : [];
                  const relationshipTotal =
                    total + purchases.reduce((sum, sale) => sum + Number(sale.total), 0);
                  const latestOrder = [...relatedOrders].sort((a, b) =>
                    b.criado_em.localeCompare(a.criado_em),
                  )[0];

                  return (
                    <tr key={record.id}>
                      <td>
                        <Link className="records-name" href={`/painel/${kind}/${record.id}`}>
                          <span className="records-avatar">
                            {(isClient ? client.nome : device.modelo || device.marca).slice(0, 2).toUpperCase()}
                          </span>
                          <strong>{isClient ? client.nome : `${device.marca} ${device.modelo}`}</strong>
                        </Link>
                      </td>
                      {isClient ? (
                        <>
                          <td>{client.whatsapp}</td>
                          <td>{devices.data.filter((item) => item.cliente_id === client.id).length}</td>
                          <td>{relatedOrders.filter((order) => order.status === "finalizado").length}</td>
                          <td>{latestOrder ? stamp(latestOrder.criado_em) : "—"}</td>
                          <td><strong>{money(relationshipTotal)}</strong></td>
                        </>
                      ) : (
                        <>
                          <td>{device.categoria === "Outro" ? device.tipo_personalizado || "Outro" : device.categoria}</td>
                          <td>{customers.data.find((item) => item.id === device.cliente_id)?.nome || "—"}</td>
                          <td>{device.numero_serie || "—"}<small>{device.imei}</small></td>
                          <td>{relatedOrders.length}</td>
                          <td>{latestOrder ? <Badge status={latestOrder.status} /> : <span className="subtle">Sem OS</span>}</td>
                        </>
                      )}
                      <td>
                        <button
                          className="records-edit"
                          onClick={() => {
                            setEditing(record);
                            if (!isClient) {
                              const currentDevice = record as Equipamento;
                              setDeviceDraft({
                                categoria: currentDevice.categoria,
                                tipo_personalizado: currentDevice.tipo_personalizado || "",
                                marca: currentDevice.marca,
                                modelo: currentDevice.modelo,
                                cor: currentDevice.cor || "",
                              });
                            }
                            setOpen(true);
                          }}
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
        ) : (
          <Empty title={isClient ? "Nenhum cliente cadastrado." : "Nenhum equipamento cadastrado."} />
        )}
      </section>
    </section>
  );
}
