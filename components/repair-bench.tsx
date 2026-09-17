"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Cliente,
  Equipamento,
  MesaReparo,
  Ordem,
  Status,
  stamp,
  useRows,
} from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import { useWorkspace } from "./workspace";
import { Empty, ErrorBox } from "./ui";

const columns: { title: string; target: Status; statuses: Status[] }[] = [
  { title: "Recebidos", target: "recebido", statuses: ["novo", "recebido"] },
  {
    title: "Diagnóstico",
    target: "em_diagnostico",
    statuses: ["em_diagnostico", "aguardando_orcamento"],
  },
  {
    title: "Aguardando aprovação",
    target: "aguardando_aprovacao",
    statuses: ["orcamento_enviado", "aguardando_aprovacao"],
  },
  {
    title: "Aguardando peça",
    target: "aguardando_peca",
    statuses: ["aguardando_peca"],
  },
  {
    title: "Em reparo",
    target: "em_reparo",
    statuses: ["orcamento_aprovado", "em_reparo"],
  },
  { title: "Em testes", target: "em_testes", statuses: ["em_testes"] },
  {
    title: "Prontos",
    target: "pronto_retirada",
    statuses: ["pronto_retirada"],
  },
];
const priorityLabel = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export default function RepairBench() {
  const { empresa } = useWorkspace();
  const orders = useRows<Ordem>("ordens_servico");
  const clients = useRows<Cliente>("clientes");
  const devices = useRows<Equipamento>("equipamentos");
  const benches = useRows<MesaReparo>("mesas_reparo");
  const [query, setQuery] = useState("");
  const [bench, setBench] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = useMemo(
    () =>
      orders.data.filter((order) => {
        if (["finalizado", "cancelado"].includes(order.status)) return false;
        if (bench && order.mesa_id !== bench) return false;
        const client = clients.data.find(
          (item) => item.id === order.cliente_id,
        );
        const device = devices.data.find(
          (item) => item.id === order.equipamento_id,
        );
        return `${order.numero} ${order.problema} ${client?.nome} ${device?.marca} ${device?.modelo}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [orders.data, clients.data, devices.data, bench, query],
  );
  async function move(
    order: Ordem,
    status: Status,
    mesaId = order.mesa_id,
    priority = order.prioridade,
  ) {
    setBusy(true);
    setError("");
    const result = await supabase!.rpc("mover_ordem_reparo", {
      p_ordem: order.id,
      p_status: status,
      p_mesa: mesaId || null,
      p_prioridade: priority,
    });
    if (result.error) setError(message(result.error));
    else await orders.reload();
    setBusy(false);
  }
  return (
    <>
      <ErrorBox
        error={
          error ||
          orders.error ||
          clients.error ||
          devices.error ||
          benches.error
        }
      />
      <div className="toolbar repair-toolbar">
        <input
          aria-label="Buscar na mesa"
          placeholder="Buscar OS, cliente, aparelho ou problema…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filtrar por mesa"
          value={bench}
          onChange={(event) => setBench(event.target.value)}
        >
          <option value="">Todas as mesas</option>
          {benches.data
            .filter((item) => item.ativo)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
        </select>
        <button onClick={() => setConfiguring(!configuring)}>
          {configuring ? "Fechar mesas" : "Configurar mesas"}
        </button>
        <Link className="primary" href="/painel/ordens/nova">
          + Nova ordem
        </Link>
      </div>
      {configuring && (
        <section className="panel bench-settings">
          <div>
            <h2>Mesas e bancadas</h2>
            <p>Organize a operação por bancada, especialidade ou técnico.</p>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget);
              const result = await supabase!
                .from("mesas_reparo")
                .insert({
                  empresa_id: empresa.id,
                  nome: form.get("nome"),
                  descricao: form.get("descricao") || null,
                  ordem_exibicao: benches.data.length,
                })
                .select("id")
                .single();
              if (result.error) setError(message(result.error));
              else {
                event.currentTarget.reset();
                await benches.reload();
              }
              setBusy(false);
            }}
          >
            <div className="form-grid">
              <label>
                Nome
                <input
                  name="nome"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ex.: Microsoldagem"
                />
              </label>
              <label>
                Descrição
                <input
                  name="descricao"
                  maxLength={200}
                  placeholder="Uso opcional"
                />
              </label>
            </div>
            <button className="primary" disabled={busy}>
              Adicionar mesa
            </button>
          </form>
          <div className="bench-list">
            {benches.data.map((item) => (
              <button
                key={item.id}
                className={item.ativo ? "" : "inactive"}
                onClick={async () => {
                  await supabase!
                    .from("mesas_reparo")
                    .update({ ativo: !item.ativo })
                    .eq("id", item.id);
                  await benches.reload();
                }}
              >
                {item.nome}
                <small>{item.ativo ? "Ativa" : "Inativa"}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {!visible.length && !orders.loading ? (
        <Empty
          title="Nenhuma ordem na mesa de reparo"
          text="Ordens em andamento aparecerão aqui automaticamente."
        />
      ) : (
        <div className="repair-board">
          {columns.map((column) => {
            const cards = visible.filter((order) =>
              column.statuses.includes(order.status),
            );
            return (
              <section
                className="repair-column"
                key={column.title}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const order = orders.data.find(
                    (item) =>
                      item.id === event.dataTransfer.getData("text/order-id"),
                  );
                  if (order) void move(order, column.target);
                }}
              >
                <header>
                  <h2>{column.title}</h2>
                  <span>{cards.length}</span>
                </header>
                <div>
                  {cards.map((order) => {
                    const client = clients.data.find(
                      (item) => item.id === order.cliente_id,
                    );
                    const device = devices.data.find(
                      (item) => item.id === order.equipamento_id,
                    );
                    return (
                      <article
                        className={`repair-card priority-${order.prioridade}`}
                        key={order.id}
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData("text/order-id", order.id)
                        }
                      >
                        <div className="repair-card-head">
                          <Link href={`/painel/ordens/${order.id}`}>
                            OS #{order.numero}
                          </Link>
                          <span>{priorityLabel[order.prioridade]}</span>
                        </div>
                        <strong>
                          {device
                            ? `${device.marca} ${device.modelo}`.trim()
                            : "Equipamento"}
                        </strong>
                        <small>{client?.nome || "Cliente"}</small>
                        <p>{order.problema}</p>
                        <dl>
                          <div>
                            <dt>Técnico</dt>
                            <dd>{order.tecnico || "A definir"}</dd>
                          </div>
                          <div>
                            <dt>Mesa</dt>
                            <dd>
                              {benches.data.find(
                                (item) => item.id === order.mesa_id,
                              )?.nome || "Sem mesa"}
                            </dd>
                          </div>
                        </dl>
                        <small>
                          Entrada: {stamp(order.criado_em)}
                          {order.prazo_previsto
                            ? ` · Prazo: ${stamp(order.prazo_previsto)}`
                            : ""}
                        </small>
                        <div className="repair-card-controls">
                          <select
                            aria-label={`Etapa da OS ${order.numero}`}
                            value={column.title}
                            disabled={busy}
                            onChange={(event) => {
                              const next = columns.find(
                                (item) => item.title === event.target.value,
                              );
                              if (next) void move(order, next.target);
                            }}
                          >
                            {columns.map((item) => (
                              <option key={item.title}>{item.title}</option>
                            ))}
                          </select>
                          <select
                            aria-label={`Mesa da OS ${order.numero}`}
                            value={order.mesa_id || ""}
                            disabled={busy}
                            onChange={(event) =>
                              void move(
                                order,
                                order.status,
                                event.target.value || null,
                              )
                            }
                          >
                            <option value="">Sem mesa</option>
                            {benches.data
                              .filter((item) => item.ativo)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.nome}
                                </option>
                              ))}
                          </select>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className="hint">
        No computador, arraste os cartões entre as etapas. No celular, use o
        seletor de etapa.
      </p>
    </>
  );
}
