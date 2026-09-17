"use client";
import { useState } from "react";
import { supabase, message } from "@/lib/supabase";
const weekdays = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export default function Setup({ done }: { done: () => void }) {
  const [hours, setHours] = useState<Record<string, [string, string]>>({
    "1": ["09:00", "18:00"],
    "2": ["09:00", "18:00"],
    "3": ["09:00", "18:00"],
    "4": ["09:00", "18:00"],
    "5": ["09:00", "18:00"],
  });
  const [services, setServices] = useState([{ nome: "", duracao: 30 }]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const { error } = await supabase!.rpc("configurar_empresa", {
        p_nome: f.get("nome"),
        p_slug: f.get("slug"),
        p_horario: hours,
        p_endereco: f.get("endereco") === "on",
        p_servicos: services,
      });
      if (error) throw error;
      done();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup">
      <span className="eyebrow">VAMOS COMEÇAR</span>
      <h1>Sua assistência, organizada.</h1>
      <p>
        Conte um pouco sobre sua empresa para receber o primeiro agendamento.
      </p>
      <form onSubmit={save}>
        <div className="card">
          <h2>
            01 <span>Sua empresa</span>
          </h2>
          <div className="two-columns">
            <label>
              Nome da empresa
              <input
                name="nome"
                required
                minLength={2}
                maxLength={100}
                placeholder="Ex.: Central Tech"
              />
            </label>
            <label>
              Endereço da página pública
              <input
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="central-tech"
              />
              <small>/agendar/seu-endereco</small>
            </label>
          </div>
          <label className="check-label">
            <input name="endereco" type="checkbox" /> Solicitar endereço do
            cliente
          </label>
        </div>
        <div className="card">
          <h2>
            02 <span>Horário de funcionamento</span>
          </h2>
          <p>Horários em Brasília, em intervalos de 15 minutos.</p>
          {weekdays.map((day, i) => (
            <div className="hour-row" key={day}>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={!!hours[i]}
                  onChange={(e) => {
                    const next = { ...hours };
                    if (e.target.checked) next[i] = ["09:00", "18:00"];
                    else delete next[i];
                    setHours(next);
                  }}
                />
                {day}
              </label>
              {hours[i] ? (
                <>
                  <input
                    aria-label={`Abertura ${day}`}
                    type="time"
                    step={900}
                    value={hours[i][0]}
                    required
                    onChange={(e) =>
                      setHours({ ...hours, [i]: [e.target.value, hours[i][1]] })
                    }
                  />
                  <span>até</span>
                  <input
                    aria-label={`Fechamento ${day}`}
                    type="time"
                    step={900}
                    value={hours[i][1]}
                    required
                    onChange={(e) =>
                      setHours({ ...hours, [i]: [hours[i][0], e.target.value] })
                    }
                  />
                </>
              ) : (
                <small>Fechado</small>
              )}
            </div>
          ))}
        </div>
        <div className="card">
          <h2>
            03 <span>Seus serviços</span>
          </h2>
          {services.map((s, i) => (
            <div className="service-row" key={i}>
              <label>
                Nome do serviço
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={s.nome}
                  placeholder="Ex.: Troca de tela"
                  onChange={(e) =>
                    setServices(
                      services.map((s, j) =>
                        i === j ? { ...s, nome: e.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Duração (min)
                <input
                  required
                  type="number"
                  min={5}
                  max={480}
                  value={s.duracao}
                  onChange={(e) =>
                    setServices(
                      services.map((s, j) =>
                        i === j ? { ...s, duracao: Number(e.target.value) } : s,
                      ),
                    )
                  }
                />
              </label>
              {services.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remover serviço ${i + 1}`}
                  onClick={() =>
                    setServices(services.filter((_, j) => i !== j))
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="outline"
            type="button"
            onClick={() =>
              setServices([...services, { nome: "", duracao: 30 }])
            }
          >
            + Adicionar serviço
          </button>
        </div>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <button disabled={busy} className="primary">
          {busy ? "Salvando…" : "Tudo pronto. Configurar assistência →"}
        </button>
      </form>
    </section>
  );
}
