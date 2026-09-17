"use client";
import { Orcamento, Status, money, stamp, statuses } from "@/lib/assistencia";

export type Repair = {
  numero: number;
  empresa: string;
  status: Status;
  previsao: string | null;
  problema?: string;
  equipamento: { categoria: string; marca: string; modelo: string };
  orcamento: Orcamento | null;
  historico: { evento: string; data: string; status: Status | null }[];
};

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
  const repairStarted = ![
    "novo",
    "finalizado",
    "cancelado",
  ].includes(data.status);
  const customerStatus = waitingForTeam
    ? "Aguardando aceite da equipe"
    : repairStarted
      ? "Reparo iniciado"
      : data.status === "finalizado"
        ? "Reparo finalizado"
        : "Atendimento cancelado";
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
          <strong className={`badge ${data.status}`}>{customerStatus}</strong>
          {!waitingForTeam && !["finalizado", "cancelado"].includes(data.status) && (
            <small>Etapa atual: {statuses[data.status]}</small>
          )}
        </div>
        <p><strong>Previsão:</strong> {forecast}</p>
      </section>
      {data.orcamento && (
        <section className="panel">
          <h2>Orçamento · versão {data.orcamento.versao}</h2>
          {[...data.orcamento.servicos, ...data.orcamento.pecas].map(
            (item, index) => (
              <div className="list-line" key={index}>
                <span>
                  {item.quantidade} × {item.nome}
                </span>
                <strong>{money(item.quantidade * item.valor)}</strong>
              </div>
            ),
          )}
          <p>
            Mão de obra: {money(data.orcamento.mao_obra)} · Desconto:{" "}
            {money(data.orcamento.desconto)}
          </p>
          <div className="total-line">Total: {money(data.orcamento.total)}</div>
          <p>
            Validade:{" "}
            {data.orcamento.validade
              .slice(0, 10)
              .split("-")
              .reverse()
              .join("/")}{" "}
            · {data.orcamento.status}
          </p>
          {data.orcamento.status === "enviado" && (
            <>
              <label>
                Observação (opcional)
                <textarea
                  maxLength={1000}
                  value={note}
                  onChange={(event) => onNote(event.target.value)}
                />
              </label>
              <div className="inline-actions">
                {[
                  ["aprovado", "Aprovar orçamento"],
                  ["recusado", "Recusar"],
                  ["alteracao_solicitada", "Solicitar alteração"],
                ].map(([value, label]) => (
                  <button
                    disabled={busy}
                    key={value}
                    onClick={() => onRespond(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
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
