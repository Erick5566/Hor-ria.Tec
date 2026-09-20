"use client";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  prazo_resposta_horas?: number;
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
  const router = useRouter();
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
    if (service)
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
  }, [service, day, slug]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!e.currentTarget.reportValidity()) return;
    if (!service) {
      setError("Selecione o serviço que você precisa.");
      return;
    }
    if (!slot) {
      setError("Selecione um horário disponível.");
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
          p_servico: service,
          p_inicio: slot,
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
      router.push(
        `/solicitacao-enviada/${created.token}?os=${encodeURIComponent(String(created.numero))}`,
      );
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
                <Link className="primary" href="#agendamento">
                  {profile.pagina?.botao_primario || "Agendar atendimento"} →
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
            <div className="public-trust-strip" aria-label="Compromissos de atendimento">
              <span>✓ Solicitação registrada na hora</span>
              <span>
                ◷ Retorno em até {profile.prazo_resposta_horas || 4}{" "}
                {profile.prazo_resposta_horas === 1 ? "hora útil" : "horas úteis"}
              </span>
              <span>▣ Acompanhamento online do reparo</span>
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
            <section className="public-faq">
              <div className="public-section-heading">
                <div>
                  <span>DÚVIDAS FREQUENTES</span>
                  <h2>Perguntas frequentes</h2>
                </div>
                <p>Informações rápidas antes de solicitar o atendimento.</p>
              </div>
              <div className="faq-list">
                <details>
                  <summary>Como funciona o atendimento?</summary>
                  <p>
                    Você envia os dados do equipamento e do problema. A
                    assistência registra a solicitação, analisa o aparelho e
                    mantém o andamento disponível para consulta.
                  </p>
                </details>
                <details>
                  <summary>Quando recebo uma resposta?</summary>
                  <p>
                    A solicitação é registrada imediatamente. A equipe informa
                    retorno em até {profile.prazo_resposta_horas || 4}{" "}
                    {profile.prazo_resposta_horas === 1
                      ? "hora útil"
                      : "horas úteis"} durante o horário de atendimento.
                  </p>
                </details>
                <details>
                  <summary>Posso acompanhar o reparo online?</summary>
                  <p>
                    Sim. Após a criação da ordem você recebe um link individual
                    para acompanhar etapas e informações liberadas pela equipe.
                  </p>
                </details>
                <details>
                  <summary>Preciso enviar foto do aparelho?</summary>
                  <p>
                    Quando a assistência solicitar, você poderá anexar fotos
                    para registrar o estado do equipamento e ajudar na
                    avaliação inicial.
                  </p>
                </details>
                <details>
                  <summary>O orçamento é aprovado automaticamente?</summary>
                  <p>
                    Não. Quando houver orçamento, a assistência poderá
                    disponibilizá-lo para sua análise antes da continuidade do
                    serviço.
                  </p>
                </details>
              </div>
            </section>
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
                    {profile.pagina?.mostrar_mapa &&
                      (profile.google_maps || profile.endereco) && (
                        <a
                          className="outline"
                          href={
                            profile.google_maps ||
                            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              [
                                profile.endereco,
                                profile.cidade,
                                profile.estado,
                              ]
                                .filter(Boolean)
                                .join(", "),
                            )}`
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Traçar rota no mapa ↗
                        </a>
                      )}
                    {profile.pagina?.mostrar_google_avaliacao &&
                      (profile.google_business || profile.google_avaliacao) && (
                        <div className="real-reviews-card">
                          <strong>Avaliações reais</strong>
                          <p>
                            Consulte a reputação desta assistência diretamente
                            no perfil oficial do Google.
                          </p>
                          <a
                            className="outline"
                            href={
                              profile.google_business ||
                              profile.google_avaliacao
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver avaliações no Google ↗
                          </a>
                          {profile.google_avaliacao && (
                            <a
                              href={profile.google_avaliacao}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Deixar uma avaliação ↗
                            </a>
                          )}
                        </div>
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
            <form
              id="agendamento"
              className="public-booking-modern"
              noValidate
              onSubmit={submit}
            >
              <div className="public-booking-title">
                <span>AGENDAMENTO ONLINE</span>
                <h2>Agende seu atendimento</h2>
                <p>
                  Escolha o aparelho, selecione o serviço e encontre o melhor
                  horário para você.
                </p>
              </div>

              <ErrorBox error={error} />

              <div className="public-booking-layout">
                <section className="public-booking-card">
                  <div className="booking-section-title">
                    <b>1</b>
                    <div>
                      <h3>Selecione seu aparelho</h3>
                      <p>Qual equipamento precisa de atendimento?</p>
                    </div>
                  </div>

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

                  <details className="booking-device-details">
                    <summary>Adicionar detalhes do aparelho</summary>
                    <DeviceFields
                      showCategory={false}
                      value={device}
                      onChange={setDevice}
                    />
                  </details>

                  <div className="booking-divider" />

                  <div className="booking-section-title">
                    <b>2</b>
                    <div>
                      <h3>Selecione o serviço</h3>
                      <p>Escolha o atendimento que você precisa.</p>
                    </div>
                  </div>

                  <div className="booking-service-grid">
                    {profile.servicos.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          service === item.id
                            ? "booking-service active"
                            : "booking-service"
                        }
                        onClick={() => setService(item.id)}
                      >
                        <span>◇</span>
                        <div>
                          <strong>{item.nome}</strong>
                          <small>Aproximadamente {item.duracao} min</small>
                        </div>
                        {service === item.id && <i>✓</i>}
                      </button>
                    ))}
                  </div>

                  <label className="booking-problem">
                    Conte o que está acontecendo
                    <textarea
                      name="problema"
                      required
                      minLength={3}
                      maxLength={5000}
                      placeholder="Ex.: aparelho não liga, tela quebrada, bateria descarregando rápido..."
                    />
                  </label>
                </section>

                <section className="public-booking-card booking-schedule-card">
                  <div className="booking-section-title">
                    <b>3</b>
                    <div>
                      <h3>Escolha a data e o horário</h3>
                      <p>
                        Veja os horários disponíveis para o serviço selecionado.
                      </p>
                    </div>
                  </div>

                  <label className="booking-date">
                    Data
                    <input
                      required
                      type="date"
                      min={today()}
                      value={day}
                      onChange={(e) => setDay(e.target.value)}
                    />
                  </label>

                  <div className="booking-time-area">
                    <span>Horários disponíveis</span>
                    {!service ? (
                      <p className="booking-helper">
                        Escolha um serviço para consultar os horários.
                      </p>
                    ) : slots.length ? (
                      <div className="booking-time-grid">
                        {slots.map((availableSlot) => (
                          <button
                            type="button"
                            key={availableSlot}
                            className={
                              slot === availableSlot
                                ? "booking-time active"
                                : "booking-time"
                            }
                            onClick={() => setSlot(availableSlot)}
                          >
                            {time(availableSlot)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="booking-helper">
                        Nenhum horário disponível nesta data.
                      </p>
                    )}
                  </div>

                  <div className="booking-divider" />

                  <div className="booking-client-title">
                    <h3>Seus dados</h3>
                    <p>
                      Usaremos essas informações para confirmar o atendimento.
                    </p>
                  </div>

                  <div className="booking-client-grid">
                    <label>
                      Nome completo
                      <input
                        name="nome"
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        placeholder="Ex.: João Silva"
                      />
                    </label>

                    <label>
                      WhatsApp
                      <input
                        name="telefone"
                        type="tel"
                        required
                        pattern={"[+0-9 \\(\\)\\-]{8,25}"}
                        maxLength={25}
                        autoComplete="tel"
                        placeholder="(75) 99999-9999"
                      />
                    </label>
                  </div>

                  <label>
                    E-mail <span className="optional">opcional</span>
                    <input
                      name="email"
                      type="email"
                      maxLength={200}
                      autoComplete="email"
                      placeholder="voce@email.com"
                    />
                  </label>

                  {profile.solicitar_endereco && (
                    <label>
                      Endereço
                      <input
                        name="endereco"
                        required
                        minLength={5}
                        maxLength={300}
                        placeholder="Rua, número e bairro"
                      />
                    </label>
                  )}

                  <details className="booking-photo-details">
                    <summary>
                      Adicionar foto do aparelho
                      {profile.fotos_obrigatorias ? " · obrigatório" : ""}
                    </summary>
                    <PhotoPicker
                      publicMode
                      value={photos}
                      onChange={setPhotos}
                    />
                  </details>

                  {receipt && (
                    <p className="notice">
                      OS #{receipt.numero} criada. Conclua o envio das fotos.
                      Código: {receipt.codigo}
                    </p>
                  )}

                  <button
                    disabled={busy || !service || !slot}
                    className="primary booking-confirm"
                  >
                    {busy
                      ? "Confirmando…"
                      : receipt
                        ? "Tentar envio das fotos novamente"
                        : "Confirmar agendamento →"}
                  </button>

                  <div className="booking-security">
                    <span>✓ Solicitação registrada na hora</span>
                    <span>◷ Confirmação pelo WhatsApp</span>
                  </div>
                </section>
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
            <Link href="/privacidade">Privacidade</Link>
          </footer>
        </>
      )}
    </main>
  );
}
