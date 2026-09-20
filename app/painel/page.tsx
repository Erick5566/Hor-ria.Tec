"use client";
import Link from "next/link";
import {
  useRows,
  Ordem,
  Cliente,
  Equipamento,
  Lancamento,
  money,
} from "@/lib/assistencia";
import { Agendamento, today, time } from "@/lib/supabase";
import { Heading, Empty, Badge, ErrorBox } from "@/components/ui";

const statusGroups = [
  {
    key: "diagnostico",
    label: "Aguardando diagnóstico",
    color: "#f0ad34",
    statuses: ["novo", "recebido", "em_diagnostico"],
  },
  {
    key: "orcamento",
    label: "Aguardando orçamento",
    color: "#8e58e9",
    statuses: ["aguardando_orcamento", "orcamento_enviado", "aguardando_aprovacao"],
  },
  {
    key: "abertas",
    label: "Ordens abertas",
    color: "#287cf3",
    statuses: ["aguardando_peca"],
  },
  {
    key: "reparo",
    label: "Em reparo",
    color: "#25b47e",
    statuses: ["em_reparo", "em_testes"],
  },
  {
    key: "prontas",
    label: "Prontas para retirada",
    color: "#68b5e4",
    statuses: ["pronto_retirada"],
  },
  {
    key: "finalizadas",
    label: "Finalizadas",
    color: "#9aa5b7",
    statuses: ["finalizado"],
  },
] as const;

function dateKey(value: string) {
  return value.slice(0, 10);
}

