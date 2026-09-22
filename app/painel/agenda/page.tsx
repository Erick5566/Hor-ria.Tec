"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Heading, MetricCard, MetricGrid } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import {
  supabase,
  type Agendamento,
  message,
  today,
  time,
  dateLabel,
  shift,
} from "@/lib/supabase";

const AppointmentForm = dynamic(() => import("@/components/appointment-form"), {
  loading: () => (
    <div className="module-inline-loading">
      <span />
      <div>
        <strong>Carregando formulário…</strong>
        <small>Preparando opções de atendimento.</small>
      </div>
    </div>
  ),
});

type AgendaItem = Agendamento & {
  servico_nome?: string | null;
  ordem_id?: string | null;
  finalidade?: string | null;
};

const labels = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
};

function periodBounds(date: string, view: "dia" | "semana" | "mes") {
  const start = view === "mes" ? date.slice(0, 7) + "-01" : date;
  if (view === "dia") return { start, end: shift(start, 1) };
  if (view === "semana") return { start, end: shift(start, 7) };
  const days = new Date(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)),
    0,
  ).getDate();
  return { start, end: shift(start, days) };
}

export default function Painel() {
  const { empresa } = useWorkspace();
  const [bookings, setBookings] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState(today());
  const [view, setView] = useState<"dia" | "semana" | "mes">("dia");
  const [adding, setAdding] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState(false);

  const bounds = useMemo(() => periodBounds(date, view), [date, view]);

  const refresh = useCallback(
    async (quiet = false) => {
      if (!supabase) return;
      if (!quiet) setLoading(true);
      try {
        const result = await supabase.rpc("agenda_period", {
          p_start: bounds.start,
          p_end_exclusive: bounds.end,
        });
        if (result.error) throw result.error;
        setBookings((result.data || []) as AgendaItem[]);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [bounds.start, bounds.end],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !empresa.id) return;
    let timer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(true), 250);
    };
    const channel = supabase
      .channel(`agenda-painel-${empresa.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        refreshSoon,
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa.id, refresh]);

  async function status(a: AgendaItem) {
    setBusy(true);
    setError("");
    try {
      const result = await supabase!
        .from("agendamentos")
        .update({
          status: a.status === "aguardando" ? "em_atendimento" : "concluido",
        })
        .eq("id", a.id);
      if (result.error) throw result.error;
      await refresh(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  async function block(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const day = form.get("dia");
      const result = await supabase!.from("agendamentos").insert({
        empresa_id: empresa.id,
        bloqueio: true,
        inicio: `${day}T${form.get("inicio")}:00-03:00`,
        fim: `${day}T${form.get("fim")}:00-03:00`,
        descricao: form.get("motivo"),
      });
      if (result.error) throw result.error;
      setBlocking(false);
      await refresh(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  async function unblock(id: string) {
    setBusy(true);
    try {
      const result = await supabase!
        .from("agendamentos")
        .delete()
        .eq("id", id)
        .eq("bloqueio", true);
      if (result.error) throw result.error;
      await refresh(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  const appointments = bookings.filter((item) => !item.bloqueio);
  const days = Array.from(
    {
      length:
        view === "dia"
          ? 1
          : view === "semana"
            ? 7
            : new Date(
                Number(date.slice(0, 4)),
                Number(date.slice(5, 7)),
                0,
              ).getDate(),
    },
    (_, index) =>
      shift(view === "mes" ? date.slice(0, 7) + "-01" : date, index),
  );

  const byDay = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    const map = new Map<string, AgendaItem[]>();
    for (const booking of bookings) {
      const key = formatter.format(new Date(booking.inicio));
      const group = map.get(key);
      if (group) group.push(booking);
      else map.set(key, [booking]);
    }
    return map;
  }, [bookings]);

  return (
    <div className="agenda-container agenda-pro">
      <main className="legacy-agenda">
        {error && (
          <div className="notice" role="alert">
            {error} <button onClick={() => void refresh(false)}>Tentar novamente</button>
          </div>
        )}

        <section className="module dashboard-pro agenda-dashboard">
          <div className="dashboard-hero agenda-dashboard-hero">
            <Heading
              title="Agenda"
              subtitle="Organize horários, acompanhe atendimentos e mantenha o dia sob controle."
            />
            <div className="agenda-hero-actions">
              <button className="primary" onClick={() => setAdding(!adding)}>
                {adding ? "Fechar formulário" : "+ Novo atendimento"}
              </button>
              <button className="outline" onClick={() => setBlocking(true)}>
                ⊘ Bloquear horário
              </button>
            </div>
          </div>

          {adding && (
            <AppointmentForm
              done={() => {
                setAdding(false);
                void refresh(true);
              }}
            />
          )}

          <MetricGrid columns={4} className="agenda-kpis">
            <MetricCard
              label="Agendamentos"
              value={appointments.length}
              note={
                view === "dia"
                  ? "No dia selecionado"
                  : view === "mes"
                    ? "No mês selecionado"
                    : "Nos próximos 7 dias"
              }
              icon="▦"
            />
            <MetricCard
              label="Em atendimento"
              value={
                appointments.filter((item) => item.status === "em_atendimento")
                  .length
              }
              note="Atendimentos em execução"
              icon="◷"
              tone="warning"
            />
            <MetricCard
              label="Concluídos"
              value={
                appointments.filter((item) => item.status === "concluido").length
              }
              note="Atendimentos finalizados"
              icon="✓"
              tone="success"
            />
            <MetricCard
              label="Horários bloqueados"
              value={bookings.filter((item) => item.bloqueio).length}
              note="Períodos indisponíveis"
              icon="⊘"
              tone="purple"
            />
          </MetricGrid>

          <section className="agenda card dashboard-card agenda-main-card">
            <div className="agenda-toolbar">
              <div className="date-control">
                <button
                  aria-label="Período anterior"
                  onClick={() =>
                    setDate(
                      view === "mes"
                        ? shift(date.slice(0, 7) + "-01", -1)
                        : shift(date, view === "dia" ? -1 : -7),
                    )
                  }
                >
                  ‹
                </button>
                <input
                  aria-label="Data da agenda"
                  type="date"
                  value={date}
                  onChange={(event) =>
                    event.target.value && setDate(event.target.value)
                  }
                />
                <button
                  aria-label="Próximo período"
                  onClick={() =>
                    setDate(
                      view === "mes"
                        ? shift(date.slice(0, 7) + "-01", days.length)
                        : shift(date, view === "dia" ? 1 : 7),
                    )
                  }
                >
                  ›
                </button>
                <button className="today" onClick={() => setDate(today())}>
                  Hoje
                </button>
              </div>

              <div className="segmented">
                {(["mes", "dia", "semana"] as const).map((value) => (
                  <button
                    key={value}
                    className={view === value ? "selected" : ""}
                    onClick={() => setView(value)}
                  >
                    {value === "mes" ? "Mês" : value === "dia" ? "Dia" : "Semana"}
                  </button>
                ))}
              </div>

              <button aria-label="Atualizar agenda" onClick={() => void refresh(false)}>
                ↻
              </button>
            </div>

            {loading ? (
              <div className="empty">Atualizando agenda…</div>
            ) : (
              <div
                className={
                  view === "semana"
                    ? "week-grid"
                    : view === "mes"
                      ? "month-grid"
                      : ""
                }
              >
                {days.map((day) => {
                  const dayBookings = byDay.get(day) || [];
                  return (
                    <section className="day-group" key={day}>
                      <h3>{dateLabel(day)}</h3>
                      {dayBookings.map((a) => (
                        <article
                          className={`appointment ${a.bloqueio ? "blocked" : ""}`}
                          key={a.id}
                        >
                          <div className="appointment-time">
                            <strong>{time(a.inicio)}</strong>
                            <small>{time(a.fim)}</small>
                          </div>
                          <div className="appointment-body">
                            <div className="appointment-title">
                              <strong>
                                {a.bloqueio ? "Horário bloqueado" : a.nome_cliente}
                              </strong>
                              <span
                                className={`badge ${a.bloqueio ? "bloqueio" : a.status}`}
                              >
                                {a.bloqueio ? "Indisponível" : labels[a.status]}
                              </span>
                            </div>
                            <p>
                              {a.bloqueio
                                ? a.descricao || "Pausa na agenda"
                                : a.servico_nome || "Atendimento"}
                            </p>
                            {!a.bloqueio && (
                              <details>
                                <summary>Ver detalhes do cliente</summary>
                                <p>{a.telefone}</p>
                                {a.endereco && <p>{a.endereco}</p>}
                                {a.descricao && <p>{a.descricao}</p>}
                                {a.finalidade && <p>{a.finalidade}</p>}
                                {a.ordem_id && (
                                  <Link href={`/painel/ordens/${a.ordem_id}`}>
                                    Abrir ordem de serviço
                                  </Link>
                                )}
                              </details>
                            )}
                          </div>
                          {a.bloqueio ? (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => void unblock(a.id)}
                            >
                              Liberar horário
                            </button>
                          ) : (
                            a.status !== "concluido" && (
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => void status(a)}
                              >
                                {a.status === "aguardando"
                                  ? "Iniciar atendimento"
                                  : "Concluir"}{" "}
                                <span>→</span>
                              </button>
                            )
                          )}
                        </article>
                      ))}
                      {!dayBookings.length && (
                        <div className="empty">
                          <span className="empty-icon">▦</span>
                          <strong>Um espaço livre por aqui.</strong>
                          <p>Nenhum agendamento neste dia.</p>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>

          <section className="share-bar dashboard-card agenda-share-card">
            <span className="share-icon">↗</span>
            <div>
              <strong>Sua agenda, a um link de distância.</strong>
              <p>Compartilhe sua página e receba agendamentos.</p>
            </div>
            <a
              className="outline"
              href={`/agendar/${empresa.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir página pública ↗
            </a>
          </section>
        </section>

        {blocking && (
          <div className="modal-backdrop">
            <section
              className="modal card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="block-title"
            >
              <button
                className="close"
                aria-label="Fechar"
                onClick={() => setBlocking(false)}
              >
                ×
              </button>
              <h2 id="block-title">Reserve um tempo para você.</h2>
              <p>O período ficará indisponível para novos agendamentos.</p>
              <form onSubmit={block}>
                <label>
                  Dia
                  <input
                    name="dia"
                    type="date"
                    min={today()}
                    defaultValue={date}
                    required
                  />
                </label>
                <div className="two-columns">
                  <label>
                    Das
                    <input name="inicio" type="time" required />
                  </label>
                  <label>
                    Até
                    <input name="fim" type="time" required />
                  </label>
                </div>
                <label>
                  Motivo (opcional)
                  <input
                    name="motivo"
                    maxLength={500}
                    placeholder="Ex.: Almoço, compromisso pessoal"
                  />
                </label>
                <button disabled={busy} className="primary">
                  {busy ? "Salvando…" : "Bloquear horário"}
                </button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
