"use client";
import Link from "next/link";
import {
  useRows,
  Orcamento,
  Ordem,
  Cliente,
  money,
  latestQuotes,
} from "@/lib/assistencia";
import {
  Heading,
  Empty,
  ErrorBox,
  MetricCard,
  MetricGrid,
} from "@/components/ui";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    rasccunho: "Rascunho",
    rascunho: "Rascunho",
    enviado: "Enviado",
    aprovado: "Aprovado",
    recusado: "Recusado",
    alteracao_solicitada: "Alteração solicitada",
  };
  return labels[status] || status.replaceAll("_", " ");
}

export default function Quotes() {
  const qs = useRows<Orcamento>("orcamentos"),
    os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes");

  const latest = Object.values(latestQuotes(qs.data));
  const approved = latest.filter((item) => item.status === "aprovado");
  const sent = latest.filter((item) => item.status === "enviado");
  const pending = latest.filter((item) =>
    ["enviado", "alteracao_solicitada"].includes(item.status),
  );
  const totalApproved = approved.reduce((sum, item) => sum + Number(item.total), 0);

  const metrics = [
    {
      name: "Orçamentos ativos",
      value: latest.length,
      icon: "▧",
      tone: "blue",
      note: "Última versão de cada OS",
    },
    {
      name: "Aguardando resposta",
      value: pending.length,
      icon: "◷",
      tone: "amber",
      note: "Pendentes de decisão",
    },
    {
      name: "Aprovados",
      value: approved.length,
      icon: "✓",
      tone: "green",
      note: "Liberados para execução",
    },
    {
      name: "Valor aprovado",
      value: money(totalApproved),
      icon: "▥",
      tone: "purple",
      note: "Potencial confirmado",
    },
  ];

  return (
    <section className="module dashboard-pro quotes-dashboard">
      <div className="dashboard-hero">
        <Heading
          title="Orçamentos"
          subtitle="Acompanhe propostas, decisões e valores aprovados."
        />
        <div className="dashboard-callout">
          <span className="dashboard-callout-icon">▧</span>
          <div>
            <strong>Orçamentos mais claros, decisões mais rápidas</strong>
            <small>Veja o que está pendente e o que já virou serviço.</small>
          </div>
          <span>→</span>
        </div>
      </div>

      <ErrorBox error={qs.error || os.error || cs.error} />

      <MetricGrid columns={4} className="quotes-kpis">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.name}
            label={metric.name}
            value={metric.value}
            note={metric.note}
            icon={metric.icon}
            tone={metric.tone as "blue" | "amber" | "green" | "purple"}
            active={metric.name !== "Aguardando resposta" || pending.length > 0}
          />
        ))}
      </MetricGrid>

      <div className="quotes-layout">
        <section className="dashboard-card quotes-main-card">
          <div className="dashboard-card-head">
            <div>
              <h2>Últimos orçamentos</h2>
              <p>{latest.length} propostas acompanhadas.</p>
            </div>
            <Link href="/painel/ordens">Abrir ordens →</Link>
          </div>

          {latest.length ? (
            <div className="table-wrap dashboard-table quotes-table">
              <table>
                <thead>
                  <tr>
                    <th>OS</th>
                    <th>Cliente</th>
                    <th>Versão</th>
                    <th>Total</th>
                    <th>Validade</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {latest
                    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
                    .map((quote) => {
                      const order = os.data.find((item) => item.id === quote.ordem_id);
                      const customer = cs.data.find((item) => item.id === order?.cliente_id);
                      return (
                        <tr key={quote.id}>
                          <td>
                            <Link className="quote-os" href={`/painel/ordens/${quote.ordem_id}`}>
                              #{order?.numero || "—"}
                            </Link>
                          </td>
                          <td>{customer?.nome || "Cliente"}</td>
                          <td>v{quote.versao}</td>
                          <td><strong>{money(quote.total)}</strong></td>
                          <td>{quote.validade.slice(0, 10).split("-").reverse().join("/")}</td>
                          <td>
                            <span className={`quote-status ${quote.status}`}>
                              {statusLabel(quote.status)}
                            </span>
                          </td>
                          <td>
                            <Link className="quotes-open" href={`/painel/ordens/${quote.ordem_id}`}>
                              Abrir →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Nenhum orçamento criado."
              text="Abra uma ordem para elaborar uma proposta."
            />
          )}
        </section>

        <aside className="dashboard-card quotes-side-card">
          <div className="dashboard-card-head">
            <div>
              <h2>Resumo das decisões</h2>
              <p>Situação das propostas mais recentes.</p>
            </div>
          </div>
          <div className="quotes-status-list">
            {[
              ["Aguardando resposta", sent.length, "blue"],
              ["Aprovados", approved.length, "green"],
              ["Recusados", latest.filter((item) => item.status === "recusado").length, "red"],
              ["Alteração solicitada", latest.filter((item) => item.status === "alteracao_solicitada").length, "amber"],
            ].map(([label, value, tone]) => (
              <div key={String(label)}>
                <span className={String(tone)} />
                <b>{label}</b>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
