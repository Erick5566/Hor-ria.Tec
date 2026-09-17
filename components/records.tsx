"use client";
import { useState } from "react";
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
import { Heading, Empty, ErrorBox } from "./ui";
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
  const list = (isClient ? customers.data : devices.data).filter((r) =>
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const value: Record<string, unknown> = { empresa_id: empresa.id };
      for (const [key, v] of f.entries()) value[key] = String(v).trim() || null;
      if (isClient) value.whatsapp = phone(String(f.get("whatsapp")));
      else value.marca = String(f.get("marca") || "");
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
    <section className="module">
      <Heading
        title={isClient ? "Clientes" : "Equipamentos"}
        subtitle={
          isClient
            ? "Relacionamentos e histórico de atendimento."
            : "Identificação, reparos e histórico de cada equipamento."
        }
      />
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
      <section className="panel">
        <div className="toolbar">
          <input
            aria-label="Buscar registros"
            placeholder={
              isClient
                ? "Buscar cliente ou WhatsApp…"
                : "Buscar modelo, série, IMEI…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
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
        {open && (
          <form onSubmit={save} className="panel" key={editing?.id || "new"}>
            <h2>
              {editing ? "Editar" : "Cadastrar"}{" "}
              {isClient ? "cliente" : "equipamento"}
            </h2>
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
                          (editing as Cliente | null)?.[
                            name as keyof Cliente
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
                        (editing as Cliente | null)?.observacoes || ""
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
                        (editing as Equipamento | null)?.cliente_id || ""
                      }
                    >
                      <option value="">Selecione o cliente</option>
                      {customers.data.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.nome}
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
                        required={name === "modelo"}
                        defaultValue={String(
                          (editing as Equipamento | null)?.[
                            name as keyof Equipamento
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
                Salvar
              </button>
            </div>
          </form>
        )}
        {list.length ? (
          <div className="table-wrap">
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
                        "Ações",
                      ]
                  ).map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const c = r as Cliente,
                    d = r as Equipamento;
                  const os = orders.data.filter((o) =>
                    isClient
                      ? o.cliente_id === r.id
                      : o.equipamento_id === r.id,
                  );
                  const total = fin.data
                    .filter(
                      (f) =>
                        f.tipo === "receita" &&
                        f.status === "pago" &&
                        os.some((o) => o.id === f.ordem_id),
                    )
                    .reduce((n, f) => n + Number(f.valor), 0);
                  const purchases = isClient
                    ? sales.data.filter(
                        (sale) =>
                          sale.cliente_id === c.id &&
                          sale.status === "finalizada",
                      )
                    : [];
                  const relationshipTotal =
                    total +
                    purchases.reduce(
                      (sum, sale) => sum + Number(sale.total),
                      0,
                    );
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/painel/${kind}/${r.id}`}>
                          {isClient ? c.nome : `${d.marca} ${d.modelo}`}
                        </Link>
                      </td>
                      {isClient ? (
                        <>
                          <td>{c.whatsapp}</td>
                          <td>
                            {
                              devices.data.filter((e) => e.cliente_id === c.id)
                                .length
                            }
                          </td>
                          <td>
                            {os.filter((o) => o.status === "finalizado").length}
                          </td>
                          <td>
                            {os.length
                              ? stamp(
                                  os.sort((a, b) =>
                                    b.criado_em.localeCompare(a.criado_em),
                                  )[0].criado_em,
                                )
                              : "—"}
                          </td>
                          <td>{money(relationshipTotal)}</td>
                        </>
                      ) : (
                        <>
                          <td>
                            {d.categoria === "Outro"
                              ? d.tipo_personalizado || "Outro"
                              : d.categoria}
                          </td>
                          <td>
                            {
                              customers.data.find((c) => c.id === d.cliente_id)
                                ?.nome
                            }
                          </td>
                          <td>
                            {d.numero_serie || "—"}
                            <small>{d.imei}</small>
                          </td>
                          <td>{os.length}</td>
                        </>
                      )}
                      <td>
                        <button
                          onClick={() => {
                            setEditing(r);
                            if (!isClient) {
                              const d = r as Equipamento;
                              setDeviceDraft({
                                categoria: d.categoria,
                                tipo_personalizado: d.tipo_personalizado || "",
                                marca: d.marca,
                                modelo: d.modelo,
                                cor: d.cor || "",
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
