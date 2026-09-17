"use client";
import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase, message } from "@/lib/supabase";
import {
  Ordem,
  Cliente,
  Equipamento,
  statuses,
  Status,
  stamp,
} from "@/lib/assistencia";
import { Heading, Badge, ErrorBox, Empty } from "@/components/ui";
import { PhotosPanel } from "@/components/photos";
import Diagnosis from "@/components/diagnosis";
import Quote from "@/components/quote";
import History from "@/components/history";
import Finance from "@/components/finance";
import OrderAdministration from "@/components/order-administration";
import Warranty from "@/components/warranty";
export default function OrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<Ordem | null>(null),
    [tab, setTab] = useState("Resumo"),
    [client, setClient] = useState<Cliente | null>(null),
    [equipment, setEquipment] = useState<Equipamento | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase!
        .from("ordens_servico")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      setOrder(data);
      const [c, e] = await Promise.all([
        supabase!
          .from("clientes")
          .select("*")
          .eq("id", data.cliente_id)
          .single(),
        supabase!
          .from("equipamentos")
          .select("*")
          .eq("id", data.equipamento_id)
          .single(),
      ]);
      if (c.error || e.error) throw c.error || e.error;
      setClient(c.data);
      setEquipment(e.data);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  async function updateStatus(value: Status) {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!
        .from("ordens_servico")
        .update({ status: value })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      await load();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="module">
      <Link className="subtle" href="/painel/ordens">
        ← Ordens de serviço
      </Link>
      <Heading
        title={order ? `OS #${order.numero}` : "Ordem de serviço"}
        subtitle={
          equipment
            ? `${equipment.marca} ${equipment.modelo} · ${client?.nome}`
            : undefined
        }
      />
      <ErrorBox error={error} />
      {loading ? (
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
                onChange={(e) => updateStatus(e.target.value as Status)}
              >
                {Object.entries(statuses).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="tabs">
              {[
                "Resumo",
                "Diagnóstico",
                "Orçamento",
                "Fotos",
                "Histórico",
                "Financeiro",
                "Garantia",
              ].map((t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "Financeiro" && <Finance ordemId={id} />}
            {tab === "Garantia" && <Warranty ordemId={id} />}
            {tab === "Histórico" && <History ordemId={id} />}
            {tab === "Orçamento" && (
              <Quote
                ordemId={id}
                trackingToken={order.token_acompanhamento}
                telefone={client?.whatsapp || ""}
                onChanged={load}
              />
            )}
            {tab === "Diagnóstico" && (
              <Diagnosis ordemId={id} empresaId={order.empresa_id} />
            )}
            {!order.entrada_confirmada && (
              <div className="notice">
                Entrada em conferência.{" "}
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await supabase!.rpc("confirmar_entrada", {
                      p_ordem: id,
                    });
                    if (r.error) setError(message(r.error));
                    else await load();
                    setBusy(false);
                  }}
                >
                  Confirmar entrada
                </button>
              </div>
            )}
            {tab === "Fotos" && (
              <PhotosPanel ordemId={id} empresaId={order.empresa_id} />
            )}
            {tab === "Resumo" && (
              <>
                <OrderAdministration order={order} onChanged={load} />
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