export default function Overview() {
  const os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes"),
    eq = useRows<Equipamento>("equipamentos"),
    agenda = useRows<Agendamento>("agendamentos"),
    fin = useRows<Lancamento>("financeiro");

  const day = today();
  const month = day.slice(0, 7);
  const openOrders = os.data.filter(
    (item) => !["finalizado", "cancelado"].includes(item.status),
  );
  const monthRevenue = fin.data
    .filter(
      (item) =>
        item.tipo === "receita" &&
        item.status === "pago" &&
        item.pago_em?.startsWith(month),
    )
    .reduce((sum, item) => sum + Number(item.valor), 0);

  const metrics = [
    {
      name: "Ordens abertas",
      value: openOrders.length,
      icon: "▤",
      tone: "blue",
      note: "Em andamento",
    },
    {
      name: "Aguardando diagnóstico",
      value: os.data.filter((item) =>
        ["novo", "recebido", "em_diagnostico"].includes(item.status),
      ).length,
      icon: "⌕",
      tone: "amber",
      note: "Precisam de análise",
    },
    {
      name: "Aguardando orçamento",
      value: os.data.filter((item) =>
        ["aguardando_orcamento", "orcamento_enviado", "aguardando_aprovacao"].includes(
          item.status,
        ),
      ).length,
      icon: "▧",
      tone: "purple",
      note: "Preparação ou aprovação",
    },
    {
      name: "Em reparo",
      value: os.data.filter((item) => item.status === "em_reparo").length,
      icon: "⌘",
      tone: "green",
      note: "Serviços em execução",
    },
    {
      name: "Prontos para retirada",
      value: os.data.filter((item) => item.status === "pronto_retirada").length,
      icon: "✓",
      tone: "sky",
      note: "Aguardando o cliente",
    },
    {
      name: "Faturamento do mês",
      value: money(monthRevenue),
      icon: "▥",
      tone: "green",
      note: "Receitas recebidas",
    },
  ];

  const last14 = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(day + "T12:00:00");
    date.setDate(date.getDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      opened: os.data.filter((item) => dateKey(item.criado_em) === key).length,
      finalized: os.data.filter(
        (item) => item.status === "finalizado" && dateKey(item.atualizado_em) === key,
      ).length,
    };
  });
  const maxTrend = Math.max(
    1,
    ...last14.flatMap((item) => [item.opened, item.finalized]),
  );
  const trendPoints = (key: "opened" | "finalized") =>
    last14
      .map((item, index) => {
        const x = (index / Math.max(1, last14.length - 1)) * 100;
        const y = 88 - (item[key] / maxTrend) * 72;
        return `${x},${y}`;
      })
      .join(" ");

  const statusData = statusGroups.map((group) => ({
    ...group,
    count: os.data.filter((item) =>
      group.statuses.includes(item.status as never),
    ).length,
  }));
  const statusTotal = Math.max(
    1,
    statusData.reduce((sum, item) => sum + item.count, 0),
  );
  let cursor = 0;
  const donut = `conic-gradient(${statusData
    .map((item) => {
      const start = cursor;
      cursor += (item.count / statusTotal) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    })
    .join(",")})`;

  const finished = os.data.filter((item) => item.status === "finalizado").length;
  const completionRate = os.data.length
    ? Math.round((finished / os.data.length) * 100)
    : 0;
  const deadlines = openOrders.filter((item) => item.prazo_previsto);
  const onTime = deadlines.filter(
    (item) => new Date(item.prazo_previsto!) >= new Date(day + "T00:00:00"),
  ).length;
  const onTimeRate = deadlines.length
    ? Math.round((onTime / deadlines.length) * 100)
    : 100;
  const uniqueCustomers = new Set(os.data.map((item) => item.cliente_id)).size;

  const latestOrders = [...os.data]
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, 6);
  const todayAgenda = agenda.data
    .filter((item) => !item.bloqueio && item.inicio.startsWith(day))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 6);
  const priorities = openOrders
    .filter((item) => item.prazo_previsto)
    .sort((a, b) => {
      const priority = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
      return (
        priority[a.prioridade] - priority[b.prioridade] ||
        (a.prazo_previsto || "").localeCompare(b.prazo_previsto || "")
      );
    })
    .slice(0, 6);

  const rows = [os, cs, eq, agenda, fin];
  const error = rows.find((item) => item.error)?.error;
  const loading = rows.some((item) => item.loading);

  return (
    <section className="module dashboard-pro">
      <div className="dashboard-hero">
        <div className="dashboard-heading-wrap">
          <span className="dashboard-welcome">Olá, seja bem-vindo! 👋</span>
          <Heading
            title="Visão geral"
            subtitle="Tudo o que importa da sua assistência técnica, em um só lugar."
            action="+ Nova Ordem"
            href="/painel/ordens/nova"
          />
        </div>
        <div className="dashboard-callout">
          <span className="dashboard-callout-icon">↗</span>
          <div>
            <strong>Mais produtividade para sua assistência</strong>
            <small>Organize. Acompanhe. Evolua.</small>
          </div>
          <span>→</span>
        </div>
      </div>

      <ErrorBox error={error} />

      <div className="dashboard-kpis">
        {metrics.map((metric) => (
          <article key={metric.name} className={"dashboard-kpi " + metric.tone}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-icon">{metric.icon}</span>
              <span>{metric.name}</span>
            </div>
            <div className="dashboard-kpi-value">
              <strong>{loading ? "—" : metric.value}</strong>
              <span className="mini-spark">⌁</span>
            </div>
            <small>{metric.note}</small>
          </article>
        ))}
      </div>

      <div className="dashboard-analytics">
        <section className="dashboard-card dashboard-trend">
          <div className="dashboard-card-head">
            <div>
              <h2>Evolução de ordens de serviço</h2>
              <p>Acompanhe o volume de ordens ao longo do tempo.</p>
            </div>
            <span className="dashboard-filter">Últimos 14 dias</span>
          </div>
          <div className="dashboard-line-chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Evolução das ordens">
              <defs>
                <linearGradient id="orderArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#287cf3" stopOpacity=".28" />
                  <stop offset="100%" stopColor="#287cf3" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 40, 60, 80].map((y) => (
                <line key={y} x1="0" x2="100" y1={y} y2={y} className="dash-grid-line" />
              ))}
              <polygon
                points={"0,88 " + trendPoints("opened") + " 100,88"}
                fill="url(#orderArea)"
              />
              <polyline points={trendPoints("opened")} className="dash-open-line" />
              <polyline points={trendPoints("finalized")} className="dash-final-line" />
            </svg>
            <div className="dashboard-chart-axis">
              {last14.filter((_, index) => index % 3 === 0).map((item) => (
                <span key={item.key}>{item.label}</span>
              ))}
            </div>
            <div className="dashboard-chart-legend">
              <span><i className="open" /> Abertas</span>
              <span><i className="done" /> Finalizadas</span>
            </div>
          </div>
        </section>

        <section className="dashboard-card dashboard-status">
          <div className="dashboard-card-head">
            <div>
              <h2>Status das ordens</h2>
              <p>Distribuição atual das ordens de serviço.</p>
            </div>
          </div>
          <div className="dashboard-status-layout">
            <div className="dashboard-status-donut" style={{ background: donut }}>
              <div>
                <strong>{os.data.length}</strong>
                <small>ordens no total</small>
              </div>
            </div>
            <div className="dashboard-status-legend">
              {statusData.map((item) => (
                <div key={item.key}>
                  <span style={{ background: item.color }} />
                  <b>{item.label}</b>
                  <strong>
                    {Math.round((item.count / statusTotal) * 100)}%
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-card dashboard-performance">
          <div className="dashboard-card-head">
            <div>
              <h2>Desempenho da assistência</h2>
              <p>Indicadores operacionais atuais.</p>
            </div>
          </div>
          <div className="dashboard-performance-list">
            <article>
              <span>◷</span>
              <div><small>Ordens dentro do prazo</small><strong>{onTimeRate}%</strong></div>
            </article>
            <article>
              <span>✓</span>
              <div><small>Taxa de conclusão</small><strong>{completionRate}%</strong></div>
            </article>
            <article>
              <span>♙</span>
              <div><small>Clientes atendidos</small><strong>{uniqueCustomers}</strong></div>
            </article>
          </div>
        </section>
      </div>

      <div className="dashboard-bottom">
        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div><h2>Últimas ordens</h2></div>
            <Link href="/painel/ordens">Ver todas</Link>
          </div>
          {latestOrders.length ? (
            <div className="table-wrap dashboard-table">
              <table>
                <thead>
                  <tr>
                    <th>#OS</th>
                    <th>Cliente</th>
                    <th>Equipamento</th>
                    <th>Status</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {latestOrders.map((order) => (
                    <tr key={order.id}>
                      <td><Link href={"/painel/ordens/" + order.id}>#{order.numero}</Link></td>
                      <td>{cs.data.find((item) => item.id === order.cliente_id)?.nome || "Cliente"}</td>
                      <td>{eq.data.find((item) => item.id === order.equipamento_id)?.modelo || "Equipamento"}</td>
                      <td><Badge status={order.status} /></td>
                      <td>{new Date(order.criado_em).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Nenhuma ordem cadastrada." />
          )}
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div><h2>Agenda de hoje</h2></div>
            <Link href="/painel/agenda">Ver agenda</Link>
          </div>
          <div className="dashboard-agenda-list">
            {todayAgenda.map((appointment) => (
              <Link href="/painel/agenda" key={appointment.id}>
                <strong>{time(appointment.inicio)}</strong>
                <span />
                <div>
                  <b>{appointment.nome_cliente || "Cliente"}</b>
                  <small>{appointment.descricao || "Atendimento"}</small>
                </div>
                <i>→</i>
              </Link>
            ))}
            {!todayAgenda.length && <Empty title="Nenhum atendimento hoje." />}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <div><h2>Prioridades / Mesa de Reparo</h2></div>
            <Link href="/painel/mesa-reparo">Ver todas</Link>
          </div>
          <div className="dashboard-priority-list">
            {priorities.map((order) => (
              <Link href={"/painel/ordens/" + order.id} key={order.id}>
                <strong>#{order.numero}</strong>
                <div>
                  <b>{eq.data.find((item) => item.id === order.equipamento_id)?.modelo || "Equipamento"}</b>
                  <small>{cs.data.find((item) => item.id === order.cliente_id)?.nome || "Cliente"}</small>
                </div>
                <span className={"priority-chip " + order.prioridade}>{order.prioridade}</span>
                <em>
                  {order.prazo_previsto
                    ? Math.max(
                        0,
                        Math.ceil(
                          (new Date(order.prazo_previsto).getTime() -
                            new Date(day + "T00:00:00").getTime()) /
                            86400000,
                        ),
                      ) + " d"
                    : "—"}
                </em>
              </Link>
            ))}
            {!priorities.length && <Empty title="Nenhuma prioridade pendente." />}
          </div>
        </section>
      </div>
    </section>
  );
}
