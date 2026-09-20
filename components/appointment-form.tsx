"use client";
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./workspace";
import { supabase, message, today } from "@/lib/supabase";
import { ErrorBox } from "./ui";

type OrderOption = {
  id: string;
  numero: number;
  cliente_id: string;
  cliente_nome: string;
  cliente_whatsapp: string;
};

type ServiceOption = {
  id: string;
  nome: string;
  duracao: number;
};

type FormOptions = {
  orders: OrderOption[];
  services: ServiceOption[];
};

export default function AppointmentForm({ done }: { done: () => void }) {
  const { empresa } = useWorkspace();
  const [order, setOrder] = useState("");
  const [options, setOptions] = useState<FormOptions>({
    orders: [],
    services: [],
  });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await supabase!.rpc("appointment_form_options");
        if (result.error) throw result.error;
        if (alive) {
          setOptions(result.data as FormOptions);
          setError("");
        }
      } catch (caught) {
        if (alive) setError(message(caught as Error));
      } finally {
        if (alive) setLoadingOptions(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedOrder = useMemo(
    () => options.orders.find((item) => item.id === order),
    [options.orders, order],
  );

  return (
    <form
      className="panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const result = await supabase!.from("agendamentos").insert({
          empresa_id: empresa.id,
          servico_id: form.get("servico"),
          ordem_id: order || null,
          finalidade: form.get("finalidade"),
          nome_cliente: selectedOrder?.cliente_nome || form.get("nome"),
          telefone: selectedOrder?.cliente_whatsapp || form.get("telefone"),
          inicio: `${form.get("dia")}T${form.get("hora")}:00-03:00`,
          descricao: form.get("descricao"),
          endereco: form.get("endereco") || null,
        });
        setBusy(false);
        if (result.error) setError(message(result.error));
        else done();
      }}
    >
      <h2>Novo atendimento</h2>
      <ErrorBox error={error} />

      {loadingOptions ? (
        <div className="module-inline-loading">
          <span />
          <div>
            <strong>Carregando opções…</strong>
            <small>Buscando somente OS abertas e serviços ativos.</small>
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <label>
            Ordem de serviço (opcional)
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="">Sem vínculo</option>
              {options.orders.map((item) => (
                <option key={item.id} value={item.id}>
                  OS #{item.numero} · {item.cliente_nome}
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
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>

          {!selectedOrder && (
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
              {options.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.nome} · {service.duracao} min
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
      )}

      <p>O sistema verifica o expediente e impede horários sobrepostos.</p>
      <button className="primary" disabled={busy || loadingOptions}>
        {busy ? "Salvando…" : "Agendar atendimento"}
      </button>
    </form>
  );
}
