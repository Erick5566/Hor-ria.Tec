"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useRows, Ordem, Cliente } from "@/lib/assistencia";
import { supabase, message, Servico, today } from "@/lib/supabase";
import { ErrorBox } from "./ui";
export default function AppointmentForm({ done }: { done: () => void }) {
  const { empresa } = useWorkspace(),
    orders = useRows<Ordem>("ordens_servico"),
    clients = useRows<Cliente>("clientes"),
    services = useRows<Servico>("servicos");
  const [order, setOrder] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = clients.data.find(
    (c) => c.id === orders.data.find((o) => o.id === order)?.cliente_id,
  );
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        const r = await supabase!.from("agendamentos").insert({
          empresa_id: empresa.id,
          servico_id: f.get("servico"),
          ordem_id: order || null,
          finalidade: f.get("finalidade"),
          nome_cliente: client?.nome || f.get("nome"),
          telefone: client?.whatsapp || f.get("telefone"),
          inicio: `${f.get("dia")}T${f.get("hora")}:00-03:00`,
          descricao: f.get("descricao"),
          endereco: f.get("endereco") || null,
        });
        setBusy(false);
        if (r.error) setError(message(r.error));
        else done();
      }}
    >
      <h2>Novo atendimento</h2>
      <ErrorBox
        error={error || orders.error || clients.error || services.error}
      />
      <div className="form-grid">
        <label>
          Ordem de serviço (opcional)
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="">Sem vínculo</option>
            {orders.data
              .filter((o) => !["finalizado", "cancelado"].includes(o.status))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  OS #{o.numero} ·{" "}
                  {clients.data.find((c) => c.id === o.cliente_id)?.nome}
                </option>
              ))}
          </select>
        </label>
        <label>
          Finalidade
          <select name="finalidade">
            {[
              "Recebimento",
              "Diagnóstico",
              "Retirada",
              "Visita técnica",
              "Atendimento agendado",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {!client && (
          <>
            <label>
              Nome
              <input name="nome" required minLength={2} />
            </label>
            <label>
              WhatsApp
              <input
                name="telefone"
                type="tel"
                required
                pattern="[0-9]{10,15}"
                placeholder="DDD e número, apenas dígitos"
              />
            </label>
          </>
        )}
        <label>
          Serviço
          <select name="servico" required>
            <option value="">Selecione</option>
            {services.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome} · {s.duracao} min
              </option>
            ))}
          </select>
        </label>
        <label>
          Dia
          <input name="dia" type="date" min={today()} required />
        </label>
        <label>
          Horário
          <input name="hora" type="time" step={900} required />
        </label>
        {empresa.solicitar_endereco && (
          <label>
            Endereço
            <input name="endereco" required minLength={5} maxLength={300} />
          </label>
        )}
        <label>
          Observações
          <input name="descricao" maxLength={500} />
        </label>
      </div>
      <p>O sistema verifica o expediente e impede horários sobrepostos.</p>
      <button className="primary" disabled={busy}>
        {busy ? "Salvando…" : "Agendar atendimento"}
      </button>
    </form>
  );
}
