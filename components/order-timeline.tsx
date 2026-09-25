"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Historico,
  type Status,
  statuses,
  stamp,
} from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import { ErrorBox, PanelTitle } from "./ui";

type TimelineStep = {
  key: string;
  label: string;
  description: string;
  statuses: Status[];
  eventNames?: string[];
};

const steps: TimelineStep[] = [
  {
    key: "received",
    label: "Recebido",
    description: "Equipamento recebido e OS aberta.",
    statuses: ["novo", "recebido"],
  },
  {
    key: "diagnosis",
    label: "Diagnóstico",
    description: "Análise técnica e identificação do problema.",
    statuses: ["em_diagnostico", "aguardando_orcamento"],
    eventNames: ["Diagnóstico atualizado"],
  },
  {
    key: "quote",
    label: "Orçamento enviado",
    description: "Proposta enviada para decisão do cliente.",
    statuses: ["orcamento_enviado", "aguardando_aprovacao"],
    eventNames: ["Orçamento enviado"],
  },
  {
    key: "approved",
    label: "Aprovado",
    description: "Cliente aprovou o orçamento.",
    statuses: ["orcamento_aprovado"],
    eventNames: ["Orçamento aprovado"],
  },
  {
    key: "repair",
    label: "Reparo",
    description: "Serviço em execução ou aguardando peça.",
    statuses: ["em_reparo", "aguardando_peca"],
  },
  {
    key: "tests",
    label: "Testes",
    description: "Validação final do reparo.",
    statuses: ["em_testes"],
  },
  {
    key: "ready",
    label: "Pronto",
    description: "Equipamento liberado para retirada.",
    statuses: ["pronto_retirada"],
  },
  {
    key: "delivered",
    label: "Entregue",
    description: "Atendimento finalizado.",
    statuses: ["finalizado"],
  },
];

const stageByStatus: Record<Status, number> = {
  novo: 0,
  recebido: 0,
  em_diagnostico: 1,
  aguardando_orcamento: 1,
  orcamento_enviado: 2,
  aguardando_aprovacao: 2,
  orcamento_aprovado: 3,
  em_reparo: 4,
  aguardando_peca: 4,
  em_testes: 5,
  pronto_retirada: 6,
  finalizado: 7,
  cancelado: -1,
};

function earliest(rows: Historico[], test: (row: Historico) => boolean) {
  return [...rows]
    .filter(test)
    .sort(
      (a, b) =>
        new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime(),
    )[0]?.criado_em;
}

function stepDate(
  step: TimelineStep,
  rows: Historico[],
  orderCreatedAt: string,
) {
  if (step.key === "received") return orderCreatedAt;

  return earliest(rows, (row) => {
    const byEvent = step.eventNames?.includes(row.evento) || false;
    const byStatus =
      row.evento === "Status alterado" &&
      step.statuses.includes(row.detalhes as Status);
    return byEvent || byStatus;
  });
}

export default function OrderTimeline({
  orderId,
  status,
  createdAt,
}: {
  orderId: string;
  status: Status;
  createdAt: string;
}) {
  const [rows, setRows] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabase!
        .from("historico_os")
        .select("id,ordem_id,evento,detalhes,publico,criado_em,autor,usuario_id")
        .eq("ordem_id", orderId)
        .order("criado_em", { ascending: true })
        .limit(200);
      if (result.error) throw result.error;
      setRows((result.data || []) as Historico[]);
      setError("");
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load, status]);

  const currentStage = stageByStatus[status];

  const mapped = useMemo(
    () =>
      steps.map((step, index) => {
        const reached =
          currentStage >= index ||
          Boolean(stepDate(step, rows, createdAt));
        const active = currentStage === index && status !== "finalizado";
        const completed =
          status === "finalizado" ||
          currentStage > index ||
          (Boolean(stepDate(step, rows, createdAt)) && !active);
        return {
          ...step,
          index,
          date: stepDate(step, rows, createdAt),
          reached,
          active,
          completed,
        };
      }),
    [createdAt, currentStage, rows, status],
  );

  return (
    <section className="panel order-flow-timeline">
      <div className="order-flow-heading">
        <div>
          <span>ANDAMENTO DA OS</span>
          <PanelTitle title="Timeline do atendimento" icon="trend" />
          <p>
            Visualize rapidamente onde o aparelho está e as etapas já concluídas.
          </p>
        </div>
        <span
          className={
            "order-flow-current " +
            (status === "cancelado" ? "is-cancelled" : "")
          }
        >
          {statuses[status]}
        </span>
      </div>

      <ErrorBox error={error} />

      {status === "cancelado" && (
        <div className="order-flow-cancelled">
          Esta OS foi cancelada. O histórico completo continua disponível na aba
          Histórico.
        </div>
      )}

      <ol className="order-flow-steps" aria-label="Etapas da ordem de serviço">
        {mapped.map((step) => (
          <li
            key={step.key}
            className={[
              step.completed ? "is-complete" : "",
              step.active ? "is-active" : "",
              step.reached ? "is-reached" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="order-flow-marker" aria-hidden="true">
              {step.completed ? "✓" : step.index + 1}
            </span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.description}</p>
              <small>
                {step.date
                  ? stamp(step.date)
                  : loading && step.active
                    ? "Atualizando…"
                    : step.active
                      ? "Etapa atual"
                      : "Ainda não iniciada"}
              </small>
            </div>
          </li>
        ))}
      </ol>

      <div className="order-flow-footer">
        <span>Histórico baseado nos registros reais da OS.</span>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar timeline"}
        </button>
      </div>
    </section>
  );
}
