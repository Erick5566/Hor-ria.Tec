"use client";
import { useState } from "react";
import { MesaReparo, Ordem, useRows } from "@/lib/assistencia";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox } from "./ui";
export default function OrderAdministration({
  order,
  onChanged,
}: {
  order: Ordem;
  onChanged: () => void;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState<string | null>(null);
  const benches = useRows<MesaReparo>("mesas_reparo");
  return (
    <section className="panel">
      <h2>Responsável e previsão</h2>
      <ErrorBox error={error} />
      <p role="status">{notice}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          const f = new FormData(e.currentTarget);
          const r = await supabase!
            .from("ordens_servico")
            .update({
              tecnico: f.get("tecnico"),
              previsao: f.get("previsao") || null,
              mesa_id: f.get("mesa") || null,
              prioridade: f.get("prioridade"),
              iniciado_em: f.get("iniciado_em") || null,
              prazo_previsto: f.get("prazo_previsto") || null,
            })
            .eq("id", order.id)
            .select("id")
            .single();
          setBusy(false);
          if (r.error) setError(message(r.error));
          else {
            setNotice("Dados atualizados.");
            onChanged();
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
              defaultValue={order.previsao || ""}
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
              defaultValue={order.iniciado_em?.slice(0, 16) || ""}
            />
          </label>
          <label>
            Prazo operacional
            <input
              name="prazo_previsto"
              type="datetime-local"
              defaultValue={order.prazo_previsto?.slice(0, 16) || ""}
            />
          </label>
        </div>
        <button disabled={busy} className="outline">
          Salvar organização da OS
        </button>
      </form>
      <h3>Acompanhamento do cliente</h3>
      <p>O link individual mostra somente os dados públicos desta ordem.</p>
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
          O cliente também pode consultar com o código e o telefone cadastrados.
        </p>
      </details>
      <h3>Senha do equipamento</h3>
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
          Mostrar senha registrada
        </button>
      ) : (
        <>
          <p>{secret}</p>
          <button onClick={() => setSecret(null)}>Ocultar senha</button>
        </>
      )}
    </section>
  );
}
