"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MesaReparo,
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

type BenchOrder = {
  id: string;
  numero: number;
  problema: string;
  status: Status;
  prioridade: "baixa" | "normal" | "alta" | "urgente";
  tecnico: string | null;
  mesa_id: string | null;
  prazo_previsto: string | null;
  cliente_nome: string | null;
  equipamento_marca: string | null;
  equipamento_modelo: string | null;
};

type BenchData = {
  items: BenchOrder[];
  technicians: string[];
};

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
  const [configuring, setConfiguring] = useState(false);
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
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, loadBench]);

  const technicians = benchData.technicians;

  const visible = useMemo(
    () =>
      benchData.items.filter((order) => {
        if (["finalizado", "cancelado"].includes(order.status)) return false;
        if (bench && order.mesa_id !== bench) return false;
        if (technician && order.tecnico !== technician) return false;
        return `${order.numero} ${order.problema} ${order.cliente_nome || ""} ${order.equipamento_marca || ""} ${order.equipamento_modelo || ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [benchData.items, clients.data, devices.data, bench, technician, query],
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
                  <h2>{column.title}</h2>
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
                        <span className={`repair-priority ${order.prioridade}`}>
                          {priorityLabel[order.prioridade]}
                        </span>
                      </div>

                      <strong className="repair-customer">{order.cliente_nome || "Cliente"}</strong>
                      <span className="repair-device">
                        {`${order.equipamento_marca || ""} ${order.equipamento_modelo || ""}`.trim() || "Equipamento"}
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
