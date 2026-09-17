"use client";
import Link from "next/link";
import {
  useRows,
  Ordem,
  Cliente,
  Equipamento,
  Lancamento,
  Orcamento,
  Peca,
  Venda,
  Seminovo,
  PosVenda,
  money,
  latestQuotes,
} from "@/lib/assistencia";
import { Agendamento, today, time } from "@/lib/supabase";
import { Heading, Empty, Badge, ErrorBox } from "@/components/ui";
export default function Overview() {
  const os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes"),
    eq = useRows<Equipamento>("equipamentos"),
    fin = useRows<Lancamento>("financeiro"),
    quotes = useRows<Orcamento>("orcamentos"),
    agenda = useRows<Agendamento>("agendamentos");
  const stock = useRows<Peca>("pecas");
  const sales = useRows<Venda>("vendas");
  const used = useRows<Seminovo>("seminovos");
  const followups = useRows<PosVenda>("pos_venda");
  const month = today().slice(0, 7);
  const day = today();
  const salesToday = sales.data.filter(
    (sale) => sale.status === "finalizada" && sale.vendido_em.startsWith(day),
  );
  const receitas = fin.data
      .filter(
        (f) =>
          f.status === "pago" &&
          f.tipo === "receita" &&
          f.pago_em?.startsWith(month),
      )
      .reduce((n, f) => n + Number(f.valor), 0),
    despesas = fin.data
      .filter(
        (f) =>
          f.status === "pago" &&
          f.tipo === "despesa" &&
          f.pago_em?.startsWith(month),
      )
      .reduce((n, f) => n + Number(f.valor), 0);
  const metrics: [string, string | number, string][] = [
    [
      "Ordens abertas",
      os.data.filter((o) => !["finalizado", "cancelado"].includes(o.status))
        .length,
      "Em andamento na assistência",
    ],
    [
      "Aguardando diagnóstico",
      os.data.filter((o) =>
        ["novo", "recebido", "em_diagnostico"].includes(o.status),
      ).length,
      "Novas, recebidas ou em análise",
    ],
    [
      "Aguardando orçamento",
      os.data.filter((o) =>
        [
          "aguardando_orcamento",
          "orcamento_enviado",
          "aguardando_aprovacao",
        ].includes(o.status),
      ).length,
      "Preparação, envio ou aprovação",
    ],
    [
      "Em reparo",
      os.data.filter((o) => o.status === "em_reparo").length,
      "Serviços em execução",
    ],
    [
      "Prontos para retirada",
      os.data.filter((o) => o.status === "pronto_retirada").length,
      "Equipamentos aguardando o cliente",
    ],
    [
      "Finalizados",
      os.data.filter((o) => o.status === "finalizado").length,
      "Histórico total de entregas",
    ],
    [
      "Faturamento do mês",
      money(receitas),
      `Saldo realizado: ${money(receitas - despesas)}`,
    ],
  ];
  const operation = [
    [
      "Agendamentos hoje",
      agenda.data.filter((a) => a.inicio.startsWith(day) && !a.bloqueio).length,
      "/painel/agenda",
    ],
    [
      "Aguardando peça",
      os.data.filter((o) => o.status === "aguardando_peca").length,
      "/painel/mesa-reparo",
    ],
    [
      "Em testes",
      os.data.filter((o) => o.status === "em_testes").length,
      "/painel/mesa-reparo",
    ],
    [
      "Estoque baixo",
      stock.data.filter(
        (item) => item.ativo && item.quantidade <= item.estoque_minimo,
      ).length,
      "/painel/estoque",
    ],
    ["Vendas hoje", salesToday.length, "/painel/vendas"],
    [
      "Seminovos disponíveis",
      used.data.filter((item) => item.status === "pronto_venda").length,
      "/painel/seminovos",
    ],
    [
      "Pós-venda pendente",
      followups.data.filter(
        (item) => item.status === "pendente" && item.disponivel_em <= day,
      ).length,
      "/painel/pos-venda",
    ],
  ] as const;
  const urgent = os.data
    .filter(
      (item) =>
        item.prazo_previsto &&
        !["finalizado", "cancelado"].includes(item.status),
    )
    .sort((a, b) =>
      (a.prazo_previsto || "").localeCompare(b.prazo_previsto || ""),
    )
    .slice(0, 5);
  const common = Object.entries(
    eq.data.reduce<Record<string, number>>(
      (a, e) => ({ ...a, [e.categoria]: (a[e.categoria] || 0) + 1 }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  const latest = latestQuotes(quotes.data);
  const services: Record<string, number> = {};
  for (const o of os.data.filter((o) => o.status === "finalizado"))
    for (const s of latest[o.id]?.servicos || [])
      services[s.nome] = (services[s.nome] || 0) + s.quantidade;
  const next = agenda.data
    .filter((a) => !a.bloqueio && new Date(a.inicio) > new Date())
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 5);
  const error = [
    os,
    cs,
    eq,
    fin,
    quotes,
    agenda,
    stock,
    sales,
    used,
    followups,
  ].find((x) => x.error)?.error;
  return (
    <section className="module">
      <Heading
        title="Visão geral"
        subtitle="Acompanhe sua assistência técnica em um só lugar."
        action="+ Nova ordem"
        href="/painel/ordens/nova"
      />
      <ErrorBox error={error} />
      <div className="metric-grid dashboard-metrics">
        {metrics.map(([name, value, note]) => (
          <article className="metric" key={name}>
            <span>{name}</span>
            <strong>{os.loading || fin.loading ? "—" : value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <section className="dashboard-operation" aria-label="Resumo da operação">
        {operation.map(([label, value, href]) => (
          <Link href={href} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Abrir →</small>
          </Link>
        ))}
      </section>
      <div className="module-grid">
        <div>
          <section className="panel">
            <div className="panel-head">
              <h2>Últimas ordens</h2>
              <Link href="/painel/ordens">Ver todas →</Link>
            </div>
            {os.data.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>OS</th>
                      <th>Cliente / equipamento</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...os.data]
                      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
                      .slice(0, 6)
                      .map((o) => (
                        <tr key={o.id}>
                          <td>
                            <Link href={`/painel/ordens/${o.id}`}>
                              #{o.numero}
                            </Link>
                          </td>
                          <td>
                            {cs.data.find((c) => c.id === o.cliente_id)?.nome}
                            <small>
                              {
                                eq.data.find((e) => e.id === o.equipamento_id)
                                  ?.modelo
                              }
                            </small>
                          </td>
                          <td>
                            <Badge status={o.status} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="O próximo reparo começa aqui."
                text="Cadastre a primeira ordem para acompanhar cada etapa."
                href="/painel/ordens/nova"
                action="Criar ordem"
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Prioridades e prazos</h2>
              <Link href="/painel/mesa-reparo">Abrir mesa →</Link>
            </div>
            {urgent.map((order) => {
              const customer = cs.data.find(
                (item) => item.id === order.cliente_id,
              );
              const deadline = new Date(order.prazo_previsto!);
              return (
                <Link
                  className="list-line deadline-line"
                  href={`/painel/ordens/${order.id}`}
                  key={order.id}
                >
                  <div>
                    <strong>
                      OS #{order.numero} · {customer?.nome || "Cliente"}
                    </strong>
                    <p>{order.problema}</p>
                  </div>
                  <span
                    className={deadline < new Date() ? "deadline-overdue" : ""}
                  >
                    {deadline.toLocaleDateString("pt-BR")}
                  </span>
                </Link>
              );
            })}
            {!urgent.length && (
              <Empty
                title="Nenhum prazo pendente."
                text="Defina prazos na mesa de reparo para acompanhar prioridades."
              />
            )}
          </section>
          <section className="panel">
            <h2>Próximos atendimentos</h2>
            {next.map((a) => (
              <Link className="list-line" href="/painel/agenda" key={a.id}>
                <div>
                  <strong>{a.nome_cliente}</strong>
                  <p>
                    {new Date(a.inicio).toLocaleDateString("pt-BR")} ·{" "}
                    {time(a.inicio)}
                  </p>
                </div>
                <span>→</span>
              </Link>
            ))}
            {!next.length && <Empty title="Nenhum atendimento futuro." />}
          </section>
        </div>
        <div>
          <section className="panel">
            <h2>Equipamentos mais comuns</h2>
            {common.map(([category, count]) => (
              <div className="list-line" key={category}>
                <div style={{ flex: 1 }}>
                  <strong>{category}</strong>
                  <div className="bar">
                    <span
                      style={{ width: `${(count / eq.data.length) * 100}%` }}
                    />
                  </div>
                </div>
                <strong>{count}</strong>
              </div>
            ))}
            {!common.length && (
              <Empty title="Os equipamentos aparecerão aqui." />
            )}
          </section>
          <section className="panel">
            <h2>Serviços mais realizados</h2>
            {Object.entries(services)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([name, count]) => (
                <div className="list-line" key={name}>
                  <strong>{name}</strong>
                  <span>{count}</span>
                </div>
              ))}
            {!Object.keys(services).length && (
              <Empty title="Nenhum serviço finalizado ainda." />
            )}
          </section>
          <section className="panel">
            <h2>Financeiro do mês</h2>
            <div className="list-line">
              <span>Recebido</span>
              <strong>{money(receitas)}</strong>
            </div>
            <div className="list-line">
              <span>Despesas pagas</span>
              <strong>{money(despesas)}</strong>
            </div>
            <div className="list-line">
              <span>Saldo realizado</span>
              <strong>{money(receitas - despesas)}</strong>
            </div>
            <div className="finance-origin-bars">
              {["reparo", "loja", "seminovo"].map((origin) => {
                const value = fin.data
                  .filter(
                    (item) =>
                      item.tipo === "receita" &&
                      item.status === "pago" &&
                      item.pago_em?.startsWith(month) &&
                      item.origem === origin,
                  )
                  .reduce((sum, item) => sum + Number(item.valor), 0);
                return (
                  <div key={origin}>
                    <span>{origin}</span>
                    <div className="bar">
                      <i
                        style={{
                          width: `${receitas ? Math.max(3, (value / receitas) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{money(value)}</strong>
                  </div>
                );
              })}
            </div>
            <Link className="outline" href="/painel/financeiro">
              Abrir financeiro →
            </Link>
          </section>
        </div>
      </div>
    </section>
  );
}
