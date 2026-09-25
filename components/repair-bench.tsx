"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MesaReparo,
  Status,
  useRows,
} from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import { useWorkspace } from "./workspace";
import {
  ErrorBox,
  MetricCard,
  MetricGrid,
  SemanticBadge,
  PanelTitle,
} from "./ui";
import { HorariaIcon } from "./horaria-icon";

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

function hoursSince(value: string | null) {
  if (!value) return 0;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 3600000);
}

type BenchOrder = {
  id: string;
  numero: number;
  problema: string;
  status: Status;
  prioridade: "baixa" | "normal" | "alta" | "urgente";
  tecnico: string | null;
  mesa_id: string | null;
  prazo_previsto: string | null;
  atualizado_em: string;
  cliente_nome: string | null;
  cliente_whatsapp: string | null;
  equipamento_marca: string | null;
  equipamento_modelo: string | null;
  orcamento_status: string | null;
  orcamento_total: number | null;
  orcamento_criado_em: string | null;
  orcamento_respondido_em: string | null;
  ultimo_contato_cliente_em: string | null;
};

type BenchData = {
  items: BenchOrder[];
  technicians: string[];
};

function repairPriorityTone(priority: BenchOrder["prioridade"]) {
  if (priority === "urgente") return "danger" as const;
  if (priority === "alta") return "warning" as const;
  if (priority === "baixa") return "neutral" as const;
  return "primary" as const;
}

function waitingForCustomer(order: BenchOrder) {
  return ["orcamento_enviado", "aguardando_aprovacao"].includes(order.status);
}

function quotePending(order: BenchOrder) {
  return order.status === "aguardando_orcamento";
}

function needsCustomerFollowup(order: BenchOrder) {
  const reference =
    order.status === "pronto_retirada"
      ? order.atualizado_em
      : order.orcamento_criado_em || order.atualizado_em;
  const lastContact = order.ultimo_contato_cliente_em
    ? new Date(order.ultimo_contato_cliente_em).getTime()
    : 0;
  const referenceTime = new Date(reference).getTime();

  if (lastContact >= referenceTime) return false;
  if (order.status === "pronto_retirada") return true;
  return waitingForCustomer(order) && hoursSince(reference) >= 24;
}

function whatsappNumber(value: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 13) return digits;
  return "";
}

function whatsappMessage(order: BenchOrder, companyName: string) {
  const customer = order.cliente_nome?.split(" ")[0] || "tudo bem";
  if (order.status === "pronto_retirada") {
    return `Olá, ${customer}! Aqui é da ${companyName}. Seu equipamento da OS #${order.numero} está pronto para retirada. Podemos combinar a entrega?`;
  }
  if (waitingForCustomer(order)) {
    return `Olá, ${customer}! Aqui é da ${companyName}. Passando para saber se você conseguiu analisar o orçamento da OS #${order.numero}. Se tiver alguma dúvida, posso ajudar.`;
  }
  return `Olá, ${customer}! Aqui é da ${companyName}. Estou entrando em contato para dar continuidade à OS #${order.numero}.`;
}


type DailyPending = {
  order: BenchOrder;
  kind: "overdue" | "urgent" | "followup" | "quote" | "part" | "stalled";
  title: string;
  detail: string;
  rank: number;
};

function staleLabel(value: string) {
  const hours = hoursSince(value);
  if (hours < 48) return "";
  const days = Math.floor(hours / 24);
  return days <= 1 ? "Sem atualização há 2 dias" : `Sem atualização há ${days} dias`;
}

