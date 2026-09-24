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
                <section className="panel">
                  <h2>Resumo do atendimento</h2>
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

                  <h3>Problema relatado pelo cliente</h3>
                  <p className="prose">{order.problema}</p>

                  <h3>Estado do equipamento</h3>
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
