"use client";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Brand } from "./brand";
import { ErrorBox } from "./ui";
import { PhotoPicker } from "./photos";
import { PendingPhoto, uploadPhotos } from "@/lib/photos";
import { DeviceCategoryCards } from "./device-fields";
import DeviceFields from "./device-fields";
import { publicDb, message, Servico, today, time } from "@/lib/supabase";
import { money } from "@/lib/assistencia";
type Profile = {
  nome: string;
  descricao: string;
  telefone: string;
  endereco: string;
  servicos: Servico[];
  solicitar_endereco: boolean;
  fotos_obrigatorias: boolean;
  whatsapp?: string;
  email?: string;
  logo?: string;
  instagram?: string;
  site?: string;
  slogan?: string;
  cidade?: string;
  estado?: string;
  google_maps?: string;
  google_business?: string;
  google_avaliacao?: string;
  horario?: Record<string, [string, string]>;
  aparencia?: {
    primaria: string;
    secundaria: string;
    botao: string;
    tema: "claro" | "escuro";
    destaque: string;
    fundo: string;
    texto: string;
    preset: string;
  };
  pagina?: {
    headline: string;
    subheadline: string;
    botao_primario: string;
    botao_secundario: string;
    mostrar_botao_secundario: boolean;
    mostrar_servicos: boolean;
    limite_servicos: number;
    servicos_destaque: string[];
    mostrar_agendamento: boolean;
    mostrar_acompanhamento: boolean;
    mostrar_vitrine: boolean;
    mostrar_contato: boolean;
    mostrar_whatsapp: boolean;
    mostrar_telefone: boolean;
    mostrar_instagram: boolean;
    mostrar_email: boolean;
    mostrar_endereco: boolean;
    mostrar_mapa: boolean;
    mostrar_horario: boolean;
    mostrar_google_avaliacao: boolean;
    mostrar_como_funciona: boolean;
    whatsapp_mensagem: string;
    ordem_secoes: string[];
  };
};
type Receipt = {
  id: string;
  empresa_id: string;
  numero: number;
  codigo: string;
  token: string;
  upload_token: string;
};
type ShowcaseItem = {
  id: string;
  nome: string;
  descricao?: string;
  preco: number;
  foto?: string;
  condicao: "Novo" | "Seminovo";
};
export default function PublicPortal({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [showcase, setShowcase] = useState<{
      produtos: ShowcaseItem[];
      seminovos: ShowcaseItem[];
      whatsapp?: string;
    }>({ produtos: [], seminovos: [] }),
    [availability, setAvailability] = useState<{
      state: string;
      name?: string;
      message?: string | null;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [photos, setPhotos] = useState<PendingPhoto[]>([]),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [done, setDone] = useState(false),
    [step, setStep] = useState(1),
    [schedule, setSchedule] = useState(false),
    [service, setService] = useState(""),
    [day, setDay] = useState(today()),
    [slots, setSlots] = useState<string[]>([]),
    [slot, setSlot] = useState("");
  const [device, setDevice] = useState<Record<string, string>>({
    categoria: "Celular",
    tipo_personalizado: "",
    marca: "",
    modelo: "",
    cor: "",
  });
  useEffect(() => {
    Promise.all([
      publicDb!.rpc("perfil_assistencia", { p_slug: slug }),
      publicDb!.rpc("public_company_status", { p_slug: slug }),
      publicDb!.rpc("vitrine_publica", { p_slug: slug }),
    ]).then(([profileResult, statusResult, showcaseResult]) => {
      if (profileResult.error) setError(message(profileResult.error));
      else setProfile(profileResult.data);
      if (!statusResult.error) setAvailability(statusResult.data);
      if (!showcaseResult.error && showcaseResult.data)
        setShowcase(showcaseResult.data);
      setLoading(false);
    });
  }, [slug]);
  useEffect(() => {
    let active = true;
    setSlots([]);
    setSlot("");
    if (service && schedule)
      publicDb
        ?.rpc("horarios_disponiveis", {
          p_slug: slug,
          p_servico: service,
          p_dia: day,
        })
        .then((r) => {
          if (!active) return;
          if (r.error) setError(message(r.error));
          else setSlots(r.data.map((s: { inicio: string }) => s.inicio));
        });
    return () => {
      active = false;
    };
  }, [service, day, schedule, slug]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const controls = e.currentTarget.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      `[data-step="${step}"] input,[data-step="${step}"] select,[data-step="${step}"] textarea`,
    );
    for (const control of controls) if (!control.reportValidity()) return;
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (profile!.fotos_obrigatorias && !photos.length)
        throw new Error(
          "Esta assistência solicita pelo menos uma foto do equipamento.",
        );
      let created = receipt;
      if (!created) {
        const r = await publicDb!.rpc("solicitar_reparo", {
          p_slug: slug,
          p_cliente: {
            nome: f.get("nome"),
            whatsapp: f.get("telefone"),
            email: f.get("email"),
          },
          p_equipamento: {
            categoria: device.categoria,
            tipo_personalizado: device.tipo_personalizado,
            marca: device.marca,
            modelo: device.modelo,
            cor: device.cor,
          },
          p_problema: f.get("problema"),
          p_servico: schedule ? service : null,
          p_inicio: schedule ? slot : null,
          p_endereco: f.get("endereco") || null,
        });
        if (r.error) throw r.error;
        created = r.data as Receipt;
        setReceipt(created);
      }
      await uploadPhotos(
        created.empresa_id,
        created.id,
        photos,
        created.upload_token,
      );
      setDone(true);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className={`public-portal tenant-public ${profile?.aparencia?.tema === "escuro" ? "tenant-dark" : ""}`}
      style={
        profile?.aparencia
          ? ({
              "--tenant-primary": profile.aparencia.primaria,
              "--tenant-secondary": profile.aparencia.secundaria,
              "--tenant-button": profile.aparencia.botao,
              "--tenant-accent": profile.aparencia.destaque,
              "--tenant-background": profile.aparencia.fundo,
              "--tenant-text": profile.aparencia.texto,
            } as CSSProperties)
          : undefined
      }
    >
      {loading ? (
        <>
          <Brand />
          <p>Carregando assistência…</p>
        </>
      ) : availability?.state === "MAINTENANCE" ? (
        <section className="public-state">
          <span className="state-icon">⚙</span>
          <h1>Estamos realizando uma atualização.</h1>
          <p>
            {availability.message ||
              "Seus dados continuam seguros. Esta assistência estará disponível novamente em breve."}
          </p>
        </section>
      ) : availability?.state === "UNAVAILABLE" ? (
        <section className="public-state">
          <h1>Atendimento temporariamente indisponível</h1>
          <p>
            Entre em contato diretamente com a assistência para mais
            informações.
          </p>
        </section>
      ) : !profile ? (
        <>
          <h1>Assistência não encontrada</h1>
          <ErrorBox error={error} />
        </>
      ) : (
        <>
          <header>
            {profile.logo && (
              <img
                className="tenant-logo"
                src={profile.logo}
                alt={`Logo de ${profile.nome}`}
              />
            )}
            {!profile.logo && (
              <div className="tenant-logo-fallback">
                {profile.nome.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="tenant-slogan">
              {profile.slogan || profile.nome}
            </span>
            <h1>{profile.pagina?.headline || profile.nome}</h1>
            <p>
              {profile.pagina?.subheadline ||
                profile.descricao ||
                "Assistência técnica para seus equipamentos, com acompanhamento em cada etapa."}
            </p>
            {(profile.cidade || profile.estado) && (
              <strong className="tenant-location">
                {[profile.cidade, profile.estado].filter(Boolean).join(" · ")}
              </strong>
            )}
            <div className="inline-actions public-hero-actions">
              {(profile.pagina?.mostrar_agendamento ?? true) && (
                <Link className="primary" href={`/agendar/${slug}`}>
                  {profile.pagina?.botao_primario || "Agendar atendimento"}
                </Link>
              )}
              {(profile.pagina?.mostrar_acompanhamento ?? true) &&
                (profile.pagina?.mostrar_botao_secundario ?? true) && (
                  <Link className="outline" href="/acompanhar">
                    {profile.pagina?.botao_secundario ||
                      "Acompanhar meu reparo"}{" "}
                    →
                  </Link>
                )}
            </div>
          </header>
          <ErrorBox error={error} />
          <div className="public-sections">
            {(profile.pagina?.mostrar_como_funciona ?? true) && (
              <section
                className="how-it-works"
                style={{
                  order:
                    profile.pagina?.ordem_secoes.indexOf("como_funciona") ?? 1,
                }}
              >
                <div className="public-section-heading">
                  <div>
                    <span>PASSO A PASSO</span>
                    <h2>Como funciona</h2>
                  </div>
                </div>
                <div className="how-grid">
                  {[
                    [
                      "01",
                      "Agende",
                      "Escolha o melhor momento para levar seu equipamento.",
                    ],
                    [
                      "02",
                      "Entregue",
                      "A equipe registra o estado e inicia a avaliação.",
                    ],
                    [
                      "03",
                      "Acompanhe",
                      "Consulte o reparo e o orçamento online.",
                    ],
                    [
                      "04",
                      "Retire",
                      "Receba o equipamento pronto e com histórico.",
                    ],
                  ].map(([number, title, text]) => (
                    <article key={number}>
                      <b>{number}</b>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {(profile.pagina?.mostrar_servicos ?? true) &&
              profile.servicos.length > 0 && (
                <section
                  className="public-services"
                  style={{
                    order:
                      profile.pagina?.ordem_secoes.indexOf("servicos") ?? 2,
                  }}
                >
                  <div className="public-section-heading">
                    <div>
                      <span>ESPECIALIDADES</span>
                      <h2>Serviços</h2>
                    </div>
                    <p>Atendimentos realizados pela equipe.</p>
                  </div>
                  <div className="services-showcase">
                    {profile.servicos
                      .filter(
                        (item) =>
                          !profile.pagina?.servicos_destaque.length ||
                          profile.pagina.servicos_destaque.includes(item.id),
                      )
                      .slice(0, profile.pagina?.limite_servicos || 6)
                      .map((item) => (
                        <article key={item.id}>
                          <span>◇</span>
                          <h3>{item.nome}</h3>
                          {item.descricao && <p>{item.descricao}</p>}
                          <small>Em média, {item.duracao} minutos</small>
                        </article>
                      ))}
                  </div>
                </section>
              )}
            {(profile.pagina?.mostrar_vitrine ?? true) &&
              !!(showcase.produtos.length || showcase.seminovos.length) && (
                <section
                  className="public-showcase"
                  style={{
                    order: profile.pagina?.ordem_secoes.indexOf("vitrine") ?? 3,
                  }}
                >
                  <div className="public-section-heading">
                    <div>
                      <span>LOJA DA ASSISTÊNCIA</span>
                      <h2>Produtos e aparelhos disponíveis</h2>
                    </div>
                    <p>Consulte a disponibilidade diretamente com a equipe.</p>
                  </div>
                  <div className="showcase-grid">
                    {[...showcase.produtos, ...showcase.seminovos].map(
                      (item) => {
                        const contact = (
                          showcase.whatsapp ||
                          profile.whatsapp ||
                          ""
                        ).replace(/\D/g, "");
                        return (
                          <article key={`${item.condicao}-${item.id}`}>
                            {item.foto ? (
                              <img src={item.foto} alt={item.nome} />
                            ) : (
                              <div
                                className="showcase-placeholder"
                                aria-hidden="true"
                              >
                                ◇
                              </div>
                            )}
                            <span>{item.condicao}</span>
                            <h3>{item.nome}</h3>
                            {item.descricao && <p>{item.descricao}</p>}
                            <strong>{money(item.preco)}</strong>
                            {contact && (
                              <a
                                className="primary"
                                target="_blank"
                                rel="noreferrer"
                                href={`https://wa.me/${contact}?text=${encodeURIComponent(`Olá! Tenho interesse em ${item.nome}, anunciado na página da ${profile.nome}.`)}`}
                              >
                                Tenho interesse ↗
                              </a>
                            )}
                          </article>
                        );
                      },
                    )}
                  </div>
                </section>
              )}
            {(profile.pagina?.mostrar_contato ?? true) && (
              <section
                className="public-contact"
                style={{
                  order: profile.pagina?.ordem_secoes.indexOf("contato") ?? 4,
                }}
              >
                <div className="public-section-heading">
                  <div>
                    <span>FALE COM A EQUIPE</span>
                    <h2>Contato</h2>
                  </div>
                </div>
                <div className="contact-grid">
                  <div>
                    {profile.pagina?.mostrar_whatsapp && profile.whatsapp && (
                      <a
                        className="primary"
                        href={`https://wa.me/${profile.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(profile.pagina?.whatsapp_mensagem || `Olá! Vim pela página da ${profile.nome}.`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Falar no WhatsApp ↗
                      </a>
                    )}
                    {profile.pagina?.mostrar_telefone && profile.telefone && (
                      <p>
                        <strong>Telefone</strong>
                        <br />
                        {profile.telefone}
                      </p>
                    )}
                    {profile.pagina?.mostrar_email && profile.email && (
                      <p>
                        <strong>E-mail</strong>
                        <br />
                        {profile.email}
                      </p>
                    )}
                    {profile.pagina?.mostrar_instagram && profile.instagram && (
                      <p>
                        <strong>Instagram</strong>
                        <br />
                        {profile.instagram}
                      </p>
                    )}
                  </div>
                  <div>
                    {profile.pagina?.mostrar_endereco && profile.endereco && (
                      <p>
                        <strong>Endereço</strong>
                        <br />
                        {profile.endereco}
                        {profile.cidade && ` · ${profile.cidade}`}
                        {profile.estado && `/${profile.estado}`}
                      </p>
                    )}
                    {profile.pagina?.mostrar_mapa && profile.google_maps && (
                      <a
                        className="outline"
                        href={profile.google_maps}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir no mapa ↗
                      </a>
                    )}
                    {profile.pagina?.mostrar_google_avaliacao &&
                      profile.google_avaliacao && (
                        <a
                          className="outline"
                          href={profile.google_avaliacao}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Avaliar no Google ↗
                        </a>
                      )}
                    {profile.pagina?.mostrar_horario && profile.horario && (
                      <details>
                        <summary>Horário de atendimento</summary>
                        {Object.entries(profile.horario).map(([day, hours]) => (
                          <p key={day}>
                            {
                              [
                                "Domingo",
                                "Segunda",
                                "Terça",
                                "Quarta",
                                "Quinta",
                                "Sexta",
                                "Sábado",
                              ][Number(day)]
                            }
                            : {hours[0]}–{hours[1]}
                          </p>
                        ))}
                      </details>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
          {done && receipt ? (
            <section className="panel">
              <h2>Solicitação recebida</h2>
              <p>
                OS #{receipt.numero}. A assistência analisará o problema
                informado.
              </p>
              <p>
                Guarde o link individual abaixo para consultar o reparo e
                responder ao orçamento.
              </p>
              <Link className="primary" href={`/acompanhar/${receipt.token}`}>
                Acompanhar reparo
              </Link>
              <details>
                <summary>Consultar com código e telefone</summary>
                <strong className="tracking-code">{receipt.codigo}</strong>
              </details>
            </section>
          ) : (profile.pagina?.mostrar_agendamento ?? true) ? (
            <form noValidate onSubmit={submit}>
              <div className="public-section-heading request-heading">
                <div>
                  <span>ATENDIMENTO</span>
                  <h2>Solicite uma avaliação</h2>
                </div>
                <p>Conte o que aconteceu com seu equipamento.</p>
              </div>
              <div className="step-navigation">
                {["Seus dados", "Equipamento", "Fotos e horário"].map(
                  (label, i) => (
                    <span
                      key={label}
                      className={step === i + 1 ? "active" : ""}
                    >
                      {i + 1}. {label}
                    </span>
                  ),
                )}
              </div>
              <fieldset disabled={busy || !!receipt}>
                <section className="panel" data-step="1" hidden={step !== 1}>
                  <h2>1. Seus dados</h2>
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        name="nome"
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      WhatsApp
                      <input
                        name="telefone"
                        type="tel"
                        required
                        autoComplete="tel"
                      />
                    </label>
                    <label>
                      E-mail (opcional)
                      <input
                        name="email"
                        type="email"
                        maxLength={200}
                        autoComplete="email"
                      />
                    </label>
                  </div>
                </section>
                <section className="panel" data-step="2" hidden={step !== 2}>
                  <h2>2. Equipamento e problema</h2>
                  <p>Selecione o tipo de equipamento</p>
                  <DeviceCategoryCards
                    value={device.categoria}
                    onChange={(categoria) =>
                      setDevice({
                        categoria,
                        tipo_personalizado: "",
                        marca: "",
                        modelo: "",
                        cor: "",
                      })
                    }
                  />
                  <DeviceFields
                    showCategory={false}
                    value={device}
                    onChange={setDevice}
                  />
                  <label>
                    Conte o que está acontecendo
                    <textarea
                      name="problema"
                      required
                      minLength={3}
                      maxLength={5000}
                      placeholder="Conte o que aconteceu e quando o problema começou."
                    />
                  </label>
                </section>
                <section className="panel" data-step="3" hidden={step !== 3}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={schedule}
                      onChange={(e) => setSchedule(e.target.checked)}
                    />
                    Quero escolher um horário para levar o equipamento
                  </label>
                  {schedule && (
                    <>
                      <div className="form-grid">
                        <label>
                          Serviço
                          <select
                            required
                            value={service}
                            onChange={(e) => setService(e.target.value)}
                          >
                            <option value="">Selecione</option>
                            {profile.servicos.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Dia
                          <input
                            required
                            type="date"
                            min={today()}
                            value={day}
                            onChange={(e) => setDay(e.target.value)}
                          />
                        </label>
                        <label>
                          Horário disponível
                          <select
                            required
                            value={slot}
                            onChange={(e) => setSlot(e.target.value)}
                          >
                            <option value="">
                              {slots.length
                                ? "Escolha um horário"
                                : "Nenhum horário disponível"}
                            </option>
                            {slots.map((s) => (
                              <option key={s} value={s}>
                                {time(s)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {profile.solicitar_endereco && (
                        <label>
                          Endereço
                          <input
                            name="endereco"
                            required
                            minLength={5}
                            maxLength={300}
                          />
                        </label>
                      )}
                    </>
                  )}
                </section>
              </fieldset>
              <section className="panel" data-step="3" hidden={step !== 3}>
                <PhotoPicker publicMode value={photos} onChange={setPhotos} />
                {profile.fotos_obrigatorias && (
                  <p>É necessária pelo menos uma foto.</p>
                )}
              </section>
              {receipt && (
                <p className="notice">
                  OS #{receipt.numero} criada. Conclua o envio das fotos abaixo.
                  Código: {receipt.codigo}
                </p>
              )}
              <div className="form-actions">
                {step > 1 && !receipt && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStep(step - 1)}
                  >
                    ← Voltar
                  </button>
                )}
                <button disabled={busy} className="primary">
                  {busy
                    ? "Enviando…"
                    : receipt
                      ? "Tentar envio das fotos novamente"
                      : step < 3
                        ? "Continuar →"
                        : "Solicitar atendimento"}
                </button>
              </div>
            </form>
          ) : null}
          <footer className="powered-by">
            <img
              className="brand-logo"
              src="/brand/horaria-logo.png"
              width="720"
              height="611"
              alt="Horária"
            />
            <span>Tecnologia Horária</span>
          </footer>
        </>
      )}
    </main>
  );
}
