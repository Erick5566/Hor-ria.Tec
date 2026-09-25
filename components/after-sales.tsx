"use client";
import { useState } from "react";
import { Cliente, PosVenda, useRows } from "@/lib/assistencia";
import { message, supabase, today } from "@/lib/supabase";
import { Empty, ErrorBox, MetricCard, MetricGrid, PanelTitle } from "./ui";
import { useWorkspace } from "./workspace";

const labels = {
  reparo: "Reparo finalizado",
  venda: "Compra na loja",
  seminovo: "Compra de seminovo",
};
export default function AfterSales() {
  const { empresa } = useWorkspace();
  const followups = useRows<PosVenda>("pos_venda"),
    customers = useRows<Cliente>("clientes");
  const [error, setError] = useState("");
  const items = followups.data
    .slice()
    .sort((a, b) => a.disponivel_em.localeCompare(b.disponivel_em));
  async function update(id: string, status: PosVenda["status"]) {
    const result = await supabase!
      .from("pos_venda")
      .update({
        status,
        contatado_em: status === "contatado" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (result.error) setError(message(result.error));
    else await followups.reload();
  }
  return (
    <>
      <ErrorBox error={error || followups.error || customers.error} />
      <MetricGrid columns={3}>
        <MetricCard
          label="Disponíveis hoje"
          value={
            items.filter(
              (x) => x.status === "pendente" && x.disponivel_em <= today(),
            ).length
          }
          note="Contatos que já podem ser feitos"
          iconName="alert"
          tone="warning"
          active={
            items.filter(
              (x) => x.status === "pendente" && x.disponivel_em <= today(),
            ).length > 0
          }
          emphasizeValue
        />
        <MetricCard
          label="Pendentes futuros"
          value={
            items.filter(
              (x) => x.status === "pendente" && x.disponivel_em > today(),
            ).length
          }
          note="Programados para os próximos dias"
          iconName="clock"
          tone="purple"
        />
        <MetricCard
          label="Contatados"
          value={items.filter((x) => x.status === "contatado").length}
          note="Clientes já acionados"
          iconName="check"
          tone="success"
        />
      </MetricGrid>
      <section className="panel">
        <PanelTitle title="Relacionamento após o atendimento" icon="clients" />
        <p>
          O contato é preparado automaticamente sete dias depois de uma OS ou
          venda identificada. O envio continua sob seu controle.
        </p>
        {!items.length ? (
          <Empty
            title="Nenhum contato programado"
            text="Ao finalizar uma OS ou venda identificada, ela aparecerá aqui."
          />
        ) : (
          <div className="after-sales-list">
            {items.map((item) => {
              const customer = customers.data.find(
                (c) => c.id === item.cliente_id,
              );
              const text = `Olá, ${customer?.nome || "tudo bem"}? Aqui é da ${empresa.nome}. Como está sua experiência após o atendimento?${empresa.google_avaliacao_url ? ` Se puder, avalie nosso trabalho: ${empresa.google_avaliacao_url}` : ""}`;
              return (
                <article key={item.id}>
                  <div>
                    <span className={`status ${item.status}`}>
                      {item.status}
                    </span>
                    <h3>{labels[item.tipo]}</h3>
                    <p>
                      {customer?.nome || "Cliente"} · previsto para{" "}
                      {new Date(
                        item.disponivel_em + "T12:00:00",
                      ).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="inline-actions">
                    {customer?.whatsapp && (
                      <a
                        className="primary"
                        href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => void update(item.id, "contatado")}
                      >
                        Abrir WhatsApp ↗
                      </a>
                    )}
                    <select
                      aria-label="Status do pós-venda"
                      value={item.status}
                      onChange={(e) =>
                        update(item.id, e.target.value as PosVenda["status"])
                      }
                    >
                      <option value="pendente">Pendente</option>
                      <option value="contatado">Contatado</option>
                      <option value="concluido">Concluído</option>
                      <option value="dispensado">Dispensado</option>
                    </select>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
