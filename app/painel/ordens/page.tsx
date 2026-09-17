"use client";
import { useState } from "react";
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
export default function Orders() {
  const os = useRows<Ordem>("ordens_servico"),
    cs = useRows<Cliente>("clientes"),
    eq = useRows<Equipamento>("equipamentos"),
    qs = useRows<Orcamento>("orcamentos");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const quotes = latestQuotes(qs.data);
  const list = [...os.data]
    .filter(
      (o) =>
        (!status || o.status === status) &&
        `${o.numero} ${cs.data.find((c) => c.id === o.cliente_id)?.nome} ${eq.data.find((e) => e.id === o.equipamento_id)?.modelo} ${o.problema}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.numero - a.numero);
  return (
    <section className="module">
      <Heading
        title="Ordens de serviço"
        subtitle="Cada equipamento, cada etapa, sob controle."
        action="+ Nova ordem"
        href="/painel/ordens/nova"
      />
      <ErrorBox error={os.error || cs.error || eq.error || qs.error} />
      <section className="panel">
        <div className="toolbar">
          <input
            aria-label="Buscar ordens"
            placeholder="Buscar OS, cliente, equipamento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Filtrar status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {Object.entries(statuses).map(([v, n]) => (
              <option value={v} key={v}>
                {n}
              </option>
            ))}
          </select>
          <span className="subtle">{list.length} ordens</span>
        </div>
        {os.loading ? (
          <Empty title="Carregando ordens…" />
        ) : !list.length ? (
          <Empty
            title="Nenhuma ordem encontrada."
            text="Abra uma ordem para iniciar o atendimento."
          />
        ) : (
          <>
            <div className="table-wrap desktop-table">
              <table>
                <thead>
                  <tr>
                    {[
                      "OS",
                      "Cliente",
                      "Equipamento",
                      "Problema",
                      "Entrada",
                      "Valor",
                      "Técnico",
                      "Status",
                      "Ações",
                    ].map((t) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id}>
                      <td>#{o.numero}</td>
                      <td>
                        {cs.data.find((c) => c.id === o.cliente_id)?.nome}
                      </td>
                      <td>
                        {eq.data.find((e) => e.id === o.equipamento_id)?.modelo}
                      </td>
                      <td>{o.problema.slice(0, 70)}</td>
                      <td>{stamp(o.criado_em)}</td>
                      <td>
                        {quotes[o.id] ? money(quotes[o.id].total) : "A orçar"}
                      </td>
                      <td>{o.tecnico || "Não atribuído"}</td>
                      <td>
                        <Badge status={o.status} />
                        {!o.entrada_confirmada && (
                          <small>Entrada em conferência</small>
                        )}
                      </td>
                      <td>
                        <Link href={`/painel/ordens/${o.id}`}>Abrir →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-cards">
              {list.map((o) => (
                <Link
                  className="mobile-order"
                  href={`/painel/ordens/${o.id}`}
                  key={o.id}
                >
                  <div>
                    <strong>OS #{o.numero}</strong>
                    <Badge status={o.status} />
                  </div>
                  <p>
                    {cs.data.find((c) => c.id === o.cliente_id)?.nome} ·{" "}
                    {eq.data.find((e) => e.id === o.equipamento_id)?.modelo}
                  </p>
                  <p>{o.problema}</p>
                  <small>
                    {stamp(o.criado_em)} ·{" "}
                    {quotes[o.id] ? money(quotes[o.id].total) : "A orçar"}
                  </small>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
