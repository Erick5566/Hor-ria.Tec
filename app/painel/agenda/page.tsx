"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Brand, MissingConfig } from "@/components/brand";
import Setup from "@/components/setup";
import AppointmentForm from "@/components/appointment-form";
import Link from "next/link";
import {
  supabase,
  configured,
  Empresa,
  Servico,
  Agendamento,
  message,
  today,
  time,
  dateLabel,
  shift,
} from "@/lib/supabase";
const labels = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
};
export default function Painel() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>(null),
    [services, setServices] = useState<Servico[]>([]),
    [bookings, setBookings] = useState<Agendamento[]>([]),
    [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [date, setDate] = useState(today()),
    [view, setView] = useState<"dia" | "semana" | "mes">("dia"),
    [adding, setAdding] = useState(false),
    [blocking, setBlocking] = useState(false),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    setError("");
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace("/");
        return;
      }
      const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .eq("dono_id", user.id)
        .maybeSingle();
      if (error) throw error;
      setEmpresa(data);
      if (data) {
        const result = await supabase
          .from("servicos")
          .select("*")
          .eq("empresa_id", data.id)
          .order("nome");
        if (result.error) throw result.error;
        setServices(result.data);
      }
      setReady(true);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    load();
    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/");
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [load, router]);
  const refresh = useCallback(
    async (quiet = false) => {
      if (!empresa || !supabase) return;
      if (!quiet) setLoading(true);
      try {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("*")
          .eq("empresa_id", empresa.id)
          .gte(
            "inicio",
            (view === "mes" ? date.slice(0, 7) + "-01" : date) +
              "T00:00:00-03:00",
          )
          .lt(
            "inicio",
            (view === "mes"
              ? shift(
                  date.slice(0, 7) + "-01",
                  new Date(
                    Number(date.slice(0, 4)),
                    Number(date.slice(5, 7)),
                    0,
                  ).getDate(),
                )
              : shift(date, view === "dia" ? 1 : 7)) + "T00:00:00-03:00",
          )
          .order("inicio");
        if (error) throw error;
        setBookings(data);
      } catch (e) {
        setError(message(e as Error));
      } finally {
        setLoading(false);
      }
    },
    [empresa, date, view],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!empresa || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`agenda-painel-${empresa.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => {
          void refresh(true);
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [empresa, refresh]);
  if (!configured) return <MissingConfig />;
  async function status(a: Agendamento) {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!
        .from("agendamentos")
        .update({
          status: a.status === "aguardando" ? "em_atendimento" : "concluido",
        })
        .eq("id", a.id);
      if (error) throw error;
      await refresh();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  async function block(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const day = f.get("dia");
      const { error } = await supabase!.from("agendamentos").insert({
        empresa_id: empresa!.id,
        bloqueio: true,
        inicio: `${day}T${f.get("inicio")}:00-03:00`,
        fim: `${day}T${f.get("fim")}:00-03:00`,
        descricao: f.get("motivo"),
      });
      if (error) throw error;
      setBlocking(false);
      await refresh();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  async function unblock(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase!
        .from("agendamentos")
        .delete()
        .eq("id", id)
        .eq("bloqueio", true);
      if (error) throw error;
      await refresh();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  const appointments = bookings.filter((a) => !a.bloqueio);
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
    (_, i) => shift(view === "mes" ? date.slice(0, 7) + "-01" : date, i),
  );
  return (
    <div className="agenda-container agenda-pro">
      <main className="legacy-agenda">
        {error && (
          <div className="notice" role="alert">
            {error}{" "}
            <button
              onClick={() => {
                load();
                refresh();
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}
        {!ready ? (
          <div className="empty">
            {loading
              ? "Carregando sua agenda…"
              : "Não foi possível carregar a agenda."}
          </div>
        ) : !empresa ? (
          <Setup done={load} />
        ) : (
          <div className="dashboard-content">
            <div className="page-heading">
              <div>
                <span className="eyebrow">OPERAÇÃO ORGANIZADA</span>
                <h1>
                  Agenda<span className="green-dot">.</span>
                </h1>
                <p>Organize os horários. Cuide de cada atendimento.</p>
              </div>
              <button className="primary" onClick={() => setAdding(!adding)}>
                {adding ? "Fechar formulário" : "+ Novo atendimento"}
              </button>
              <button className="outline" onClick={() => setBlocking(true)}>
                ⊘ Bloquear horário
              </button>
            </div>
            {adding && (
              <AppointmentForm
                done={() => {
                  setAdding(false);
                  refresh();
                }}
              />
            )}
            <section className="stats">
              <div className="stat">
                <span>
                  Agendamentos <b>↗</b>
                </span>
                <strong>
                  {appointments.length.toString().padStart(2, "0")}
                </strong>
                <small>
                  {view === "dia"
                    ? "No dia selecionado"
                    : view === "mes"
                      ? "No mês selecionado"
                      : "Nos próximos 7 dias"}
                </small>
              </div>
              <div className="stat">
                <span>
                  Em atendimento <b>◷</b>
                </span>
                <strong>
                  {appointments
                    .filter((a) => a.status === "em_atendimento")
                    .length.toString()
                    .padStart(2, "0")}
                </strong>
                <small>Tempo dedicado ao cliente</small>
              </div>
              <div className="stat">
                <span>
                  Concluídos <b>✓</b>
                </span>
                <strong>
                  {appointments
                    .filter((a) => a.status === "concluido")
                    .length.toString()
                    .padStart(2, "0")}
                </strong>
                <small>Atendimentos finalizados</small>
              </div>
            </section>
            <section className="agenda card">
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
                    onChange={(e) => e.target.value && setDate(e.target.value)}
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
                  <button
                    className={view === "mes" ? "selected" : ""}
                    onClick={() => setView("mes")}
                  >
                    Mês
                  </button>
                  <button
                    className={view === "dia" ? "selected" : ""}
                    onClick={() => setView("dia")}
                  >
                    Dia
                  </button>
                  <button
                    className={view === "semana" ? "selected" : ""}
                    onClick={() => setView("semana")}
                  >
                    Semana
                  </button>
                </div>
                <button aria-label="Atualizar agenda" onClick={() => refresh()}>
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
                  {days.map((day) => (
                    <section className="day-group" key={day}>
                      <h3>{dateLabel(day)}</h3>
                      {bookings
                        .filter(
                          (a) =>
                            new Intl.DateTimeFormat("en-CA", {
                              timeZone: "America/Sao_Paulo",
                            }).format(new Date(a.inicio)) === day,
                        )
                        .map((a) => (
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
                                  {a.bloqueio
                                    ? "Horário bloqueado"
                                    : a.nome_cliente}
                                </strong>
                                <span
                                  className={`badge ${a.bloqueio ? "bloqueio" : a.status}`}
                                >
                                  {a.bloqueio
                                    ? "Indisponível"
                                    : labels[a.status]}
                                </span>
                              </div>
                              <p>
                                {a.bloqueio
                                  ? a.descricao || "Pausa na agenda"
                                  : services.find((s) => s.id === a.servico_id)
                                      ?.nome}
                              </p>
                              {!a.bloqueio && (
                                <details>
                                  <summary>Ver detalhes do cliente</summary>
                                  <p>{a.telefone}</p>
                                  {a.endereco && <p>{a.endereco}</p>}
                                  {a.descricao && <p>{a.descricao}</p>}
                                  <p>
                                    {
                                      (
                                        a as Agendamento & {
                                          finalidade?: string;
                                        }
                                      ).finalidade
                                    }
                                  </p>
                                  {(a as Agendamento & { ordem_id?: string })
                                    .ordem_id && (
                                    <Link
                                      href={`/painel/ordens/${(a as Agendamento & { ordem_id?: string }).ordem_id}`}
                                    >
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
                                onClick={() => unblock(a.id)}
                              >
                                Liberar horário
                              </button>
                            ) : (
                              a.status !== "concluido" && (
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => status(a)}
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
                      {!bookings.some(
                        (a) =>
                          new Intl.DateTimeFormat("en-CA", {
                            timeZone: "America/Sao_Paulo",
                          }).format(new Date(a.inicio)) === day,
                      ) && (
                        <div className="empty">
                          <span className="empty-icon">▦</span>
                          <strong>Um espaço livre por aqui.</strong>
                          <p>Nenhum agendamento neste dia.</p>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </section>
            <section className="share-bar">
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
          </div>
        )}
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
                {error && (
                  <p className="notice" role="alert">
                    {error}
                  </p>
                )}
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
