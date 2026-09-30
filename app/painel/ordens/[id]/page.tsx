"use client";
import { use, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase, message } from "@/lib/supabase";
import {
  type Ordem,
  statuses,
  type Status,
  stamp,
} from "@/lib/assistencia";
import { Heading, Badge, ErrorBox, Empty } from "@/components/ui";

function TabLoading() {
  return (
    <div className="module-inline-loading" aria-live="polite">
      <span />
      <div>
        <strong>Carregando seção…</strong>
        <small>Buscando apenas os dados desta aba.</small>
      </div>
    </div>
  );
}

const PhotosPanel = dynamic(
  () => import("@/components/photos").then((module) => module.PhotosPanel),
  { loading: TabLoading },
);
const Diagnosis = dynamic(() => import("@/components/diagnosis"), {
  loading: TabLoading,
});
const Quote = dynamic(() => import("@/components/quote"), {
  loading: TabLoading,
});
const History = dynamic(() => import("@/components/history"), {
  loading: TabLoading,
});
const Finance = dynamic(() => import("@/components/finance"), {
  loading: TabLoading,
});
const OrderAdministration = dynamic(
  () => import("@/components/order-administration"),
  { loading: TabLoading },
);
const Warranty = dynamic(() => import("@/components/warranty"), {
  loading: TabLoading,
});
const OrderTimeline = dynamic(() => import("@/components/order-timeline"), {
  loading: TabLoading,
});

type OrderClient = {
  id: string;
  nome: string;
  whatsapp: string;
};

type OrderEquipment = {
  id: string;
  marca: string;
  modelo: string;
  imei: string | null;
};

type OrderDetailData = {
  order: Ordem;
  client: OrderClient;
  equipment: OrderEquipment;
};

const tabs = [
  "Resumo",
  "Diagnóstico",
  "Orçamento",
  "Fotos",
  "Histórico",
  "Financeiro",
  "Garantia",
] as const;

type Tab = (typeof tabs)[number];

