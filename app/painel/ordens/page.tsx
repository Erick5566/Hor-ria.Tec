"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  money,
  stamp,
  statuses,
  type Status,
} from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import {
  Heading,
  Badge,
  Empty,
  ErrorBox,
  MetricCard,
  Pagination,
} from "@/components/ui";
import { useWorkspace } from "@/components/workspace";

const priorityLabels = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
} as const;

type Priority = keyof typeof priorityLabels;

type OrderListItem = {
  id: string;
  numero: number;
  problema: string;
  criado_em: string;
  tecnico: string | null;
  prioridade: Priority;
  status: Status;
  entrada_confirmada: boolean;
  cliente_nome: string | null;
  equipamento_marca: string | null;
  equipamento_modelo: string | null;
  quote_total: number | null;
};

type OrdersPageData = {
  page: number;
  pageSize: number;
  total: number;
  items: OrderListItem[];
  technicians: string[];
  metrics: {
    open: number;
    diagnostic: number;
    urgent: number;
    ready: number;
    forecast: number;
  };
};

function initials(name?: string | null) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "—";
}

export default function Orders() {
  const params = useSearchParams();
  const { empresa } = useWorkspace();
  const [search, setSearch] = useState(params.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [status, setStatus] = useState("");
  const [technician, setTechnician] = useState("");
  const [priority, setPriority] = useState("");
  const [period, setPeriod] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "value">("recent");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrdersPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = params.get("q") || "";
    setSearch(next);
    setPage(1);
  }, [params]);

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
        const result = await supabase.rpc("orders_list_page", {
          p_page: page,
          p_page_size: 30,
          p_search: debouncedSearch || null,
          p_status: status || null,
          p_technician: technician || null,
          p_priority: priority || null,
          p_period: period ? Number(period) : null,
          p_sort: sort,
        });
        if (result.error) throw result.error;
        setData(result.data as OrdersPageData);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, debouncedSearch, status, technician, priority, period, sort],
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
      .channel(`orders-list-${empresa.id}`)
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
          event: "*",
          schema: "public",
          table: "clientes",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "equipamentos",
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

  const metrics = [
    {
      label: "Ordens abertas",
      value: data?.metrics.open ?? 0,
      note: "Em andamento",
      icon: "▤",
      tone: "blue",
    },
    {
      label: "Em diagnóstico",
      value: data?.metrics.diagnostic ?? 0,
      note: "Aguardando análise",
      icon: "⌘",
      tone: "amber",
    },
    {
      label: "Urgentes",
      value: data?.metrics.urgent ?? 0,
      note: "Precisam de atenção",
      icon: "!",
      tone: "red",
    },
    {
      label: "Prontas para retirada",
      value: data?.metrics.ready ?? 0,
      note: "Aguardando cliente",
      icon: "✓",
      tone: "green",
    },
    {
      label: "Previsão de faturamento",
      value: money(data?.metrics.forecast ?? 0),
      note: "Orçamentos das OS abertas",
      icon: "▥",
      tone: "purple",
    },
  ];

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setTechnician("");
    setPriority("");
    setPeriod("");
    setPage(1);
  };

  const list = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <section className="module orders-pro">
      <Heading
        title="Ordens de serviço"
        subtitle="Cada equipamento, cada etapa, sob controle."
        action="+ Nova ordem"
        href="/painel/ordens/nova"
      />

      <ErrorBox error={error} />

      <div className="orders-summary">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={loading && !data ? "—" : metric.value}
            note={metric.note}
            icon={metric.icon}
            tone={metric.tone as "blue" | "amber" | "red" | "green" | "purple"}
          />
        ))}
      </div>

      <section className="orders-filters-card">
        <div className="orders-search-row">
          <label className="orders-search">
            <span>⌕</span>
            <input
              aria-label="Buscar ordens"
              placeholder="Buscar OS, cliente, equipamento ou problema..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button className="orders-clear" type="button" onClick={clearFilters}>
            ↻ Limpar filtros
          </button>
        </div>

        <div className="orders-filter-grid">
          <label>
            <span>Status</span>
            <select
              aria-label="Filtrar status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os status</option>
              {Object.entries(statuses).map(([value, name]) => (
                <option value={value} key={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Técnico</span>
            <select
              aria-label="Filtrar técnico"
              value={technician}
              onChange={(event) => {
                setTechnician(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os técnicos</option>
              {(data?.technicians ?? []).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Prioridade</span>
            <select
              aria-label="Filtrar prioridade"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas as prioridades</option>
              <option value="urgente">Urgente</option>
              <option value="alta">Alta</option>
              <option value="normal">Normal</option>
              <option value="baixa">Baixa</option>
            </select>
          </label>

          <label>
            <span>Período</span>
            <select
              aria-label="Filtrar período"
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todo o período</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
          </label>
        </div>
      </section>

      <section className="orders-table-card">
        <div className="orders-table-head">
          <strong>{total} {total === 1 ? "ordem de serviço" : "ordens de serviço"}</strong>
          <label>
            <span>Ordenar por</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as typeof sort);
                setPage(1);
              }}
            >
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigas</option>
              <option value="value">Maior valor</option>
            </select>
          </label>
        </div>

        {loading && !data ? (
          <Empty title="Carregando ordens…" />
        ) : !list.length ? (
          <Empty
            title="Nenhuma ordem encontrada."
            text="Ajuste os filtros ou abra uma nova ordem para iniciar o atendimento."
            href="/painel/ordens/nova"
            action="Criar ordem"
          />
        ) : (
          <>
            <div className="table-wrap desktop-table orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>OS</th>
                    <th>Cliente</th>
                    <th>Equipamento</th>
                    <th>Problema</th>
                    <th>Entrada</th>
                    <th>Valor</th>
                    <th>Técnico</th>
                    <th>Prioridade</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((order) => {
                    const orderHref = `/painel/ordens/${order.id}`;
                    const orderLabel = `Abrir ordem #${order.numero}`;
                    return (
                      <tr key={order.id} className="orders-clickable-row">
                        <td>
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            <strong className="orders-os">#{order.numero}</strong>
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            <div className="orders-person">
                              <span>{initials(order.cliente_nome)}</span>
                              <strong>{order.cliente_nome || "Cliente"}</strong>
                            </div>
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            <div className="orders-device">
                              <strong>{order.equipamento_modelo || "Equipamento"}</strong>
                              <small>{order.equipamento_marca || ""}</small>
                            </div>
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            <span className="orders-problem" title={order.problema}>
                              {order.problema}
                            </span>
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            {stamp(order.criado_em)}
                          </Link>
                        </td>
                        <td className="orders-value">
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            {order.quote_total != null ? money(order.quote_total) : "A orçar"}
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            <div className="orders-tech">
                              <span>{initials(order.tecnico)}</span>
                              <strong>{order.tecnico || "Não atribuído"}</strong>
                            </div>
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-cell-link" href={orderHref} aria-label={orderLabel}>
                            <span className={"orders-priority " + order.prioridade}>
                              {priorityLabels[order.prioridade]}
                            </span>
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-cell-link orders-status-link" href={orderHref} aria-label={orderLabel}>
                            <Badge status={order.status} />
                            {!order.entrada_confirmada && (
                              <small className="orders-review">Entrada em conferência</small>
                            )}
                          </Link>
                        </td>
                        <td>
                          <Link className="orders-open-link" href={orderHref} aria-label={orderLabel}>
                            Abrir →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards orders-mobile-cards">
              {list.map((order) => (
                <Link
                  className="mobile-order orders-mobile-card"
                  href={`/painel/ordens/${order.id}`}
                  key={order.id}
                >
                  <div className="orders-mobile-top">
                    <strong>OS #{order.numero}</strong>
                    <Badge status={order.status} />
                  </div>
                  <div className="orders-mobile-person">
                    <span>{initials(order.cliente_nome)}</span>
                    <div>
                      <strong>{order.cliente_nome || "Cliente"}</strong>
                      <small>
                        {order.equipamento_modelo
                          ? `${order.equipamento_marca || ""} ${order.equipamento_modelo}`.trim()
                          : "Equipamento"}
                      </small>
                    </div>
                  </div>
                  <p className="orders-mobile-problem">{order.problema}</p>
                  <div className="orders-mobile-meta">
                    <span className={"orders-priority " + order.prioridade}>
                      {priorityLabels[order.prioridade]}
                    </span>
                    <span>{order.tecnico || "Sem técnico"}</span>
                    <strong>
                      {order.quote_total != null ? money(order.quote_total) : "A orçar"}
                    </strong>
                  </div>
                </Link>
              ))}
            </div>

            <Pagination
              page={data?.page || page}
              pageSize={data?.pageSize || 30}
              total={total}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </section>
  );
}
