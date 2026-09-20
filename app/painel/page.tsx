"use client";
import Link from "next/link";
import {
  useRows,
  Ordem,
  Cliente,
  Equipamento,
  Orcamento,
  latestQuotes,
} from "@/lib/assistencia";
import { Agendamento, today, time } from "@/lib/supabase";
import { Heading, Empty, Badge, ErrorBox } from "@/components/ui";

export default function Overview() {
  const os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes"),
    eq = useRows<Equipamento>("equipamentos"),
    quotes = useRows<Orcamento>("orcamentos"),
    agenda = useRows<Agendamento>("agendamentos");
  const day = today();

  const metrics: [string, number, string][] = [
    [
      "Ordens abertas",
      os.data.filter((o) => !["finalizado", "cancelado"].includes(o.status)).length,
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
        ["aguardando_orcamento", "orcamento_enviado", "aguardando_aprovacao"].includes(
          o.status,
        ),
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
      (acc, item) => ({
        ...acc,
        [item.categoria]: (acc[item.categoria] || 0) + 1,
      }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);

  const latest = latestQuotes(quotes.data);
  const services: Record<string, number> = {};
  for (const order of os.data.filter((item) => item.status === "finalizado"))
    for (const service of latest[order.id]?.servicos || [])
      services[service.nome] = (services[service.nome] || 0) + service.quantidade;

  const next = agenda.data
    .filter((item) => !item.bloqueio && new Date(item.inicio) > new Date())
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 5);

  const rows = [os, cs, eq, quotes, agenda];
  const error = rows.find((item) => item.error)?.error;
  const loading = rows.some((item) => item.loading);

  return (
    <section className="module">
      <Heading
        title="Visão geral"
        subtitle="Acompanhe o essencial da sua assistência técnica em um só lugar."
        action="+ Nova ordem"
        href="/painel/ordens/nova"
      />
      <ErrorBox error={error} />

      <div className="metric-grid dashboard-metrics">
        {metrics.map(([name, value, note]) => (
          <article className="metric" key={name}>
            <span>{name}</span>
            <strong>{loading ? "—" : value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>

      <section className="dashboard-operation" aria-label="Resumo da operação">
        {operation.map(([label, value, href]) => (
          <Link href={href} key={label}>
            <span>{label}</span>
            <strong>{loading ? "—" : value}</strong>
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
                      .map((order) => (
                        <tr key={order.id}>
                          <td>
                            <Link href={"/painel/ordens/" + order.id}>
                              #{order.numero}
                            </Link>
                          </td>
                          <td>
                            {cs.data.find((item) => item.id === order.cliente_id)?.nome ||
                              "Cliente"}
                            <small>
                              {eq.data.find((item) => item.id === order.equipamento_id)
                                ?.modelo || "Equipamento"}
                            </small>
                          </td>
                          <td>
                            <Badge status={order.status} />
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
              const customer = cs.data.find((item) => item.id === order.cliente_id);
              const deadline = new Date(order.prazo_previsto!);
              return (
                <Link
                  className="list-line deadline-line"
                  href={"/painel/ordens/" + order.id}
                  key={order.id}
                >
                  <div>
                    <strong>
                      OS #{order.numero} · {customer?.nome || "Cliente"}
                    </strong>
                    <p>{order.problema}</p>
                  </div>
                  <span className={deadline < new Date() ? "deadline-overdue" : ""}>
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
        </div>

        <div>
          <section className="panel">
            <h2>Próximos atendimentos</h2>
            {next.map((appointment) => (
              <Link className="list-line" href="/painel/agenda" key={appointment.id}>
                <div>
                  <strong>{appointment.nome_cliente}</strong>
                  <p>
                    {new Date(appointment.inicio).toLocaleDateString("pt-BR")} ·{" "}
                    {time(appointment.inicio)}
                  </p>
                </div>
                <span>→</span>
              </Link>
            ))}
            {!next.length && <Empty title="Nenhum atendimento futuro." />}
          </section>

          <section className="panel">
            <h2>Equipamentos mais comuns</h2>
            {common.map(([category, count]) => (
              <div className="list-line" key={category}>
                <div style={{ flex: 1 }}>
                  <strong>{category}</strong>
                  <div className="bar">
                    <span
                      style={{
                        width: eq.data.length
                          ? (count / eq.data.length) * 100 + "%"
                          : "0%",
                      }}
                    />
                  </div>
                </div>
                <strong>{count}</strong>
              </div>
            ))}
            {!common.length && <Empty title="Os equipamentos aparecerão aqui." />}
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
        </div>
      </div>
    </section>
  );
}
