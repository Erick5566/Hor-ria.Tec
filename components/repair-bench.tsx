"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Cliente,
  Equipamento,
  MesaReparo,
  Ordem,
  Status,
  useRows,
} from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import { useWorkspace } from "./workspace";
import { ErrorBox } from "./ui";

const columns: {
  title: string;
  target: Status;
  statuses: Status[];
  tone: string;
}[] = [
  { title: "Recebidos", target: "recebido", statuses: ["novo", "recebido"], tone: "slate" },
  {
    title: "Diagnóstico",
    target: "em_diagnostico",
    statuses: ["em_diagnostico", "aguardando_orcamento"],
    tone: "blue",
  },
  {
    title: "Aguardando aprovação",
    target: "aguardando_aprovacao",
    statuses: ["orcamento_enviado", "aguardando_aprovacao"],
    tone: "amber",
  },
  {
    title: "Aguardando peça",
    target: "aguardando_peca",
    statuses: ["aguardando_peca"],
    tone: "purple",
  },
  {
    title: "Em reparo",
    target: "em_reparo",
    statuses: ["orcamento_aprovado", "em_reparo"],
    tone: "indigo",
  },
  { title: "Testes", target: "em_testes", statuses: ["em_testes"], tone: "cyan" },
  {
    title: "Pronto para retirada",
    target: "pronto_retirada",
    statuses: ["pronto_retirada"],
    tone: "green",
  },
];

const priorityLabel = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

