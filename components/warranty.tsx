"use client";
import { useState } from "react";
import { Garantia, stamp, useRows } from "@/lib/assistencia";
import { message, shift, supabase, today } from "@/lib/supabase";
import { Empty, ErrorBox } from "./ui";

export default function Warranty({ ordemId }: { ordemId: string }) {
  const warranties = useRows<Garantia>("garantias");
  const [days, setDays] = useState(90);
  const [customEnd, setCustomEnd] = useState(shift(today(), 90));
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = warranties.data.filter((item) => item.ordem_id === ordemId);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Garantias</h2>
          <p>
            Registre a cobertura entregue ao cliente e preserve o vínculo com a
            OS.
          </p>
        </div>
        <button className="outline" onClick={() => setAdding(!adding)}>
          {adding ? "Fechar" : "+ Registrar garantia"}
        </button>
      </div>
      <ErrorBox error={error || warranties.error} />
      {adding && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(event.currentTarget);
            const start = String(form.get("inicio"));
            const end = days === -1 ? customEnd : shift(start, days);
            const result = await supabase!.rpc("salvar_garantia", {
              p_ordem: ordemId,
              p_descricao: form.get("descricao"),
              p_inicio: start,
              p_fim: end,
              p_observacoes: form.get("observacoes") || null,
              p_ordem_origem: null,
              p_servico: null,
              p_peca_aplicada: null,
            });
            if (result.error) setError(message(result.error));
            else {
              setAdding(false);
              await warranties.reload();
            }
            setBusy(false);
          }}
        >
          <div className="form-grid">
            <label>
              Cobertura
              <input
                name="descricao"
                required
                minLength={2}
                maxLength={300}
                placeholder="Ex.: Tela e serviço de instalação"
              />
            </label>
            <label>
              Início
              <input
                name="inicio"
                type="date"
                required
                defaultValue={today()}
              />
            </label>
            <label>
              Prazo
              <select
                value={days}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setDays(value);
                  if (value !== -1) setCustomEnd(shift(today(), value));
                }}
              >
                <option value={0}>Sem garantia</option>
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>6 meses</option>
                <option value={365}>12 meses</option>
                <option value={-1}>Personalizado</option>
              </select>
            </label>
            {days === -1 && (
              <label>
                Fim
                <input
                  type="date"
                  required
                  min={today()}
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
            )}
          </div>
          <label>
            Observações
            <textarea
              name="observacoes"
              maxLength={1000}
              placeholder="Condições e exceções da cobertura"
            />
          </label>
          <button className="primary" disabled={busy || days === 0}>
            {busy ? "Salvando…" : "Salvar garantia"}
          </button>
          {days === 0 && (
            <p className="hint">
              Selecione um prazo para registrar uma garantia. “Sem garantia” não
              cria registro.
            </p>
          )}
        </form>
      )}
      {!data.length ? (
        <Empty title="Nenhuma garantia registrada" />
      ) : (
        <div className="warranty-list">
          {data.map((item) => (
            <article className="list-line" key={item.id}>
              <div>
                <strong>{item.descricao}</strong>
                <p>
                  {item.inicio.split("-").reverse().join("/")} até{" "}
                  {item.fim.split("-").reverse().join("/")}
                </p>
                <small>
                  {item.observacoes || `Registrada em ${stamp(item.criado_em)}`}
                </small>
              </div>
              <span
                className={`stock-state ${new Date(item.fim + "T23:59:59") >= new Date() && item.status === "ativa" ? "available" : "empty"}`}
              >
                {item.status === "ativa" &&
                new Date(item.fim + "T23:59:59") < new Date()
                  ? "expirada"
                  : item.status}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
