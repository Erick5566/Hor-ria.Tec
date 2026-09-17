"use client";
import { use, useEffect, useState } from "react";
import { Brand, MissingConfig } from "@/components/brand";
import {
  publicDb,
  configured,
  Empresa,
  Servico,
  today,
  time,
  dateLabel,
  message,
  shift,
} from "@/lib/supabase";
export default function Booking({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [company, setCompany] = useState<Empresa | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [service, setService] = useState<Servico | null>(null),
    [day, setDay] = useState(today()),
    [slots, setSlots] = useState<string[]>([]),
    [slot, setSlot] = useState(""),
    [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [slotsLoading, setSlotsLoading] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (!publicDb) return;
    setLoading(true);
    publicDb.rpc("catalogo", { p_slug: slug }).then(({ data, error }) => {
      if (!active) return;
      if (error)
        setError(
          "Não foi possível carregar a empresa. Atualize a página para tentar novamente.",
        );
      else setCompany(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [slug]);
  useEffect(() => {
    let active = true;
    setSlot("");
    setSlots([]);
    if (!service || !publicDb) return;
    setSlotsLoading(true);
    publicDb
      .rpc("horarios_disponiveis", {
        p_slug: slug,
        p_servico: service.id,
        p_dia: day,
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error)
          setError("Não foi possível carregar os horários. Tente outra data.");
        else setSlots((data || []).map((s: { inicio: string }) => s.inicio));
        setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [day, service, slug, revision]);
  if (!configured) return <MissingConfig />;
  async function reserve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error } = await publicDb!.from("agendamentos").insert({
        empresa_id: company!.id,
        servico_id: service!.id,
        inicio: slot,
        nome_cliente: String(f.get("nome")).trim(),
        telefone: String(f.get("telefone")).trim(),
        endereco: company!.solicitar_endereco
          ? String(f.get("endereco")).trim()
          : null,
        descricao: String(f.get("descricao")).trim() || null,
      });
      if (error) {
        if (error.code === "23P01") {
          setStep(2);
          setRevision((v) => v + 1);
        }
        throw error;
      }
      setStep(4);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="public-header">
        <Brand />
        <span>AGENDAMENTO ONLINE</span>
      </header>
      {loading ? (
        <main className="empty">Carregando agenda…</main>
      ) : !company ? (
        <main className="center card">
          <h1>
            {error
              ? "Não foi possível abrir a agenda."
              : "Empresa não encontrada."}
          </h1>
          <p>{error || "Confira o link de agendamento que você recebeu."}</p>
          <button className="outline" onClick={() => location.reload()}>
            Tentar novamente
          </button>
        </main>
      ) : (
        <main className="booking-layout">
          <aside className="booking-intro">
            <div className="business-logo">{company.nome.slice(0, 1)}</div>
            <span className="eyebrow">UM TEMPO SÓ PARA VOCÊ</span>
            <h1>{company.nome}</h1>
            <p>Escolha o serviço e encontre o melhor horário para o seu dia.</p>
            <div className="booking-meta">
              ◷ &nbsp; Horários de Brasília
              <br />✓ &nbsp; Confirmação na hora
            </div>
          </aside>
          <div>
            <section className="booking-card card">
              {step < 4 && (
                <nav className="steps" aria-label="Etapas do agendamento">
                  {["Serviço", "Horário", "Seus dados"].map((s, i) => (
                    <span
                      key={s}
                      className={step === i + 1 ? "current" : ""}
                      aria-current={step === i + 1 ? "step" : undefined}
                    >
                      <b>{step > i + 1 ? "✓" : i + 1}</b>
                      {s}
                    </span>
                  ))}
                </nav>
              )}
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              {step === 1 && (
                <>
                  <h2>Qual serviço seu equipamento precisa?</h2>
                  <p>Selecione o serviço que deseja agendar.</p>
                  {company.servicos?.map((s) => (
                    <button
                      className="service-option"
                      key={s.id}
                      onClick={() => {
                        setService(s);
                        setStep(2);
                        setError("");
                      }}
                    >
                      <span>✦</span>
                      <div>
                        <strong>{s.nome}</strong>
                        <small>◷ {s.duracao} minutos</small>
                      </div>
                      <span>→</span>
                    </button>
                  ))}
                  {!company.servicos?.length && (
                    <p>Esta empresa ainda não disponibilizou serviços.</p>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <button
                    className="booking-back"
                    onClick={() => {
                      setStep(1);
                      setError("");
                    }}
                  >
                    ← Escolher outro serviço
                  </button>
                  <h2>Encontre seu melhor horário.</h2>
                  <p>
                    {service?.nome} · {service?.duracao} minutos
                  </p>
                  <label>
                    Dia do atendimento
                    <input
                      type="date"
                      value={day}
                      min={today()}
                      max={shift(today(), 90)}
                      required
                      onChange={(e) => {
                        if (e.target.value) {
                          setDay(e.target.value);
                          setError("");
                        }
                      }}
                    />
                  </label>
                  {slotsLoading ? (
                    <div className="empty">Buscando horários livres…</div>
                  ) : slots.length ? (
                    <>
                      <div
                        className="slot-grid"
                        role="group"
                        aria-label="Horários disponíveis"
                      >
                        {slots.map((s) => (
                          <button
                            className={`slot ${slot === s ? "selected" : ""}`}
                            aria-pressed={slot === s}
                            key={s}
                            onClick={() => setSlot(s)}
                          >
                            {time(s)}
                          </button>
                        ))}
                      </div>
                      <button
                        className="primary"
                        disabled={!slot}
                        onClick={() => setStep(3)}
                      >
                        Continuar →
                      </button>
                    </>
                  ) : (
                    <div className="empty">
                      <span className="empty-icon">◷</span>
                      <strong>Nenhum horário livre neste dia.</strong>
                      <p>Experimente escolher outra data.</p>
                    </div>
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <button className="booking-back" onClick={() => setStep(2)}>
                    ← Alterar horário
                  </button>
                  <h2>Falta só se apresentar.</h2>
                  <p>Preencha seus dados para confirmar o atendimento.</p>
                  <div className="booking-summary">
                    <strong>{service?.nome}</strong>
                    {dateLabel(day)} · {time(slot)}
                    <br />
                    {service?.duracao} minutos · Horário de Brasília
                  </div>
                  <form onSubmit={reserve}>
                    <label>
                      Seu nome
                      <input
                        name="nome"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={100}
                        placeholder="Nome e sobrenome"
                      />
                    </label>
                    <label>
                      Telefone
                      <input
                        name="telefone"
                        type="tel"
                        autoComplete="tel"
                        required
                        pattern={"[+0-9 \\(\\)\\-]{8,25}"}
                        maxLength={25}
                        placeholder="(11) 99999-9999"
                      />
                    </label>
                    {company.solicitar_endereco && (
                      <label>
                        Endereço do atendimento
                        <input
                          name="endereco"
                          autoComplete="street-address"
                          required
                          minLength={5}
                          maxLength={300}
                          placeholder="Rua, número, bairro e cidade"
                        />
                      </label>
                    )}
                    <label>
                      Quer nos contar algo? (opcional)
                      <textarea
                        name="descricao"
                        rows={3}
                        maxLength={500}
                        placeholder="Uma observação breve para o atendimento"
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      {busy ? "Confirmando…" : "Confirmar agendamento →"}
                    </button>
                  </form>
                </>
              )}
              {step === 4 && (
                <div className="confirmation" role="status">
                  <span className="check">✓</span>
                  <span
                    className="eyebrow"
                    style={{ display: "block", marginBottom: 12 }}
                  >
                    ESTÁ TUDO CERTO
                  </span>
                  <h2>Seu horário está reservado.</h2>
                  <p>{company.nome} espera por você!</p>
                  <div className="booking-summary">
                    <strong>{service?.nome}</strong>
                    {dateLabel(day)}
                    <br />
                    {time(slot)} · {service?.duracao} minutos
                    <br />
                    Horário de Brasília
                  </div>
                  <p>Guarde estas informações para o dia do atendimento.</p>
                  <button
                    className="outline"
                    onClick={() => {
                      setStep(1);
                      setService(null);
                      setSlot("");
                      setError("");
                    }}
                  >
                    Fazer outro agendamento
                  </button>
                </div>
              )}
            </section>
            <footer className="booking-footer">
              Sua assistência técnica, mais organizada.{" "}
              <strong>horária.</strong>
            </footer>
          </div>
        </main>
      )}
    </>
  );
}