function dailyPending(order: BenchOrder): DailyPending | null {
  const deadline = daysUntil(order.prazo_previsto);
  if (deadline !== null && deadline < 0) {
    return {
      order,
      kind: "overdue",
      title: "OS atrasada",
      detail: relativeDeadline(order.prazo_previsto),
      rank: 0,
    };
  }

  if (needsCustomerFollowup(order)) {
    return {
      order,
      kind: "followup",
      title:
        order.status === "pronto_retirada"
          ? "Aguardando retirada"
          : "Retorno ao cliente",
      detail:
        order.status === "pronto_retirada"
          ? "Equipamento pronto: combine a retirada com o cliente."
          : "Orçamento sem resposta: faça um novo contato.",
      rank: 1,
    };
  }

  if (quotePending(order)) {
    return {
      order,
      kind: "quote",
      title: "Orçamento pendente",
      detail: "Prepare e envie o orçamento para o cliente.",
      rank: 2,
    };
  }

  if (order.status === "aguardando_peca") {
    return {
      order,
      kind: "part",
      title: "Aguardando peça",
      detail: "Confirme a previsão de chegada e mantenha a OS atualizada.",
      rank: 3,
    };
  }

  if (order.prioridade === "urgente") {
    return {
      order,
      kind: "urgent",
      title: "OS urgente",
      detail: "Prioridade urgente definida pela equipe.",
      rank: 4,
    };
  }

  const stalled = staleLabel(order.atualizado_em);
  if (stalled) {
    return {
      order,
      kind: "stalled",
      title: "Sem movimentação",
      detail: stalled,
      rank: 5,
    };
  }

  return null;
}

