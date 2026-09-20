"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useRows,
  Ordem,
  Cliente,
  Equipamento,
  Orcamento,
  latestQuotes,
  money,
  stamp,
  statuses,
} from "@/lib/assistencia";
import { Heading, Badge, Empty, ErrorBox } from "@/components/ui";

const priorityLabels = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
} as const;

function initials(name?: string | null) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "—";
}

export default function Orders() {
  const os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes"),
    eq = useRows<Equipamento>("equipamentos"),
    qs = useRows<Orcamento>("orcamentos");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [technician, setTechnician] = useState("");
  const [priority, setPriority] = useState("");
  const [period, setPeriod] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "value">("recent");

  const quotes = latestQuotes(qs.data);

  const technicians = useMemo(
    () =>
      Array.from(
        new Set(
          os.data
            .map((order) => order.tecnico?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [os.data],
  );

  const list = useMemo(() => {
    const now = Date.now();
    const cutoff =
      period === "7"
        ? now - 7 * 86400000
        : period === "30"
          ? now - 30 * 86400000
          : period === "90"
            ? now - 90 * 86400000
            : null;

    const filtered = os.data.filter((order) => {
      if (status && order.status !== status) return false;
      if (technician && order.tecnico !== technician) return false;
      if (priority && order.prioridade !== priority) return false;
      if (cutoff && new Date(order.criado_em).getTime() < cutoff) return false;

      const customer = cs.data.find((item) => item.id === order.cliente_id);
      const device = eq.data.find((item) => item.id === order.equipamento_id);
      return `${order.numero} ${customer?.nome || ""} ${device?.marca || ""} ${device?.modelo || ""} ${order.problema}`
        .toLowerCase()
        .includes(search.toLowerCase().trim());
    });

    return [...filtered].sort((a, b) => {
      if (sort === "oldest")
        return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
      if (sort === "value")
        return Number(quotes[b.id]?.total || 0) - Number(quotes[a.id]?.total || 0);
      return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
    });
  }, [os.data, cs.data, eq.data, status, technician, priority, period, search, sort, quotes]);

  const activeOrders = os.data.filter(
    (order) => !["finalizado", "cancelado"].includes(order.status),
  );
  const metrics = [
    {
      label: "Ordens abertas",
      value: activeOrders.length,
      note: "Em andamento",
      icon: "▤",
      tone: "blue",
    },
    {
      label: "Em diagnóstico",
      value: os.data.filter((order) =>
        ["novo", "recebido", "em_diagnostico"].includes(order.status),
      ).length,
      note: "Aguardando análise",
      icon: "⌘",
      tone: "amber",
    },
    {
      label: "Urgentes",
      value: activeOrders.filter((order) => order.prioridade === "urgente").length,
      note: "Precisam de atenção",
      icon: "!",
      tone: "red",
    },
    {
      label: "Prontas para retirada",
      value: os.data.filter((order) => order.status === "pronto_retirada").length,
      note: "Aguardando cliente",
      icon: "✓",
      tone: "green",
    },
    {
      label: "Previsão de faturamento",
      value: money(
        activeOrders.reduce(
          (sum, order) => sum + Number(quotes[order.id]?.total || 0),
          0,
        ),
      ),
      note: "Orçamentos das OS abertas",
      icon: "▥",
      tone: "purple",
    },
  ];

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setTechnician("");
    setPriority("");
    setPeriod("");
  };

  const loading = os.loading || cs.loading || eq.loading || qs.loading;

  return (
    <section className="module orders-pro">
      <Heading
        title="Ordens de serviço"
        subtitle="Cada equipamento, cada etapa, sob controle."
        action="+ Nova ordem"
        href="/painel/ordens/nova"
      />

      <ErrorBox error={os.error || cs.error || eq.error || qs.error} />

      <div className="orders-summary">
        {metrics.map((metric) => (
          <article className={"orders-summary-card " + metric.tone} key={metric.label}>
            <span className="orders-summary-icon">{metric.icon}</span>
            <div>
              <strong>{loading ? "—" : metric.value}</strong>
              <b>{metric.label}</b>
              <small>{metric.note}</small>
            </div>
          </article>
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
              onChange={(event) => setStatus(event.target.value)}
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
              onChange={(event) => setTechnician(event.target.value)}
            >
              <option value="">Todos os técnicos</option>
              {technicians.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Prioridade</span>
            <select
              aria-label="Filtrar prioridade"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
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
              onChange={(event) => setPeriod(event.target.value)}
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
          <strong>{list.length} {list.length === 1 ? "ordem de serviço" : "ordens de serviço"}</strong>
          <label>
            <span>Ordenar por</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigas</option>
              <option value="value">Maior valor</option>
            </select>
          </label>
        </div>

        {loading ? (
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
                    const customer = cs.data.find((item) => item.id === order.cliente_id);
                    const device = eq.data.find((item) => item.id === order.equipamento_id);
                    return (
                      <tr key={order.id}>
                        <td>
                          <strong className="orders-os">#{order.numero}</strong>
                        </td>
                        <td>
                          <div className="orders-person">
                            <span>{initials(customer?.nome)}</span>
                            <strong>{customer?.nome || "Cliente"}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="orders-device">
                            <strong>{device?.modelo || "Equipamento"}</strong>
                            <small>{device?.marca || ""}</small>
                          </div>
                        </td>
                        <td>
                          <span className="orders-problem" title={order.problema}>
                            {order.problema}
                          </span>
                        </td>
                        <td>{stamp(order.criado_em)}</td>
                        <td className="orders-value">
                          {quotes[order.id] ? money(quotes[order.id].total) : "A orçar"}
                        </td>
                        <td>
                          <div className="orders-tech">
                            <span>{initials(order.tecnico)}</span>
                            <strong>{order.tecnico || "Não atribuído"}</strong>
                          </div>
                        </td>
                        <td>
                          <span className={"orders-priority " + order.prioridade}>
                            {priorityLabels[order.prioridade]}
                          </span>
                        </td>
                        <td>
                          <Badge status={order.status} />
                          {!order.entrada_confirmada && (
                            <small className="orders-review">Entrada em conferência</small>
                          )}
                        </td>
                        <td>
                          <Link className="orders-open-link" href={`/painel/ordens/${order.id}`}>
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
              {list.map((order) => {
                const customer = cs.data.find((item) => item.id === order.cliente_id);
                const device = eq.data.find((item) => item.id === order.equipamento_id);
                return (
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
                      <span>{initials(customer?.nome)}</span>
                      <div>
                        <strong>{customer?.nome || "Cliente"}</strong>
                        <small>
                          {device ? `${device.marca} ${device.modelo}`.trim() : "Equipamento"}
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
                        {quotes[order.id] ? money(quotes[order.id].total) : "A orçar"}
                      </strong>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
