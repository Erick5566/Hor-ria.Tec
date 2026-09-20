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
import { Heading, Empty, ErrorBox } from "@/components/ui";
export default function Quotes() {
  const qs = useRows<Orcamento>("orcamentos"),
    os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes");
  return (
    <section className="module unified-pro quotes-pro">
      <Heading
        title="Orçamentos"
        subtitle="Propostas e decisões dos seus clientes."
      />
      <ErrorBox error={qs.error || os.error || cs.error} />
      <section className="panel quotes-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>OS</th>
                <th>Cliente</th>
                <th>Versão</th>
                <th>Total</th>
                <th>Validade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(latestQuotes(qs.data)).map((q) => {
                const o = os.data.find((o) => o.id === q.ordem_id);
                return (
                  <tr key={q.id}>
                    <td>
                      <Link href={`/painel/ordens/${q.ordem_id}`}>
                        #{o?.numero}
                      </Link>
                    </td>
                    <td>{cs.data.find((c) => c.id === o?.cliente_id)?.nome}</td>
                    <td>{q.versao}</td>
                    <td>{money(q.total)}</td>
                    <td>
                      {q.validade.slice(0, 10).split("-").reverse().join("/")}
                    </td>
                    <td>{q.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!qs.data.length && (
          <Empty
            title="Nenhum orçamento criado."
            text="Abra uma ordem para elaborar uma proposta."
          />
        )}
      </section>
    </section>
  );
}