export default function RepairBench() {
  const { empresa } = useWorkspace();
  const benches = useRows<MesaReparo>("mesas_reparo");
  const [benchData, setBenchData] = useState<BenchData>({
    items: [],
    technicians: [],
  });
  const [loadingBench, setLoadingBench] = useState(true);

  const [query, setQuery] = useState("");
  const [bench, setBench] = useState("");
  const [technician, setTechnician] = useState("");
  const [attentionFilter, setAttentionFilter] = useState<
    "all" | "waiting" | "quote" | "followup"
  >("all");
  const [configuring, setConfiguring] = useState(false);
  const [contactBusyOrder, setContactBusyOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadBench = useCallback(async (silent = false) => {
    if (!supabase) return;
    if (!silent) setLoadingBench(true);
    try {
      const result = await supabase.rpc("repair_bench_data");
      if (result.error) throw result.error;
      setBenchData(result.data as BenchData);
      setError("");
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      if (!silent) setLoadingBench(false);
    }
  }, []);

  useEffect(() => {
    void loadBench(false);
  }, [loadBench]);

  useEffect(() => {
    if (!supabase || !empresa.id) return;
    let timer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadBench(true), 250);
    };
    const channel = supabase
      .channel(`repair-bench-${empresa.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ordens_servico",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orcamentos",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "historico_os",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, loadBench]);

  const technicians = benchData.technicians;

  const baseVisible = useMemo(
    () =>
      benchData.items.filter((order) => {
        if (["finalizado", "cancelado"].includes(order.status)) return false;
        if (bench && order.mesa_id !== bench) return false;
        if (technician && order.tecnico !== technician) return false;
        return `${order.numero} ${order.problema} ${order.cliente_nome || ""} ${order.equipamento_marca || ""} ${order.equipamento_modelo || ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [benchData.items, bench, technician, query],
  );

  const waitingCount = baseVisible.filter(waitingForCustomer).length;
  const quotePendingCount = baseVisible.filter(quotePending).length;
  const followupCount = baseVisible.filter(needsCustomerFollowup).length;

  const dailyPendings = useMemo(
    () =>
      baseVisible
        .map(dailyPending)
        .filter((item): item is DailyPending => Boolean(item))
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            (a.order.prazo_previsto || "9999").localeCompare(
              b.order.prazo_previsto || "9999",
            ) ||
            b.order.numero - a.order.numero,
        ),
    [baseVisible],
  );

  const visible = useMemo(() => {
    if (attentionFilter === "waiting") return baseVisible.filter(waitingForCustomer);
    if (attentionFilter === "quote") return baseVisible.filter(quotePending);
    if (attentionFilter === "followup") return baseVisible.filter(needsCustomerFollowup);
    return baseVisible;
  }, [baseVisible, attentionFilter]);

  const urgentCount = visible.filter((order) => order.prioridade === "urgente").length;
  const overdueCount = visible.filter((order) => {
    const days = daysUntil(order.prazo_previsto);
    return days !== null && days < 0;
  }).length;
  const readyToday = visible.filter(
    (order) => order.status === "pronto_retirada" && daysUntil(order.prazo_previsto) === 0,
  ).length;

  async function registerCustomerFollowup(order: BenchOrder) {
    if (!supabase || contactBusyOrder) return;
    setContactBusyOrder(order.id);
    setError("");
    try {
      const result = await supabase.rpc("registrar_retorno_cliente", {
        p_ordem: order.id,
      });
      if (result.error) throw result.error;
      await loadBench(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setContactBusyOrder("");
    }
  }

  async function move(
    order: BenchOrder,
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
    else await loadBench(true);
    setBusy(false);
  }

  return (
    <div className="repair-pro">
      <ErrorBox
        error={error || benches.error}
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

      <MetricGrid columns={4} className="repair-summary">
        <MetricCard
          label="Em andamento"
          value={visible.length}
          note="Ordens na mesa"
          iconName="services"
        />
        <MetricCard
          label="Urgentes"
          value={urgentCount}
          note="Precisam de atenção"
          iconName="alert"
          tone="danger"
          active={urgentCount > 0}
          emphasizeValue
        />
        <MetricCard
          label="Atrasadas"
          value={overdueCount}
          note="Prazo vencido"
          iconName="clock"
          tone="warning"
          active={overdueCount > 0}
          emphasizeValue
        />
        <MetricCard
          label="Prontas hoje"
          value={readyToday}
          note="Disponíveis para retirada"
          iconName="check"
          tone="success"
        />
      </MetricGrid>

      <section className="repair-daily-pending" aria-label="Pendências do dia">
        <div className="repair-daily-pending-head">
          <div>
            <span>PRIORIDADES DO DIA</span>
            <strong className="repair-daily-title-with-icon">
              <HorariaIcon name="alert" />
              Pendências que precisam de ação
            </strong>
            <small>
              Atrasos, retornos, orçamentos, peças e OS sem movimentação aparecem aqui automaticamente.
            </small>
          </div>
          <b>{dailyPendings.length}</b>
        </div>

        {dailyPendings.length ? (
          <div className="repair-daily-pending-list">
            {dailyPendings.slice(0, 8).map((pending) => {
              const order = pending.order;
              const number = whatsappNumber(order.cliente_whatsapp);
              return (
                <article
                  className={`repair-daily-item kind-${pending.kind}`}
                  key={order.id}
                >
                  <span className="repair-daily-dot" aria-hidden="true" />
                  <div className="repair-daily-copy">
                    <div>
                      <strong>{pending.title}</strong>
                      <span>OS #{order.numero}</span>
                    </div>
                    <p>
                      {order.cliente_nome || "Cliente"} ·{" "}
                      {`${order.equipamento_marca || ""} ${order.equipamento_modelo || ""}`.trim() ||
                        "Equipamento"}
                    </p>
                    <small>{pending.detail}</small>
                  </div>
                  <div className="repair-daily-actions">
                    {pending.kind === "followup" && number && (
                      <a
                        href={`https://wa.me/${number}?text=${encodeURIComponent(
                          whatsappMessage(order, empresa.nome || "assistência"),
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp ↗
                      </a>
                    )}
                    <Link href={`/painel/ordens/${order.id}`}>Abrir OS</Link>
                  </div>
                </article>
              );
            })}
            {dailyPendings.length > 8 && (
              <small className="repair-daily-more">
                + {dailyPendings.length - 8} pendência(s) adicional(is). Use os filtros abaixo para revisar todas.
              </small>
            )}
          </div>
        ) : (
          <div className="repair-daily-empty">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Nenhuma pendência crítica agora.</strong>
              <small>A Central continua acompanhando as OS em andamento.</small>
            </div>
          </div>
        )}
      </section>

      <section className="repair-attention-center" aria-label="Pendências de atendimento">
        <div className="repair-attention-copy">
          <strong>Atendimento ao cliente</strong>
          <small>
            Use estes atalhos para encontrar quem está esperando orçamento ou precisa de retorno.
          </small>
        </div>
        <div className="repair-attention-filters">
          <button
            type="button"
            className={attentionFilter === "waiting" ? "active" : ""}
            onClick={() => setAttentionFilter(attentionFilter === "waiting" ? "all" : "waiting")}
          >
            <span>{waitingCount}</span>
            Aguardando cliente
          </button>
          <button
            type="button"
            className={attentionFilter === "quote" ? "active" : ""}
            onClick={() => setAttentionFilter(attentionFilter === "quote" ? "all" : "quote")}
          >
            <span>{quotePendingCount}</span>
            Orçamento pendente
          </button>
          <button
            type="button"
            className={attentionFilter === "followup" ? "active" : ""}
            onClick={() => setAttentionFilter(attentionFilter === "followup" ? "all" : "followup")}
          >
            <span>{followupCount}</span>
            Precisa de retorno
          </button>
        </div>
        <small className="repair-attention-note">
          “Precisa de retorno” inclui equipamento pronto para retirada ou orçamento sem resposta há pelo menos 24 horas.
        </small>
      </section>

      {configuring && (
        <section className="panel bench-settings repair-settings">
          <div>
            <PanelTitle
              title="Mesas e bancadas"
              icon="services"
              subtitle="Organize a operação por bancada, especialidade ou técnico."
            />
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

      {loadingBench && !benchData.items.length && (
        <div className="module-inline-loading" aria-live="polite">
          <span />
          <div>
            <strong>Carregando mesa de reparo…</strong>
            <small>Buscando somente as OS em andamento.</small>
          </div>
        </div>
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
                const order = benchData.items.find(
                  (item) => item.id === event.dataTransfer.getData("text/order-id"),
                );
                if (order) void move(order, column.target);
              }}
            >
              <header>
                <div className="repair-column-title">
                  <span className="repair-column-accent" />
                  <h2 title={column.title}>{column.title}</h2>
                </div>
                <span className="repair-column-count">{cards.length}</span>
              </header>

              <div className="repair-column-cards">
                {cards.map((order) => {
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
                        <SemanticBadge tone={repairPriorityTone(order.prioridade)}>
                          {priorityLabel[order.prioridade]}
                        </SemanticBadge>
                      </div>

                      <strong className="repair-customer">{order.cliente_nome || "Cliente"}</strong>
                      <span className="repair-device">
                        {`${order.equipamento_marca || ""} ${order.equipamento_modelo || ""}`.trim() || "Equipamento"}
                      </span>
                      <p className="repair-problem">{order.problema}</p>

                      {(waitingForCustomer(order) || quotePending(order) || needsCustomerFollowup(order)) && (
                        <div className="repair-attention-tags">
                          {quotePending(order) && (
                            <SemanticBadge tone="primary">Orçamento pendente</SemanticBadge>
                          )}
                          {waitingForCustomer(order) && (
                            <SemanticBadge tone="warning">Aguardando cliente</SemanticBadge>
                          )}
                          {needsCustomerFollowup(order) && (
                            <SemanticBadge tone="danger">Retorno necessário</SemanticBadge>
                          )}
                        </div>
                      )}

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

                      <div className="repair-customer-actions">
                        <Link href={`/painel/ordens/${order.id}`}>
                          Abrir OS
                        </Link>
                        {whatsappNumber(order.cliente_whatsapp) && (
                          <a
                            href={`https://wa.me/${whatsappNumber(order.cliente_whatsapp)}?text=${encodeURIComponent(
                              whatsappMessage(order, empresa.nome || "assistência"),
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp ↗
                          </a>
                        )}
                        {(waitingForCustomer(order) || order.status === "pronto_retirada") && (
                          <button
                            type="button"
                            className="repair-followup-done"
                            disabled={contactBusyOrder === order.id}
                            onClick={() => void registerCustomerFollowup(order)}
                          >
                            {contactBusyOrder === order.id
                              ? "Salvando…"
                              : needsCustomerFollowup(order)
                                ? "✓ Marcar retorno feito"
                                : "Registrar novo retorno"}
                          </button>
                        )}
                      </div>
                      {order.ultimo_contato_cliente_em && (
                        <small className="repair-last-contact">
                          Último retorno: {new Date(order.ultimo_contato_cliente_em).toLocaleString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </small>
                      )}
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
