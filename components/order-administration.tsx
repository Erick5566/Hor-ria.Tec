"use client";
import { useEffect, useState } from "react";
import { MesaReparo, Ordem, useRows } from "@/lib/assistencia";
import { supabase, message } from "@/lib/supabase";
import {
  localDay,
  localDateTime,
  saveLocalDateTime,
  validateDelivery,
  deliveryState,
  formatDelivery,
} from "@/lib/receipt-dates";
import { ErrorBox, PanelTitle } from "./ui";
export default function OrderAdministration({
  order,
  canViewDeviceSecret,
  onChanged,
}: {
  order: Ordem;
  canViewDeviceSecret: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState<string | null>(null);
  const [delivery, setDelivery] = useState(order.previsao || "");
  useEffect(
    () => setDelivery(order.previsao || ""),
    [order.id, order.previsao],
  );
  const deadlineNotice = deliveryState(delivery || null, order.status);
  const benches = useRows<MesaReparo>("mesas_reparo");
  return (
    <section className="panel order-administration-panel">
      <PanelTitle title="Responsável e previsão" icon="team" />
      <ErrorBox error={error} />
      <p role="status">{notice}</p>
      {delivery && (
        <p className={deadlineNotice ? "delivery-alert" : "hint"} role="status">
          Entrega: {formatDelivery(delivery)}
          {deadlineNotice ? ` — ${deadlineNotice}` : ""}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          const f = new FormData(e.currentTarget);
          try {
            validateDelivery(delivery, order.criado_em);
            const operational = String(f.get("prazo_previsto") || "");
            if (operational)
              validateDelivery(operational.slice(0, 10), order.criado_em);
            const r = await supabase!
              .from("ordens_servico")
              .update({
                tecnico: f.get("tecnico"),
                previsao: delivery || null,
                mesa_id: f.get("mesa") || null,
                prioridade: f.get("prioridade"),
                iniciado_em: saveLocalDateTime(
                  String(f.get("iniciado_em") || ""),
                ),
                prazo_previsto: saveLocalDateTime(operational),
              })
              .eq("id", order.id)
              .select("id")
              .single();
            if (r.error) setError(message(r.error));
            else {
              setNotice("Dados atualizados.");
              onChanged();
            }
          } catch (caught) {
            setError(message(caught as Error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Técnico responsável
            <input
              name="tecnico"
              defaultValue={order.tecnico}
              maxLength={120}
            />
          </label>
          <label>
            Previsão de conclusão
            <input
              name="previsao"
              type="date"
              min={localDay(order.criado_em)}
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
            />
          </label>
          <label>
            Mesa ou bancada
            <select name="mesa" defaultValue={order.mesa_id || ""}>
              <option value="">Sem mesa definida</option>
              {benches.data
                .filter((item) => item.ativo)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Prioridade
            <select
              name="prioridade"
              defaultValue={order.prioridade || "normal"}
            >
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>
          <label>
            Início do reparo
            <input
              name="iniciado_em"
              type="datetime-local"
              defaultValue={localDateTime(order.iniciado_em)}
            />
          </label>
          <label>
            Prazo operacional
            <input
              name="prazo_previsto"
              type="datetime-local"
              defaultValue={localDateTime(order.prazo_previsto)}
            />
          </label>
        </div>
        <button disabled={busy} className="outline">
          Salvar organização da OS
        </button>
      </form>
      <div className="order-tracking-section">
        <div className="order-section-heading">
          <PanelTitle
            title="Acompanhamento do cliente"
            icon="publicPage"
            as="h3"
          />
        </div>

        {canViewDeviceSecret && (
          <div className="order-device-password">
            <PanelTitle title="Senha do aparelho" icon="devices" as="h3" />
            {secret === null ? (
              <button
                onClick={async () => {
                  const r = await supabase!
                    .from("equipamento_segredos")
                    .select("senha")
                    .eq("ordem_id", order.id)
                    .maybeSingle();
                  if (r.error) setError(message(r.error));
                  else setSecret(r.data?.senha || "Não informada");
                }}
              >
                Mostrar senha do aparelho
              </button>
            ) : (
              <div className="order-device-secret">
                <p>
                  <strong>Senha:</strong> {secret}
                </p>
                <button onClick={() => setSecret(null)}>Ocultar senha</button>
              </div>
            )}
          </div>
        )}

        <p className="order-tracking-description">
          O link individual mostra somente os dados públicos desta ordem.
        </p>
        <div className="order-tracking-links">
          <div className="inline-actions">
            <a
              className="outline"
              href={`/acompanhar/${order.token_acompanhamento}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir acompanhamento ↗
            </a>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/acompanhar/${order.token_acompanhamento}`,
                );
                setNotice("Link de acompanhamento copiado.");
              }}
            >
              Copiar link
            </button>
          </div>
          <details>
            <summary>Consulta alternativa</summary>
            <p>
              Código: <strong>{order.codigo_publico}</strong>
            </p>
            <p>
              O cliente também pode consultar com o código e o telefone
              cadastrados.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
