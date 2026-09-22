"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { preparePhoto } from "@/lib/photos";
import { message, Servico, supabase } from "@/lib/supabase";
import { ErrorBox } from "./ui";
import { useWorkspace } from "./workspace";

type Config = {
  empresa_id: string;
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
  filtro_vitrine: "todos" | "seminovos" | "acessorios" | "destaques";
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
  cor_destaque: string;
  cor_fundo: string;
  cor_texto: string;
  preset: string;
  ordem_secoes: string[];
};

const defaults = {
  primary: "#06141B",
  secondary: "#253745",
  button: "#11212D",
  accent: "#4A5C6A",
  background: "#CCD0CF",
  text: "#06141B",
  theme: "claro" as const,
};
const presets = {
  minimalista: {
    primary: "#11212D",
    secondary: "#9BA8AB",
    button: "#06141B",
    accent: "#4A5C6A",
    background: "#F7F8F8",
    text: "#06141B",
    theme: "claro",
  },
  escuro: {
    primary: "#06141B",
    secondary: "#253745",
    button: "#CCD0CF",
    accent: "#9BA8AB",
    background: "#06141B",
    text: "#F7F8F8",
    theme: "escuro",
  },
  elegante: defaults,
  tecnologico: {
    primary: "#06141B",
    secondary: "#11212D",
    button: "#253745",
    accent: "#9BA8AB",
    background: "#E6E9E8",
    text: "#06141B",
    theme: "claro",
  },
  claro: {
    primary: "#253745",
    secondary: "#9BA8AB",
    button: "#11212D",
    accent: "#4A5C6A",
    background: "#FFFFFF",
    text: "#06141B",
    theme: "claro",
  },
  premium: {
    primary: "#06141B",
    secondary: "#11212D",
    button: "#06141B",
    accent: "#8A7650",
    background: "#ECEBE7",
    text: "#06141B",
    theme: "claro",
  },
} as const;
const sectionNames: Record<string, string> = {
  hero: "Apresentação",
  como_funciona: "Como funciona",
  servicos: "Serviços",
  vitrine: "Vitrine",
  contato: "Contato",
};
function luminance(hex: string) {
  const parts = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function readable(background: string) {
  return contrast(background, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#06141B";
}

const reservedSlugs = [
  "painel",
  "agendar",
  "acompanhar",
  "api",
  "admin",
  "login",
  "dashboard",
  "suporte",
  "horaria",
  "entrar",
  "cadastro",
  "manutencao",
  "conta-bloqueada",
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/-$/g, "");
}

type SlugCheck = {
  disponivel: boolean;
  sugestao?: string | null;
  motivo?: string | null;
};

type CepLookup = {
  found: boolean;
  bairro?: string;
  cidade?: string;
  estado?: string;
};

export default function PublicPageSettings() {
  const { empresa, access, refresh, userId } = useWorkspace();
  const canManage = ["OWNER", "ADMIN"].includes(access.company?.role || "");
  const [config, setConfig] = useState<Config | null>(null),
    [services, setServices] = useState<Servico[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop"),
    [slugManuallyEdited, setSlugManuallyEdited] = useState(
      Boolean(empresa.slug && empresa.slug !== slugify(empresa.nome)),
    ),
    [slugState, setSlugState] = useState<
      "idle" | "checking" | "available" | "taken" | "invalid"
    >("idle"),
    [slugSuggestion, setSlugSuggestion] = useState(""),
    [sameWhatsapp, setSameWhatsapp] = useState(
      !empresa.whatsapp || empresa.whatsapp === empresa.telefone,
    ),
    [autoAddressFields, setAutoAddressFields] = useState<string[]>([]),
    [cepLoading, setCepLoading] = useState(false);
  const [hours, setHours] = useState<Record<string, [string, string]>>(
    empresa.horario,
  );
  const [identity, setIdentity] = useState({
    nome: empresa.nome,
    slug: empresa.slug,
    logo: empresa.logo_url || "",
    slogan: empresa.slogan || "",
    descricao: empresa.descricao_publica || "",
    telefone: empresa.telefone || "",
    whatsapp: empresa.whatsapp || "",
    email: empresa.email_publico || "",
    instagram: empresa.instagram || "",
    site: empresa.site || "",
    documento: empresa.documento || "",
    endereco: empresa.endereco || "",
    numero: empresa.numero_endereco || "",
    complemento: empresa.complemento || "",
    bairro: empresa.bairro || "",
    cidade: empresa.cidade || "",
    estado: empresa.estado || "",
    cep: empresa.cep || "",
    maps: empresa.google_maps_url || "",
    business: empresa.google_business_url || "",
    review: empresa.google_avaliacao_url || "",
    primary: empresa.cor_primaria || defaults.primary,
    secondary: empresa.cor_secundaria || defaults.secondary,
    button: empresa.cor_botao || defaults.button,
    theme: empresa.tema_publico || defaults.theme,
  });

  const checkSlugAvailability = useCallback(
    async (slug: string) => {
      if (!supabase) throw new Error("Serviço de validação indisponível.");
      const result = await supabase.rpc("verificar_slug_pagina", {
        p_slug: slug,
        p_empresa: empresa.id,
      });
      if (result.error) throw result.error;
      return result.data as SlugCheck;
    },
    [empresa.id],
  );

  useEffect(() => {
    if (!canManage) return;
    Promise.all([
      supabase!
        .from("pagina_publica_config")
        .select("*")
        .eq("empresa_id", empresa.id)
        .single(),
      supabase!
        .from("servicos")
        .select("*")
        .eq("empresa_id", empresa.id)
        .eq("ativo", true)
        .order("nome"),
    ]).then(([page, catalog]) => {
      if (page.error) setError(message(page.error));
      else setConfig(page.data as Config);
      if (catalog.error) setError(message(catalog.error));
      else setServices(catalog.data as Servico[]);
    });
  }, [canManage, empresa.id]);

  useEffect(() => {
    const slug = identity.slug.trim();
    setSlugSuggestion("");

    if (!slug) {
      setSlugState("idle");
      return;
    }

    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      reservedSlugs.includes(slug)
    ) {
      setSlugState("invalid");
      return;
    }

    let active = true;
    setSlugState("checking");
    const timer = window.setTimeout(() => {
      void checkSlugAvailability(slug)
        .then((result) => {
          if (!active) return;
          setSlugState(result.disponivel ? "available" : "taken");
          setSlugSuggestion(result.sugestao || "");
        })
        .catch(() => {
          if (active) setSlugState("idle");
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [identity.slug, checkSlugAvailability]);

  useEffect(() => {
    const cep = identity.cep.replace(/\D/g, "");
    setAutoAddressFields([]);

    if (cep.length !== 8) {
      setCepLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCepLoading(true);
      void fetch(`/api/cep/${cep}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as CepLookup;
        })
        .then((data) => {
          if (!data?.found) return;
          const filled: string[] = [];
          if (data.bairro) filled.push("bairro");
          if (data.cidade) filled.push("cidade");
          if (data.estado) filled.push("estado");

          setIdentity((current) => ({
            ...current,
            bairro: data.bairro || current.bairro,
            cidade: data.cidade || current.cidade,
            estado: data.estado || current.estado,
          }));
          setAutoAddressFields(filled);
        })
        .catch(() => {
          // Falha de CEP não bloqueia o preenchimento manual do formulário.
        })
        .finally(() => {
          if (!controller.signal.aborted) setCepLoading(false);
        });
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [identity.cep]);

  const publicUrl =
    typeof location === "undefined"
      ? `/${identity.slug}`
      : `${location.origin}/${identity.slug}`;
  const shownServices = useMemo(() => {
    const selected = config?.servicos_destaque.length
      ? services.filter((item) => config.servicos_destaque.includes(item.id))
      : services;
    return selected.slice(0, config?.limite_servicos || 6);
  }, [config, services]);
  const profileStatus = useMemo(() => {
    const addressComplete =
      Boolean(identity.endereco.trim()) &&
      Boolean(identity.numero.trim()) &&
      Boolean(identity.bairro.trim()) &&
      Boolean(identity.cidade.trim()) &&
      Boolean(identity.estado.trim()) &&
      identity.cep.replace(/\D/g, "").length === 8;

    const items = [
      { label: "Nome", complete: Boolean(identity.nome.trim()) },
      {
        label: "Descrição curta",
        complete: Boolean(identity.descricao.trim()),
      },
      {
        label: "Telefone/WhatsApp",
        complete: Boolean(identity.telefone.trim() || identity.whatsapp.trim()),
      },
      { label: "Endereço completo", complete: addressComplete },
      { label: "Logo", complete: Boolean(identity.logo) },
      { label: "1 serviço cadastrado", complete: services.length > 0 },
    ];
    const completed = items.filter((item) => item.complete).length;
    return {
      percent: Math.round((completed / items.length) * 100),
      missing: items.filter((item) => !item.complete).map((item) => item.label),
    };
  }, [identity, services.length]);
  if (!canManage)
    return (
      <section className="panel">
        <h2>Acesso restrito</h2>
        <p>
          Somente proprietários e administradores podem personalizar a página
          pública.
        </p>
      </section>
    );
  if (!config)
    return (
      <section className="panel">
        <ErrorBox error={error} />
        <p>Carregando configurações da página…</p>
      </section>
    );
  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
  }
  function setColor(
    key: "primary" | "secondary" | "button" | "accent" | "background" | "text",
    value: string,
  ) {
    if (key === "accent") set("cor_destaque", value);
    else if (key === "background") set("cor_fundo", value);
    else if (key === "text") set("cor_texto", value);
    else setIdentity({ ...identity, [key]: value });
    set("preset", "personalizado");
  }
  async function uploadLogo(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
      const path = `${empresa.id}/logo-${Date.now()}.jpg`;
      const result = await supabase!.storage
        .from("logos-empresas")
        .upload(path, prepared, { contentType: "image/jpeg" });
      if (result.error) throw result.error;
      const url = supabase!.storage.from("logos-empresas").getPublicUrl(path)
        .data.publicUrl;
      setIdentity({ ...identity, logo: url });
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setUploading(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!config) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity.slug) ||
        reservedSlugs.includes(identity.slug)
      )
        throw new Error(
          "Escolha uma URL com letras minúsculas, números e hífens, sem usar uma rota reservada.",
        );

      const availability = await checkSlugAvailability(identity.slug);
      if (!availability.disponivel) {
        setSlugState("taken");
        setSlugSuggestion(availability.sugestao || "");
        throw new Error(
          availability.sugestao
            ? `Essa URL já está em uso. Tente /${availability.sugestao}.`
            : "Essa URL já está em uso. Escolha outra URL.",
        );
      }
      setSlugState("available");
      setSlugSuggestion("");

      const textColor =
        contrast(config.cor_fundo, config.cor_texto) >= 4.5
          ? config.cor_texto
          : readable(config.cor_fundo);
      const company = await supabase!
        .from("empresas")
        .update({
          nome: identity.nome,
          slug: identity.slug,
          logo_url: identity.logo || null,
          slogan: identity.slogan || null,
          descricao_publica: identity.descricao || null,
          telefone: identity.telefone || null,
          whatsapp: identity.whatsapp || null,
          email_publico: identity.email || null,
          instagram: identity.instagram || null,
          site: identity.site || null,
          documento: identity.documento || null,
          endereco: identity.endereco || null,
          numero_endereco: identity.numero || null,
          complemento: identity.complemento || null,
          bairro: identity.bairro || null,
          cidade: identity.cidade || null,
          estado: identity.estado || null,
          cep: identity.cep || null,
          google_maps_url: identity.maps || null,
          google_business_url: identity.business || null,
          google_avaliacao_url: identity.review || null,
          cor_primaria: identity.primary,
          cor_secundaria: identity.secondary,
          cor_botao: identity.button,
          tema_publico: identity.theme,
          horario: hours,
        })
        .eq("id", empresa.id)
        .select("id")
        .single();
      if (company.error) throw company.error;
      const page = await supabase!
        .from("pagina_publica_config")
        .update({
          ...config,
          cor_texto: textColor,
          atualizado_em: new Date().toISOString(),
          atualizado_por: userId,
        })
        .eq("empresa_id", empresa.id)
        .select("empresa_id")
        .single();
      if (page.error) throw page.error;
      set("cor_texto", textColor);
      await refresh();
      setNotice("Alterações salvas. A página pública já foi atualizada.");
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  function applyPreset(name: keyof typeof presets) {
    if (!config) return;
    const value = presets[name];
    setIdentity({
      ...identity,
      primary: value.primary,
      secondary: value.secondary,
      button: value.button,
      theme: value.theme as "claro" | "escuro",
    });
    setConfig({
      ...config,
      cor_destaque: value.accent,
      cor_fundo: value.background,
      cor_texto: value.text,
      preset: name,
    });
  }
  function moveSection(index: number, direction: -1 | 1) {
    if (!config) return;
    const target = index + direction;
    if (target < 0 || target >= config.ordem_secoes.length) return;
    const next = [...config.ordem_secoes];
    [next[index], next[target]] = [next[target], next[index]];
    set("ordem_secoes", next);
  }
  return (
    <form className="public-page-editor" onSubmit={save}>
      <ErrorBox error={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel public-page-intro">
        <div>
          <span className="eyebrow">IDENTIDADE DA ASSISTÊNCIA</span>
          <h2>Minha página</h2>
          <p>
            Personalize o que seus clientes verão em celulares e computadores.
          </p>
          <div className="profile-progress" aria-label={`Perfil ${profileStatus.percent}% completo`}>
            <strong>Perfil {profileStatus.percent}% completo</strong>
            <div className="profile-progress-track" aria-hidden="true">
              <span style={{ width: `${profileStatus.percent}%` }} />
            </div>
            <small>
              {profileStatus.missing.length
                ? `Falta: ${profileStatus.missing.join(", ")}`
                : "Campos essenciais completos."}
            </small>
          </div>
        </div>
        <div className="inline-actions">
          <button
            type="button"
            onClick={async () => {
              if (navigator.share)
                await navigator.share({ title: identity.nome, url: publicUrl });
              else {
                await navigator.clipboard.writeText(publicUrl);
                setNotice("Link copiado.");
              }
            }}
          >
            Compartilhar página
          </button>
          <a
            className="outline"
            href={`/${identity.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Visualizar página ↗
          </a>
        </div>
      </section>
      <div className="public-editor-layout">
        <div>
          <section className="panel">
            <h2>Dados principais</h2>
            <div className="form-grid">
              <label>
                Nome da assistência
                <input
                  value={identity.nome}
                  required
                  maxLength={100}
                  onChange={(e) => {
                    const nome = e.target.value;
                    setIdentity((current) => ({
                      ...current,
                      nome,
                      ...(!slugManuallyEdited ? { slug: slugify(nome) } : {}),
                    }));
                  }}
                />
              </label>
              <label>
                URL da página
                <div className="input-prefix slug-input">
                  <span>/</span>
                  <input
                    value={identity.slug}
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    onFocus={() => setSlugManuallyEdited(true)}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setIdentity((current) => ({
                        ...current,
                        slug: slugify(e.target.value),
                      }));
                    }}
                  />
                  {slugState === "available" &&
                    !slugManuallyEdited &&
                    identity.slug === slugify(identity.nome) && (
                      <span
                        className="slug-status-icon"
                        title="URL disponível e sincronizada com o nome"
                        aria-label="URL disponível e sincronizada com o nome"
                      >
                        ✓
                      </span>
                    )}
                </div>
                <div className="slug-feedback" aria-live="polite">
                  {slugState === "checking" && <small>Verificando disponibilidade…</small>}
                  {slugState === "available" && <small className="available">URL disponível</small>}
                  {slugState === "invalid" && (
                    <small>Use letras minúsculas, números e hífens.</small>
                  )}
                  {slugState === "taken" && (
                    <small className="unavailable">
                      Essa URL já está em uso.
                      {slugSuggestion && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => {
                              setSlugManuallyEdited(true);
                              setIdentity((current) => ({
                                ...current,
                                slug: slugSuggestion,
                              }));
                            }}
                          >
                            Usar /{slugSuggestion}
                          </button>
                        </>
                      )}
                    </small>
                  )}
                </div>
              </label>
              <label>
                Slogan
                <input
                  value={identity.slogan}
                  maxLength={140}
                  onChange={(e) =>
                    setIdentity({ ...identity, slogan: e.target.value })
                  }
                />
              </label>
              <label>
                CPF ou CNPJ
                <input
                  value={identity.documento}
                  onChange={(e) =>
                    setIdentity({ ...identity, documento: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Descrição curta
              <textarea
                value={identity.descricao}
                placeholder="Consertos rápidos e com garantia, do jeito que seu aparelho merece"
                maxLength={1000}
                onChange={(e) =>
                  setIdentity({ ...identity, descricao: e.target.value })
                }
              />
            </label>
            <div className="copy-line">
              <code>{publicUrl}</code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(publicUrl);
                  setNotice("Link copiado.");
                }}
              >
                Copiar link
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>Logo da assistência</h2>
            <div className="logo-editor">
              <div className="logo-preview">
                {identity.logo ? (
                  <img src={identity.logo} alt="Prévia da logo" />
                ) : (
                  <strong>{identity.nome.slice(0, 2).toUpperCase()}</strong>
                )}
              </div>
              <div>
                <p>
                  A marca da assistência terá destaque; a Horária aparecerá
                  apenas no rodapé.
                </p>
                <div className="inline-actions">
                  <label className="outline file-action">
                    {uploading
                      ? "Enviando…"
                      : identity.logo
                        ? "Trocar imagem"
                        : "Enviar logo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploading}
                      onChange={(e) => {
                        void uploadLogo(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {identity.logo && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("Remover a imagem da página pública?")) return;
                        setIdentity({ ...identity, logo: "" });
                      }}
                    >
                      Remover imagem
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Hero da página</h2>
            <label>
              Título principal
              <input
                value={config.headline}
                maxLength={120}
                onChange={(e) => set("headline", e.target.value)}
              />
            </label>
            <label>
              Subtítulo
              <textarea
                value={config.subheadline}
                maxLength={300}
                onChange={(e) => set("subheadline", e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                Botão principal
                <input
                  value={config.botao_primario}
                  maxLength={40}
                  onChange={(e) => set("botao_primario", e.target.value)}
                />
              </label>
              <label>
                Botão secundário
                <input
                  value={config.botao_secundario}
                  maxLength={40}
                  onChange={(e) => set("botao_secundario", e.target.value)}
                />
              </label>
            </div>
            <Toggle
              label="Mostrar botão secundário"
              checked={config.mostrar_botao_secundario}
              onChange={(v) => set("mostrar_botao_secundario", v)}
            />
          </section>
          <section className="panel">
            <h2>Contato e localização</h2>
            <div className="form-grid">
              <Field
                label="Telefone"
                value={identity.telefone}
                onChange={(v) =>
                  setIdentity((current) => ({
                    ...current,
                    telefone: v,
                    whatsapp: sameWhatsapp ? v : current.whatsapp,
                  }))
                }
              />
              <Field
                label="WhatsApp"
                value={identity.whatsapp}
                disabled={sameWhatsapp}
                onChange={(v) =>
                  setIdentity((current) => ({ ...current, whatsapp: v }))
                }
              />
              <label className="check-label same-whatsapp-field">
                <input
                  type="checkbox"
                  checked={sameWhatsapp}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSameWhatsapp(checked);
                    if (checked) {
                      setIdentity((current) => ({
                        ...current,
                        whatsapp: current.telefone,
                      }));
                    }
                  }}
                />
                Usar o mesmo número no WhatsApp
              </label>
              <Field
                label="E-mail"
                type="email"
                value={identity.email}
                onChange={(v) => setIdentity({ ...identity, email: v })}
              />
              <Field
                label="Instagram"
                value={identity.instagram}
                onChange={(v) => setIdentity({ ...identity, instagram: v })}
              />
              <Field
                label="Site"
                type="url"
                value={identity.site}
                onChange={(v) => setIdentity({ ...identity, site: v })}
              />
              <Field
                label="Endereço"
                value={identity.endereco}
                onChange={(v) => setIdentity({ ...identity, endereco: v })}
              />
              <Field
                label="Número"
                value={identity.numero}
                onChange={(v) => setIdentity({ ...identity, numero: v })}
              />
              <Field
                label="Complemento"
                value={identity.complemento}
                onChange={(v) => setIdentity({ ...identity, complemento: v })}
              />
              <Field
                label="Bairro"
                value={identity.bairro}
                autoFilled={autoAddressFields.includes("bairro")}
                onChange={(v) => {
                  setAutoAddressFields((current) =>
                    current.filter((field) => field !== "bairro"),
                  );
                  setIdentity((current) => ({ ...current, bairro: v }));
                }}
              />
              <Field
                label="Cidade"
                value={identity.cidade}
                autoFilled={autoAddressFields.includes("cidade")}
                onChange={(v) => {
                  setAutoAddressFields((current) =>
                    current.filter((field) => field !== "cidade"),
                  );
                  setIdentity((current) => ({ ...current, cidade: v }));
                }}
              />
              <Field
                label="Estado"
                value={identity.estado}
                autoFilled={autoAddressFields.includes("estado")}
                onChange={(v) => {
                  setAutoAddressFields((current) =>
                    current.filter((field) => field !== "estado"),
                  );
                  setIdentity((current) => ({
                    ...current,
                    estado: v.toUpperCase().slice(0, 2),
                  }));
                }}
              />
              <Field
                label="CEP"
                value={identity.cep}
                inputMode="numeric"
                maxLength={9}
                helper={cepLoading ? "Buscando endereço…" : undefined}
                onChange={(v) =>
                  setIdentity((current) => ({ ...current, cep: v }))
                }
              />
              <Field
                label="Google Maps"
                type="url"
                value={identity.maps}
                onChange={(v) => setIdentity({ ...identity, maps: v })}
              />
              <Field
                label="Google Meu Negócio"
                type="url"
                value={identity.business}
                onChange={(v) => setIdentity({ ...identity, business: v })}
              />
              <Field
                label="Link de avaliação"
                type="url"
                value={identity.review}
                onChange={(v) => setIdentity({ ...identity, review: v })}
              />
            </div>
            <label>
              Mensagem inicial do WhatsApp
              <textarea
                value={config.whatsapp_mensagem}
                maxLength={300}
                onChange={(e) => set("whatsapp_mensagem", e.target.value)}
              />
            </label>
            <h3>Horário de funcionamento</h3>
            {[
              "Domingo",
              "Segunda",
              "Terça",
              "Quarta",
              "Quinta",
              "Sexta",
              "Sábado",
            ].map((name, index) => (
              <div className="hour-row" key={name}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={!!hours[index]}
                    onChange={(event) => {
                      const next = { ...hours };
                      if (event.target.checked)
                        next[index] = ["09:00", "18:00"];
                      else delete next[index];
                      setHours(next);
                    }}
                  />
                  {name}
                </label>
                {hours[index] && (
                  <>
                    <input
                      aria-label={`Abertura ${name}`}
                      type="time"
                      step={900}
                      value={hours[index][0]}
                      onChange={(event) =>
                        setHours({
                          ...hours,
                          [index]: [event.target.value, hours[index][1]],
                        })
                      }
                    />
                    <span>até</span>
                    <input
                      aria-label={`Fechamento ${name}`}
                      type="time"
                      step={900}
                      value={hours[index][1]}
                      onChange={(event) =>
                        setHours({
                          ...hours,
                          [index]: [hours[index][0], event.target.value],
                        })
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Aparência</h2>
            <div className="preset-grid">
              {Object.keys(presets).map((name) => (
                <button
                  type="button"
                  className={config.preset === name ? "selected" : ""}
                  key={name}
                  onClick={() => applyPreset(name as keyof typeof presets)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="color-grid">
              <ColorField
                label="Principal"
                value={identity.primary}
                onChange={(v) => setColor("primary", v)}
              />
              <ColorField
                label="Secundária"
                value={identity.secondary}
                onChange={(v) => setColor("secondary", v)}
              />
              <ColorField
                label="Botões"
                value={identity.button}
                onChange={(v) => setColor("button", v)}
              />
              <ColorField
                label="Destaque"
                value={config.cor_destaque}
                onChange={(v) => setColor("accent", v)}
              />
              <ColorField
                label="Fundo"
                value={config.cor_fundo}
                onChange={(v) => setColor("background", v)}
              />
              <ColorField
                label="Textos"
                value={config.cor_texto}
                onChange={(v) => setColor("text", v)}
              />
            </div>
            <label>
              Tema
              <select
                value={identity.theme}
                onChange={(e) =>
                  setIdentity({
                    ...identity,
                    theme: e.target.value as "claro" | "escuro",
                  })
                }
              >
                <option value="claro">Claro</option>
                <option value="escuro">Escuro</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm("Restaurar apenas as cores e o tema padrão?")
                ) {
                  applyPreset("elegante");
                  setNotice(
                    "Visual padrão restaurado no preview. Salve para publicar.",
                  );
                }
              }}
            >
              Restaurar visual padrão
            </button>
          </section>
          <section className="panel">
            <h2>Conteúdo e visibilidade</h2>
            <div className="toggle-grid">
              <Toggle
                label="Mostrar agendamento"
                checked={config.mostrar_agendamento}
                onChange={(v) => set("mostrar_agendamento", v)}
              />
              <Toggle
                label="Mostrar acompanhamento"
                checked={config.mostrar_acompanhamento}
                onChange={(v) => set("mostrar_acompanhamento", v)}
              />
              <Toggle
                label="Mostrar serviços"
                checked={config.mostrar_servicos}
                onChange={(v) => set("mostrar_servicos", v)}
              />
              <Toggle
                label="Mostrar como funciona"
                checked={config.mostrar_como_funciona}
                onChange={(v) => set("mostrar_como_funciona", v)}
              />
              <Toggle
                label="Mostrar vitrine"
                checked={config.mostrar_vitrine}
                onChange={(v) => set("mostrar_vitrine", v)}
              />
              <Toggle
                label="Mostrar contato"
                checked={config.mostrar_contato}
                onChange={(v) => set("mostrar_contato", v)}
              />
            </div>
            <div className="form-grid">
              <label>
                Máximo de serviços
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={config.limite_servicos}
                  onChange={(e) =>
                    set("limite_servicos", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Conteúdo da vitrine
                <select
                  value={config.filtro_vitrine}
                  onChange={(e) =>
                    set(
                      "filtro_vitrine",
                      e.target.value as Config["filtro_vitrine"],
                    )
                  }
                >
                  <option value="todos">Produtos e seminovos</option>
                  <option value="seminovos">Somente seminovos</option>
                  <option value="acessorios">Somente acessórios</option>
                  <option value="destaques">Itens destacados</option>
                </select>
              </label>
            </div>
            <h3>Serviços destacados</h3>
            <div className="check-grid">
              {services.map((service) => (
                <label className="check-label" key={service.id}>
                  <input
                    type="checkbox"
                    checked={config.servicos_destaque.includes(service.id)}
                    onChange={(e) =>
                      set(
                        "servicos_destaque",
                        e.target.checked
                          ? [...config.servicos_destaque, service.id]
                          : config.servicos_destaque.filter(
                              (id) => id !== service.id,
                            ),
                      )
                    }
                  />
                  {service.nome}
                </label>
              ))}
            </div>
            <h3>Informações de contato</h3>
            <div className="toggle-grid">
              <Toggle
                label="WhatsApp"
                checked={config.mostrar_whatsapp}
                onChange={(v) => set("mostrar_whatsapp", v)}
              />
              <Toggle
                label="Telefone"
                checked={config.mostrar_telefone}
                onChange={(v) => set("mostrar_telefone", v)}
              />
              <Toggle
                label="Instagram"
                checked={config.mostrar_instagram}
                onChange={(v) => set("mostrar_instagram", v)}
              />
              <Toggle
                label="E-mail"
                checked={config.mostrar_email}
                onChange={(v) => set("mostrar_email", v)}
              />
              <Toggle
                label="Endereço"
                checked={config.mostrar_endereco}
                onChange={(v) => set("mostrar_endereco", v)}
              />
              <Toggle
                label="Mapa"
                checked={config.mostrar_mapa}
                onChange={(v) => set("mostrar_mapa", v)}
              />
              <Toggle
                label="Horário"
                checked={config.mostrar_horario}
                onChange={(v) => set("mostrar_horario", v)}
              />
              <Toggle
                label="Avaliação Google"
                checked={config.mostrar_google_avaliacao}
                onChange={(v) => set("mostrar_google_avaliacao", v)}
              />
            </div>
          </section>
          <section className="panel">
            <h2>Ordem das seções</h2>
            {config.ordem_secoes.map((section, index) => (
              <div className="section-order" key={section}>
                <span>
                  {index + 1}. {sectionNames[section] || section}
                </span>
                <div>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveSection(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === config.ordem_secoes.length - 1}
                    onClick={() => moveSection(index, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </section>
        </div>
        <aside className="preview-column">
          <div className="preview-toolbar">
            <strong>Pré-visualização</strong>
            <div>
              <button
                type="button"
                className={previewMode === "desktop" ? "selected" : ""}
                onClick={() => setPreviewMode("desktop")}
              >
                Desktop
              </button>
              <button
                type="button"
                className={previewMode === "mobile" ? "selected" : ""}
                onClick={() => setPreviewMode("mobile")}
              >
                Mobile
              </button>
            </div>
          </div>
          <div
            className={`live-page-preview ${previewMode}`}
            style={{
              background: config.cor_fundo,
              color: config.cor_texto,
              borderColor: identity.primary,
            }}
          >
            <div className="preview-brand">
              {identity.logo ? (
                <img src={identity.logo} alt="Logo" />
              ) : (
                <strong>{identity.nome.slice(0, 2).toUpperCase()}</strong>
              )}
            </div>
            <small>{identity.slogan}</small>
            <h2>{config.headline}</h2>
            <p>{config.subheadline}</p>
            <div className="preview-buttons">
              <span
                style={{
                  background: identity.button,
                  color: readable(identity.button),
                }}
              >
                {config.botao_primario}
              </span>
              {config.mostrar_botao_secundario && (
                <span className="preview-secondary">
                  {config.botao_secundario}
                </span>
              )}
            </div>
            {config.mostrar_como_funciona && (
              <div className="preview-steps">
                Agende <b>→</b> Entregue <b>→</b> Acompanhe <b>→</b> Retire
              </div>
            )}
            {config.mostrar_servicos && (
              <div className="preview-services">
                {shownServices.map((service) => (
                  <span
                    key={service.id}
                    style={{ borderColor: config.cor_destaque }}
                  >
                    {service.nome}
                  </span>
                ))}
              </div>
            )}
            <footer>Tecnologia Horária</footer>
          </div>
        </aside>
      </div>
      <div className="sticky-save">
        <span>{notice || "Confira o preview antes de publicar."}</span>
        <button className="primary" disabled={busy || uploading}>
          {busy ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check-label toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  autoFilled = false,
  helper,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  autoFilled?: boolean;
  helper?: string;
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search";
  maxLength?: number;
}) {
  return (
    <label>
      <span className="field-label-row">
        <span>{label}</span>
        {autoFilled && (
          <small className="auto-filled-note">⌖ preenchido automaticamente</small>
        )}
      </span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper && <small className="field-helper">{helper}</small>}
    </label>
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <div className="color-control">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <input
          value={value}
          pattern="#[0-9A-Fa-f]{6}"
          maxLength={7}
          onChange={(e) => {
            const value = e.target.value.toUpperCase();
            if (/^#[0-9A-F]{0,6}$/.test(value)) onChange(value);
          }}
        />
      </div>
    </label>
  );
}