export default function OrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<OrderDetailData | null>(null);
  const [tab, setTab] = useState<Tab>("Resumo");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const result = await supabase!.rpc("order_detail_summary", {
          p_order: id,
        });
        if (result.error) throw result.error;
        if (!result.data) throw new Error("Ordem de serviço não encontrada.");
        setData(result.data as OrderDetailData);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function updateStatus(value: Status) {
    setBusy(true);
    setError("");
    try {
      const result = await supabase!
        .from("ordens_servico")
        .update({ status: value })
        .eq("id", id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await load(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  const order = data?.order;
  const client = data?.client;
  const equipment = data?.equipment;

  const whatsappNumber = (client?.whatsapp || "").replace(/\D/g, "");
  const readyWhatsapp =
    whatsappNumber && order
      ? `https://wa.me/${whatsappNumber.length <= 11 ? "55" + whatsappNumber : whatsappNumber}?text=${encodeURIComponent(
          `Olá, ${client?.nome?.split(" ")[0] || "tudo bem"}! Seu equipamento da OS #${order.numero} está pronto para retirada. Podemos combinar a entrega?`,
        )}`
      : "";

  async function advanceStatus(next: Status, nextTab?: Tab) {
    await updateStatus(next);
    if (nextTab) setTab(nextTab);
  }

  return (
    <section className="module unified-pro order-detail-pro">
      <Link className="subtle" href="/painel/ordens">
        ← Ordens de serviço
      </Link>

      <Heading
        title={order ? `OS #${order.numero}` : "Ordem de serviço"}
        subtitle={
          equipment
            ? `${equipment.marca} ${equipment.modelo} · ${client?.nome || ""}`
            : undefined
        }
      />

      <ErrorBox error={error} />

      {loading && !data ? (
        <Empty title="Carregando ordem…" />
      ) : (
        order && (
          <>
            <div className="toolbar">
              <Badge status={order.status} />
              <select
                aria-label="Alterar status da ordem"
                disabled={busy}
                value={order.status}
                onChange={(event) =>
                  void updateStatus(event.target.value as Status)
                }
              >
                {Object.entries(statuses).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <section
              className="panel order-next-action"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: "16px",
              }}
            >
              <div className="order-next-action-copy">
                {["novo", "recebido"].includes(order.status) ? (
                  <strong>PROXIMA AÇAO</strong>
                ) : (
                  <>
                    <span>PRÓXIMA AÇÃO</span>
                    <strong>
                      {order.status === "em_diagnostico" && "Preparar orçamento"}
                      {order.status === "aguardando_orcamento" && "Montar e enviar orçamento"}
                      {["orcamento_enviado", "aguardando_aprovacao"].includes(order.status) && "Aguardar decisão do cliente"}
                      {order.status === "orcamento_aprovado" && "Iniciar reparo"}
                      {order.status === "aguardando_peca" && "Retomar reparo quando a peça chegar"}
                      {order.status === "em_reparo" && "Enviar aparelho para testes"}
                      {order.status === "em_testes" && "Liberar aparelho para retirada"}
                      {order.status === "pronto_retirada" && "Avisar cliente e finalizar entrega"}
                      {order.status === "finalizado" && "Atendimento concluído"}
                      {order.status === "cancelado" && "Ordem cancelada"}
                    </strong>
                    <small>
                      O Horária usa o status atual da OS para destacar a próxima etapa operacional.
                    </small>
                  </>
                )}
              </div>

              <div
                className="inline-actions order-next-action-buttons"
                style={{ justifyContent: "center", width: "100%" }}
              >
                {["novo", "recebido"].includes(order.status) && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void advanceStatus("em_diagnostico", "Diagnóstico")}
                  >
                    Iniciar diagnóstico
                  </button>
                )}

                {order.status === "em_diagnostico" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void advanceStatus("aguardando_orcamento", "Orçamento")}
                  >
                    Preparar orçamento
                  </button>
                )}

                {order.status === "aguardando_orcamento" && (
                  <button className="primary" onClick={() => setTab("Orçamento")}>
                    Abrir orçamento
                  </button>
                )}

                {["orcamento_enviado", "aguardando_aprovacao"].includes(order.status) && (
                  <>
                    <button className="outline" onClick={() => setTab("Orçamento")}>
                      Ver orçamento
                    </button>
                    <a
                      className="outline"
                      href={`/acompanhar/${order.token_acompanhamento}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver como cliente ↗
                    </a>
                  </>
                )}

                {order.status === "orcamento_aprovado" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void advanceStatus("em_reparo", "Resumo")}
                  >
                    Iniciar reparo
                  </button>
                )}

                {order.status === "aguardando_peca" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void advanceStatus("em_reparo", "Resumo")}
                  >
                    Peça chegou · retomar reparo
                  </button>
                )}

                {order.status === "em_reparo" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void advanceStatus("em_testes", "Resumo")}
                  >
                    Enviar para testes
                  </button>
                )}

                {order.status === "em_testes" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void advanceStatus("pronto_retirada", "Resumo")}
                  >
                    ✓ Aparelho pronto
                  </button>
                )}

                {order.status === "pronto_retirada" && (
                  <>
                    {readyWhatsapp && (
                      <a
                        className="outline"
                        href={readyWhatsapp}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Avisar no WhatsApp ↗
                      </a>
                    )}
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void advanceStatus("finalizado", "Resumo")}
                    >
                      Finalizar entrega
                    </button>
                  </>
                )}

                {order.status === "finalizado" && (
                  <a
                    className="outline"
                    href={`/acompanhar/${order.token_acompanhamento}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver acompanhamento final ↗
                  </a>
                )}
              </div>
            </section>

            <div className="tabs">
              {tabs.map((item) => (
                <button
                  key={item}
                  className={tab === item ? "active" : ""}
                  onClick={() => setTab(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            {!order.entrada_confirmada && (
              <div className="notice">
                Entrada em conferência.{" "}
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const result = await supabase!.rpc("confirmar_entrada", {
                      p_ordem: id,
                    });
                    if (result.error) setError(message(result.error));
                    else await load(true);
                    setBusy(false);
                  }}
                >
                  Confirmar entrada
                </button>
              </div>
            )}

            {tab === "Financeiro" && <Finance ordemId={id} />}
            {tab === "Garantia" && <Warranty ordemId={id} />}
            {tab === "Histórico" && <History ordemId={id} />}
            {tab === "Orçamento" && (
              <Quote
                ordemId={id}
                trackingToken={order.token_acompanhamento}
                telefone={client?.whatsapp || ""}
                onChanged={() => void load(true)}
              />
            )}
            {tab === "Diagnóstico" && (
              <Diagnosis ordemId={id} empresaId={order.empresa_id} />
            )}
            {tab === "Fotos" && (
              <PhotosPanel ordemId={id} empresaId={order.empresa_id} />
            )}
            {tab === "Resumo" && (
              <>
                <OrderTimeline
                  orderId={id}
                  status={order.status}
                  createdAt={order.criado_em}
                />
                <OrderAdministration
                  order={order}
                  onChanged={() => void load(true)}
                />
                <section className="panel order-summary-panel">
                  <h2 className="order-section-title">Resumo do atendimento</h2>
                  <dl className="definition-grid">
                    <div>
                      <dt>Cliente</dt>
                      <dd>{client?.nome}</dd>
                    </div>
                    <div>
                      <dt>WhatsApp</dt>
                      <dd>{client?.whatsapp}</dd>
                    </div>
                    <div>
                      <dt>Equipamento</dt>
                      <dd>
                        {equipment?.marca} {equipment?.modelo}
                      </dd>
                    </div>
                    <div>
                      <dt>IMEI</dt>
                      <dd>{equipment?.imei || "Não informado"}</dd>
                    </div>
                    <div>
                      <dt>Entrada</dt>
                      <dd>{stamp(order.criado_em)}</dd>
                    </div>
                    <div>
                      <dt>Técnico</dt>
                      <dd>{order.tecnico || "Não atribuído"}</dd>
                    </div>
                  </dl>

                  <h3 className="order-section-title">Problema relatado pelo cliente</h3>
                  <p className="prose">{order.problema}</p>

                  <h3 className="order-section-title">Estado do equipamento</h3>
                  <p>{order.estado.join(" · ") || "Sem marcas registradas"}</p>
                  <p className="prose">{order.observacoes_estado}</p>
                </section>
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