function daysUntil(value: string | null) {
  if (!value) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(value);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function relativeDeadline(value: string | null) {
  const days = daysUntil(value);
  if (days === null) return "Sem prazo";
  if (days < -1) return `Atrasada há ${Math.abs(days)} dias`;
  if (days === -1) return "Atrasada há 1 dia";
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Prazo em ${days} dias`;
}

export default function RepairBench() {
  const { empresa } = useWorkspace();
  const orders = useRows<Ordem>("ordens_servico");
  const clients = useRows<Cliente>("clientes");
  const devices = useRows<Equipamento>("equipamentos");
  const benches = useRows<MesaReparo>("mesas_reparo");

  const [query, setQuery] = useState("");
  const [bench, setBench] = useState("");
  const [technician, setTechnician] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const technicians = useMemo(
    () =>
      Array.from(
        new Set(
          orders.data
            .map((order) => order.tecnico?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [orders.data],
  );

  const visible = useMemo(
    () =>
      orders.data.filter((order) => {
        if (["finalizado", "cancelado"].includes(order.status)) return false;
        if (bench && order.mesa_id !== bench) return false;
        if (technician && order.tecnico !== technician) return false;
        const client = clients.data.find((item) => item.id === order.cliente_id);
        const device = devices.data.find((item) => item.id === order.equipamento_id);
        return `${order.numero} ${order.problema} ${client?.nome} ${device?.marca} ${device?.modelo}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [orders.data, clients.data, devices.data, bench, technician, query],
  );

  const urgentCount = visible.filter((order) => order.prioridade === "urgente").length;
  const overdueCount = visible.filter((order) => {
    const days = daysUntil(order.prazo_previsto);
    return days !== null && days < 0;
  }).length;
  const readyToday = visible.filter(
    (order) => order.status === "pronto_retirada" && daysUntil(order.prazo_previsto) === 0,
  ).length;

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
    <div className="repair-pro">
      <ErrorBox
        error={error || orders.error || clients.error || devices.error || benches.error}
      />

      <div className="repair-pro-toolbar">
        <label className="repair-search">
          <span>⌕</span>
          <input
            aria-label="Buscar na mesa"
            placeholder="Buscar OS, cliente, aparelho ou problema..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

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

        <select
          aria-label="Filtrar por técnico"
          value={technician}
          onChange={(event) => setTechnician(event.target.value)}
        >
          <option value="">Todos os técnicos</option>
          {technicians.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>

        <button className="repair-config-button" onClick={() => setConfiguring(!configuring)}>
          {configuring ? "Fechar mesas" : "Configurar mesas"}
        </button>

        <Link className="primary repair-new-order" href="/painel/ordens/nova">
          + Nova ordem
        </Link>
      </div>

      <div className="repair-summary">
        <article>
          <span className="repair-summary-icon blue">⌘</span>
          <div><small>Em andamento</small><strong>{visible.length}</strong></div>
        </article>
        <article>
          <span className="repair-summary-icon red">!</span>
          <div><small>Urgentes</small><strong>{urgentCount}</strong></div>
        </article>
        <article>
          <span className="repair-summary-icon amber">◷</span>
          <div><small>Atrasadas</small><strong>{overdueCount}</strong></div>
        </article>
        <article>
          <span className="repair-summary-icon green">✓</span>
          <div><small>Prontas hoje</small><strong>{readyToday}</strong></div>
        </article>
      </div>

      {configuring && (
        <section className="panel bench-settings repair-settings">
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
                <input name="nome" required minLength={2} maxLength={80} placeholder="Ex.: Microsoldagem" />
              </label>
              <label>
                Descrição
                <input name="descricao" maxLength={200} placeholder="Uso opcional" />
              </label>
            </div>
            <button className="primary" disabled={busy}>Adicionar mesa</button>
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

      <div className="repair-board repair-board-pro">
        {columns.map((column) => {
          const cards = visible.filter((order) => column.statuses.includes(order.status));
          return (
            <section
              className={`repair-column repair-column-pro tone-${column.tone}`}
              key={column.title}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const order = orders.data.find(
                  (item) => item.id === event.dataTransfer.getData("text/order-id"),
                );
                if (order) void move(order, column.target);
              }}
            >
              <header>
                <div className="repair-column-title">
                  <span className="repair-column-accent" />
                  <h2>{column.title}</h2>
                </div>
                <span className="repair-column-count">{cards.length}</span>
              </header>

              <div className="repair-column-cards">
                {cards.map((order) => {
                  const client = clients.data.find((item) => item.id === order.cliente_id);
                  const device = devices.data.find((item) => item.id === order.equipamento_id);
                  const benchName =
                    benches.data.find((item) => item.id === order.mesa_id)?.nome || "Sem mesa";
                  const overdue = (daysUntil(order.prazo_previsto) ?? 0) < 0;

                  return (
                    <article
                      className={`repair-card repair-card-pro priority-${order.prioridade}`}
                      key={order.id}
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData("text/order-id", order.id)
                      }
                    >
                      <div className="repair-card-head">
                        <Link href={`/painel/ordens/${order.id}`}>#{order.numero}</Link>
                        <span className={`repair-priority ${order.prioridade}`}>
                          {priorityLabel[order.prioridade]}
                        </span>
                      </div>

                      <strong className="repair-customer">{client?.nome || "Cliente"}</strong>
                      <span className="repair-device">
                        {device ? `${device.marca} ${device.modelo}`.trim() : "Equipamento"}
                      </span>
                      <p className="repair-problem">{order.problema}</p>

                      <div className="repair-meta">
                        <span className={overdue ? "overdue" : ""}>◷ {relativeDeadline(order.prazo_previsto)}</span>
                        <span title={order.tecnico || "Técnico não definido"}>{(order.tecnico || "—").slice(0, 2).toUpperCase()}</span>
                      </div>

                      <div className="repair-card-details">
                        <small>{order.tecnico || "Técnico a definir"}</small>
                        <small>{benchName}</small>
                      </div>

                      <div className="repair-card-controls">
                        <select
                          aria-label={`Etapa da OS ${order.numero}`}
                          value={column.title}
                          disabled={busy}
                          onChange={(event) => {
                            const next = columns.find((item) => item.title === event.target.value);
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
                            void move(order, order.status, event.target.value || null)
                          }
                        >
                          <option value="">Sem mesa</option>
                          {benches.data
                            .filter((item) => item.ativo)
                            .map((item) => (
                              <option key={item.id} value={item.id}>{item.nome}</option>
                            ))}
                        </select>
                      </div>
                    </article>
                  );
                })}

                {!cards.length && (
                  <div className="repair-empty-drop">
                    <span>⌘</span>
                    <strong>Nenhuma OS nesta etapa</strong>
                    <small>Arraste uma OS para cá</small>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="repair-help-bar">
        <span>↔</span>
        <div>
          <strong>Arraste os cards para mover a OS entre as etapas.</strong>
          <small>No celular, use o seletor de etapa dentro do card.</small>
        </div>
        <Link href="/painel/ajuda">Precisa de ajuda? →</Link>
      </div>
    </div>
  );
}
