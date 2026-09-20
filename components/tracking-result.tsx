"use client";
import { Orcamento, Status, money, stamp, statuses } from "@/lib/assistencia";

type PublicQuote = Orcamento & {
  respondido_em?: string | null;
};

export type Repair = {
  numero: number;
  empresa: string;
  status: Status;
  previsao: string | null;
  problema?: string;
  equipamento: { categoria: string; marca: string; modelo: string };
  orcamento: PublicQuote | null;
  historico: { evento: string; data: string; status: Status | null }[];
};

function customerStatus(status: Status) {
  if (status === "novo") return "Aguardando aceite da equipe";
  if (["recebido", "em_diagnostico", "aguardando_orcamento"].includes(status))
    return "Em análise pela equipe";
  if (["orcamento_enviado", "aguardando_aprovacao"].includes(status))
    return "Aguardando sua aprovação";
  if (status === "orcamento_aprovado") return "Orçamento aprovado";
  if (["em_reparo", "aguardando_peca", "em_testes"].includes(status))
    return "Reparo em andamento";
  if (status === "pronto_retirada") return "Pronto para retirada";
  if (status === "finalizado") return "Reparo finalizado";
  return "Atendimento cancelado";
}

function quoteStatus(status: string) {
  const labels: Record<string, string> = {
    enviado: "Aguardando sua resposta",
    aprovado: "Aprovado",
    recusado: "Recusado",
    alteracao_solicitada: "Alteração solicitada",
  };
  return labels[status] || status.replaceAll("_", " ");
}

export default function TrackingResult({
  data,
  busy,
  note,
  onNote,
  onRespond,
}: {
  data: Repair;
  busy: boolean;
  note: string;
  onNote: (value: string) => void;
  onRespond: (decision: string) => void;
}) {
  const waitingForTeam = data.status === "novo";
  const quote = data.orcamento;
  const serviceSubtotal =
    quote?.servicos.reduce(
      (sum, item) => sum + Number(item.quantidade) * Number(item.valor),
      0,
    ) || 0;
  const partsSubtotal =
    quote?.pecas.reduce(
      (sum, item) => sum + Number(item.quantidade) * Number(item.valor),
      0,
    ) || 0;
  const forecast = data.previsao
    ? data.previsao.split("-").reverse().join("/")
    : waitingForTeam
      ? `Ainda não informada. A solicitação ainda não foi aceita pela equipe da ${data.empresa}.`
      : `A equipe da ${data.empresa} ainda não informou uma data.`;

  return (
    <>
      <section className="panel tracking-hero">
        <div>
          <small>ORDEM DE SERVIÇO</small>
          <h2>
            OS #{data.numero} · {data.empresa}
          </h2>
          <p>
            {data.equipamento.categoria} ·{" "}
            {[data.equipamento.marca, data.equipamento.modelo]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
        <div className="tracking-status-copy">
          <strong className={`badge ${data.status}`}>
            {customerStatus(data.status)}
          </strong>
          {!waitingForTeam && !["finalizado", "cancelado"].includes(data.status) && (
            <small>Etapa atual: {statuses[data.status] || data.status}</small>
          )}
        </div>
        <p>
          <strong>Previsão:</strong> {forecast}
        </p>
      </section>

      {quote && (
        <section className="panel customer-quote-card">
          <div className="customer-quote-head">
            <div>
              <small>PROPOSTA DO SERVIÇO</small>
              <h2>Orçamento detalhado</h2>
              <p>
                Versão {quote.versao} · válido até{" "}
                {quote.validade.slice(0, 10).split("-").reverse().join("/")}
              </p>
            </div>
            <span className={`customer-quote-status ${quote.status}`}>
              {quoteStatus(quote.status)}
            </span>
          </div>

          {quote.servicos.length > 0 && (
            <div className="customer-quote-section">
              <div className="customer-quote-section-head">
                <strong>Serviços</strong>
                <span>{money(serviceSubtotal)}</span>
              </div>
              <div className="customer-quote-lines">
                {quote.servicos.map((item, index) => (
                  <div className="customer-quote-line" key={`service-${index}`}>
                    <div>
                      <strong>{item.nome}</strong>
                      <small>
                        {item.quantidade} × {money(Number(item.valor))} cada
                      </small>
                    </div>
                    <b>{money(Number(item.quantidade) * Number(item.valor))}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          {quote.pecas.length > 0 && (
            <div className="customer-quote-section">
              <div className="customer-quote-section-head">
                <strong>Peças e materiais</strong>
                <span>{money(partsSubtotal)}</span>
              </div>
              <div className="customer-quote-lines">
                {quote.pecas.map((item, index) => (
                  <div className="customer-quote-line" key={`part-${index}`}>
                    <div>
                      <strong>{item.nome}</strong>
                      <small>
                        {item.quantidade} × {money(Number(item.valor))} cada
                      </small>
                    </div>
                    <b>{money(Number(item.quantidade) * Number(item.valor))}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="customer-quote-summary">
            <div>
              <span>Serviços</span>
              <strong>{money(serviceSubtotal)}</strong>
            </div>
            <div>
              <span>Peças e materiais</span>
              <strong>{money(partsSubtotal)}</strong>
            </div>
            <div>
              <span>Mão de obra</span>
              <strong>{money(Number(quote.mao_obra))}</strong>
            </div>
            {Number(quote.desconto) > 0 && (
              <div className="discount">
                <span>Desconto</span>
                <strong>- {money(Number(quote.desconto))}</strong>
              </div>
            )}
            <div className="grand-total">
              <span>Valor total do trabalho</span>
              <strong>{money(Number(quote.total))}</strong>
            </div>
          </div>

          {quote.status === "enviado" ? (
            <div className="customer-quote-decision">
              <div className="customer-quote-guidance">
                <strong>Revise os valores antes de responder.</strong>
                <p>
                  Ao aprovar, a assistência poderá seguir com o serviço conforme
                  este orçamento. Se precisar mudar algum item, descreva abaixo.
                </p>
              </div>
              <label>
                Observação{" "}
                <span className="optional">
                  obrigatória apenas para solicitar alteração
                </span>
                <textarea
                  maxLength={1000}
                  value={note}
                  placeholder="Ex.: gostaria de retirar a troca desta peça ou confirmar outra opção."
                  onChange={(event) => onNote(event.target.value)}
                />
              </label>
              <div className="customer-quote-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => onRespond("aprovado")}
                >
                  ✓ Aprovar {money(Number(quote.total))}
                </button>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() => onRespond("alteracao_solicitada")}
                >
                  Solicitar alteração
                </button>
                <button
                  className="quote-reject"
                  disabled={busy}
                  onClick={() => onRespond("recusado")}
                >
                  Recusar orçamento
                </button>
              </div>
            </div>
          ) : (
            <div className={`customer-quote-response ${quote.status}`}>
              <strong>Resposta registrada: {quoteStatus(quote.status)}</strong>
              {quote.resposta && <p>“{quote.resposta}”</p>}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Andamento do reparo</h2>
        <ol className="tracking-timeline">
          {data.historico.map((item, index) => (
            <li key={index}>
              <span aria-hidden="true" />
              <div>
                <time>{stamp(item.data)}</time>
                <strong>
                  {item.status && statuses[item.status]
                    ? statuses[item.status]
                    : item.evento}
                </strong>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
