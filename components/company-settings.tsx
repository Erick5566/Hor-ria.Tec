"use client";
import { useMemo, useState } from "react";
import { preparePhoto } from "@/lib/photos";
import Link from "next/link";
import { useWorkspace } from "./workspace";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox } from "./ui";
const colorDefaults = {
  primary: "#06141B",
  secondary: "#253745",
  button: "#11212D",
};

const automaticMapsPrefix =
  "https://www.google.com/maps/search/?api=1&query=";

type CepLookup = {
  found: boolean;
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
};

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits;
}

function contrastWithWhite(hex: string) {
  const channels = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return 1.05 / (luminance + 0.05);
}
export default function CompanySettings() {
  const { empresa, refresh } = useWorkspace();
  const [hours, setHours] = useState<Record<string, [string, string]>>(
      empresa.horario,
    ),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [uploadingLogo, setUploadingLogo] = useState(false),
    [logoUrl, setLogoUrl] = useState(empresa.logo_url || ""),
    [theme, setTheme] = useState<"claro" | "escuro">(
      empresa.tema_publico || "claro",
    ),
    [colors, setColors] = useState<{
      primary: string | null;
      secondary: string | null;
      button: string | null;
    }>({
      primary: empresa.cor_primaria || null,
      secondary: empresa.cor_secundaria || null,
      button: empresa.cor_botao || null,
    }),
    [address, setAddress] = useState({
      cep: formatCep(empresa.cep || ""),
      // Migração compatível: o antigo campo livre empresas.endereco passa a
      // representar Rua/Logradouro, preservando qualquer endereço já salvo.
      rua: empresa.endereco || "",
      numero: empresa.numero_endereco || "",
      complemento: empresa.complemento || "",
      bairro: empresa.bairro || "",
      cidade: empresa.cidade || "",
      estado: empresa.estado || "",
    }),
    [cepStatus, setCepStatus] = useState<"idle" | "loading" | "filled">("idle"),
    [autoAddressFields, setAutoAddressFields] = useState<string[]>([]),
    [useCustomMapsLink, setUseCustomMapsLink] = useState(
      Boolean(
        empresa.google_maps_url &&
          !empresa.google_maps_url.startsWith(automaticMapsPrefix),
      ),
    ),
    [customMapsUrl, setCustomMapsUrl] = useState(
      empresa.google_maps_url &&
        !empresa.google_maps_url.startsWith(automaticMapsPrefix)
        ? empresa.google_maps_url
        : "",
    );

  const resolvedColors = {
    primary: colors.primary || colorDefaults.primary,
    secondary: colors.secondary || colorDefaults.secondary,
    button: colors.button || colorDefaults.button,
  };

  const completeAddress = useMemo(
    () =>
      [
        address.rua,
        address.numero,
        address.bairro,
        address.cidade,
        address.estado,
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", "),
    [address],
  );

  const generatedMapsUrl = useMemo(() => {
    const complete =
      Boolean(address.rua.trim()) &&
      Boolean(address.numero.trim()) &&
      Boolean(address.bairro.trim()) &&
      Boolean(address.cidade.trim()) &&
      Boolean(address.estado.trim());
    return complete
      ? `${automaticMapsPrefix}${encodeURIComponent(completeAddress)}`
      : "";
  }, [address, completeAddress]);

  async function lookupCep() {
    const cep = address.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;

    setCepStatus("loading");
    try {
      const response = await fetch(`/api/cep/${cep}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as CepLookup;
      if (!data.found) return;

      const filled: string[] = [];
      if (data.logradouro) filled.push("rua");
      if (data.bairro) filled.push("bairro");
      if (data.cidade) filled.push("cidade");
      if (data.estado) filled.push("estado");

      setAddress((current) => ({
        ...current,
        rua: data.logradouro || current.rua,
        bairro: data.bairro || current.bairro,
        cidade: data.cidade || current.cidade,
        estado: data.estado || current.estado,
      }));
      setAutoAddressFields(filled);
      setCepStatus("filled");
    } catch {
      // ViaCEP é apenas uma conveniência: falha de consulta não bloqueia o formulário.
      setCepStatus("idle");
    }
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    setUploadingLogo(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
      const path = `${empresa.id}/logo-${Date.now()}.jpg`;
      const upload = await supabase!.storage
        .from("logos-empresas")
        .upload(path, prepared, { contentType: "image/jpeg" });
      if (upload.error) throw upload.error;
      const publicUrl = supabase!.storage.from("logos-empresas").getPublicUrl(path)
        .data.publicUrl;
      setLogoUrl(publicUrl);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        const f = new FormData(e.currentTarget);
        try {
          if (
            Object.values(resolvedColors).some(
              (color) => contrastWithWhite(color) < 4.5,
            )
          )
            throw new Error(
              "Escolha cores com contraste suficiente para textos brancos.",
            );
          if (
            [
              "painel",
              "agendar",
              "acompanhar",
              "api",
              "admin",
              "entrar",
              "cadastro",
              "privacidade",
              "recuperar-senha",
              "redefinir-senha",
              "solicitacao-enviada",
              "manutencao",
              "conta-bloqueada",
            ].includes(
              String(f.get("slug")),
            )
          )
            throw new Error("Escolha outro endereço para a página pública.");
          const r = await supabase!
            .from("empresas")
            .update({
              nome: f.get("nome"),
              slug: f.get("slug"),
              telefone: f.get("telefone"),
              endereco: address.rua || null,
              descricao_publica: f.get("descricao"),
              documento: f.get("documento") || null,
              whatsapp: f.get("whatsapp") || null,
              email_publico: f.get("email_publico") || null,
              instagram: f.get("instagram") || null,
              site: f.get("site") || null,
              logo_url: logoUrl || null,
              google_avaliacao_url: f.get("google_avaliacao_url") || null,
              google_maps_url:
                (useCustomMapsLink ? customMapsUrl : generatedMapsUrl) || null,
              google_business_url: f.get("google_business_url") || null,
              cep: address.cep.replace(/\D/g, "") || null,
              numero_endereco: address.numero || null,
              complemento: address.complemento || null,
              bairro: address.bairro || null,
              cidade: address.cidade || null,
              estado: address.estado || null,
              cor_primaria: colors.primary,
              cor_secundaria: colors.secondary,
              cor_botao: colors.button,
              tema_publico: theme,
              prazo_resposta_horas: Number(f.get("prazo_resposta_horas") || 4),
              fotos_obrigatorias: f.get("fotos") === "on",
              solicitar_endereco: f.get("solicitar_endereco") === "on",
              horario: hours,
            })
            .eq("id", empresa.id)
            .select("id")
            .single();
          if (r.error) throw r.error;
          await refresh();
          setSaved(true);
        } catch (e) {
          setError(message(e as Error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorBox error={error} />
      {saved && <p role="status">Configurações salvas.</p>}
      <div className="form-grid">
        <label>
          Nome da assistência
          <input
            name="nome"
            required
            minLength={2}
            maxLength={100}
            defaultValue={empresa.nome}
          />
        </label>
        <label>
          Endereço da página pública
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            defaultValue={empresa.slug}
          />
        </label>
        <label>
          Telefone
          <input
            name="telefone"
            type="tel"
            defaultValue={empresa.telefone || ""}
          />
        </label>
        <label>
          WhatsApp
          <input
            name="whatsapp"
            type="tel"
            defaultValue={empresa.whatsapp || ""}
          />
        </label>
        <label>
          E-mail público
          <input
            name="email_publico"
            type="email"
            defaultValue={empresa.email_publico || ""}
          />
        </label>
        <label>
          CPF ou CNPJ
          <input name="documento" defaultValue={empresa.documento || ""} />
        </label>
        <label>
          Instagram
          <input
            name="instagram"
            defaultValue={empresa.instagram || ""}
            placeholder="@suaassistencia"
          />
        </label>
        <label>
          Site
          <input
            name="site"
            type="url"
            defaultValue={empresa.site || ""}
            placeholder="https://…"
          />
        </label>
        <div className="company-logo-setting">
          <span>Logo</span>
          <div className="company-logo-upload-row">
            {logoUrl && (
              <img
                className="company-logo-thumb"
                src={logoUrl}
                alt="Logo atual da assistência"
              />
            )}
            <label className="outline file-action">
              {uploadingLogo
                ? "Enviando…"
                : logoUrl
                  ? "Trocar logo"
                  : "Enviar logo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingLogo}
                onChange={(event) => {
                  void uploadLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                disabled={uploadingLogo}
              >
                Remover
              </button>
            )}
          </div>
          <small>
            O endereço do arquivo é salvo automaticamente e não precisa ser digitado.
          </small>
        </div>
        <label>
          Link de avaliação no Google
          <input
            name="google_avaliacao_url"
            type="url"
            defaultValue={empresa.google_avaliacao_url || ""}
            placeholder="https://g.page/r/…/review"
          />
        </label>
        <label>
          Link do perfil no Google
          <input
            name="google_business_url"
            type="url"
            defaultValue={empresa.google_business_url || ""}
            placeholder="https://g.page/…"
          />
        </label>
        <label className="company-maps-setting">
          Link do Google Maps / rota
          <div className="company-maps-row">
            <input
              type="url"
              readOnly={!useCustomMapsLink}
              value={useCustomMapsLink ? customMapsUrl : generatedMapsUrl}
              onChange={(event) => setCustomMapsUrl(event.target.value)}
              placeholder={
                useCustomMapsLink
                  ? "Cole o link exato do Google Maps"
                  : "Preencha o endereço completo para gerar o link"
              }
            />
            <button
              type="button"
              onClick={() => {
                if (useCustomMapsLink) {
                  setUseCustomMapsLink(false);
                } else {
                  setCustomMapsUrl(
                    empresa.google_maps_url &&
                      !empresa.google_maps_url.startsWith(automaticMapsPrefix)
                      ? empresa.google_maps_url
                      : generatedMapsUrl,
                  );
                  setUseCustomMapsLink(true);
                }
              }}
            >
              {useCustomMapsLink ? "Usar automático" : "Usar outro link"}
            </button>
            <button
              type="button"
              disabled={
                !(useCustomMapsLink ? customMapsUrl : generatedMapsUrl)
              }
              onClick={async () => {
                const value = useCustomMapsLink
                  ? customMapsUrl
                  : generatedMapsUrl;
                if (value) {
                  await navigator.clipboard.writeText(value);
                  setSaved(true);
                }
              }}
            >
              Copiar
            </button>
          </div>
          <small>
            {useCustomMapsLink
              ? "Link manual ativo."
              : "Gerado automaticamente a partir do endereço completo."}
          </small>
        </label>
      </div>
      <label>
        Apresentação pública
        <textarea
          name="descricao"
          maxLength={1000}
          defaultValue={empresa.descricao_publica || ""}
        />
      </label>
      <h2>Endereço completo</h2>
      <div className="form-grid company-address-grid">
        <label>
          CEP
          <input
            name="cep"
            inputMode="numeric"
            maxLength={9}
            value={address.cep}
            onChange={(event) => {
              setCepStatus("idle");
              setAutoAddressFields([]);
              setAddress((current) => ({
                ...current,
                cep: formatCep(event.target.value),
              }));
            }}
            onBlur={() => void lookupCep()}
          />
          {cepStatus === "loading" && (
            <small className="company-field-note">Buscando endereço…</small>
          )}
        </label>
        <label className="company-address-street">
          Rua / Logradouro
          <input
            name="endereco"
            maxLength={300}
            value={address.rua}
            onChange={(event) => {
              setAutoAddressFields((current) =>
                current.filter((field) => field !== "rua"),
              );
              setAddress((current) => ({
                ...current,
                rua: event.target.value,
              }));
            }}
          />
          {autoAddressFields.includes("rua") && (
            <small className="company-auto-note">
              ⌖ preenchido automaticamente
            </small>
          )}
        </label>
        <label>
          Número
          <input
            name="numero_endereco"
            value={address.numero}
            onChange={(event) =>
              setAddress((current) => ({
                ...current,
                numero: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Complemento
          <input
            name="complemento"
            value={address.complemento}
            onChange={(event) =>
              setAddress((current) => ({
                ...current,
                complemento: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Bairro
          <input
            name="bairro"
            value={address.bairro}
            onChange={(event) => {
              setAutoAddressFields((current) =>
                current.filter((field) => field !== "bairro"),
              );
              setAddress((current) => ({
                ...current,
                bairro: event.target.value,
              }));
            }}
          />
          {autoAddressFields.includes("bairro") && (
            <small className="company-auto-note">
              ⌖ preenchido automaticamente
            </small>
          )}
        </label>
        <label>
          Cidade
          <input
            name="cidade"
            value={address.cidade}
            onChange={(event) => {
              setAutoAddressFields((current) =>
                current.filter((field) => field !== "cidade"),
              );
              setAddress((current) => ({
                ...current,
                cidade: event.target.value,
              }));
            }}
          />
          {autoAddressFields.includes("cidade") && (
            <small className="company-auto-note">
              ⌖ preenchido automaticamente
            </small>
          )}
        </label>
        <label>
          Estado
          <input
            name="estado"
            maxLength={2}
            value={address.estado}
            onChange={(event) => {
              setAutoAddressFields((current) =>
                current.filter((field) => field !== "estado"),
              );
              setAddress((current) => ({
                ...current,
                estado: event.target.value.toUpperCase().slice(0, 2),
              }));
            }}
          />
          {autoAddressFields.includes("estado") && (
            <small className="company-auto-note">
              ⌖ preenchido automaticamente
            </small>
          )}
        </label>
      </div>
      <h2 id="aparencia">Aparência da página pública</h2>
      <div className="appearance-layout">
        <div className="form-grid">
          <CompanyColorField
            label="Cor principal"
            value={colors.primary}
            fallback={colorDefaults.primary}
            onChange={(value) =>
              setColors((current) => ({ ...current, primary: value }))
            }
          />
          <CompanyColorField
            label="Cor secundária"
            value={colors.secondary}
            fallback={colorDefaults.secondary}
            onChange={(value) =>
              setColors((current) => ({ ...current, secondary: value }))
            }
          />
          <CompanyColorField
            label="Cor dos botões"
            value={colors.button}
            fallback={colorDefaults.button}
            onChange={(value) =>
              setColors((current) => ({ ...current, button: value }))
            }
          />
          <label>
            Tema
            <select
              name="tema_publico"
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as "claro" | "escuro")
              }
            >
              <option value="claro">Claro</option>
              <option value="escuro">Escuro</option>
            </select>
          </label>
        </div>
        <div
          className={`appearance-preview ${theme === "escuro" ? "is-dark" : "is-light"}`}
          style={{
            background: theme === "escuro" ? resolvedColors.secondary : "#ffffff",
            color: theme === "escuro" ? "#ffffff" : "#282828",
            borderColor: resolvedColors.primary,
            boxShadow: `inset 0 5px 0 ${resolvedColors.secondary}`,
          }}
        >
          <small
            style={{
              color: theme === "escuro" ? "#ffffff" : resolvedColors.secondary,
            }}
          >
            Pré-visualização · Tema {theme === "escuro" ? "escuro" : "claro"}
          </small>
          <strong
            style={{
              color: theme === "escuro" ? "#ffffff" : resolvedColors.primary,
            }}
          >
            {empresa.nome}
          </strong>
          <button
            type="button"
            style={{ background: resolvedColors.button }}
          >
            Agendar atendimento
          </button>
        </div>
      </div>
      <h2>Compromisso de resposta</h2>
      <div className="form-grid">
        <label>
          Prazo informado ao cliente
          <select
            name="prazo_resposta_horas"
            defaultValue={String(empresa.prazo_resposta_horas || 4)}
          >
            <option value="1">Até 1 hora útil</option>
            <option value="2">Até 2 horas úteis</option>
            <option value="4">Até 4 horas úteis</option>
            <option value="8">Até 8 horas úteis</option>
            <option value="24">Até 24 horas</option>
            <option value="48">Até 48 horas</option>
          </select>
        </label>
      </div>
      <p className="hint">
        Esse prazo aparece na página pública como compromisso de retorno.
      </p>
      <h2>Fotos e atendimento</h2>
      <label className="check-label">
        <input
          name="fotos"
          type="checkbox"
          defaultChecked={empresa.fotos_obrigatorias}
        />
        Exigir pelo menos uma foto para confirmar a entrada do equipamento
      </label>
      <label className="check-label">
        <input
          name="solicitar_endereco"
          type="checkbox"
          defaultChecked={empresa.solicitar_endereco}
        />
        Solicitar endereço nos agendamentos
      </label>
      <h2>Horário de funcionamento</h2>
      <p>Horários de Brasília, em intervalos de 15 minutos.</p>
      {[
        "Domingo",
        "Segunda",
        "Terça",
        "Quarta",
        "Quinta",
        "Sexta",
        "Sábado",
      ].map((name, i) => (
        <div className="hour-row" key={name}>
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
            {name}
          </label>
          {hours[i] && (
            <>
              <input
                aria-label={`Abertura ${name}`}
                type="time"
                required
                step={900}
                value={hours[i][0]}
                onChange={(e) =>
                  setHours({ ...hours, [i]: [e.target.value, hours[i][1]] })
                }
              />
              <span>até</span>
              <input
                aria-label={`Fechamento ${name}`}
                type="time"
                required
                step={900}
                value={hours[i][1]}
                onChange={(e) =>
                  setHours({ ...hours, [i]: [hours[i][0], e.target.value] })
                }
              />
            </>
          )}
        </div>
      ))}
      <div className="form-actions">
        <Link className="outline" href={`/${empresa.slug}`}>
          Ver página do cliente ↗
        </Link>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(
              `${location.origin}/agendar/${empresa.slug}`,
            );
            setSaved(true);
          }}
        >
          Copiar link de agendamento
        </button>
        <a
          className="outline"
          target="_blank"
          rel="noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(`Agende seu atendimento com ${empresa.nome}: ${typeof location === "undefined" ? "" : location.origin}/agendar/${empresa.slug}`)}`}
        >
          Compartilhar no WhatsApp ↗
        </a>
        <button className="primary" disabled={busy || uploadingLogo}>
          {busy ? "Salvando…" : uploadingLogo ? "Enviando logo…" : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}


function CompanyColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  const current = value || fallback;
  return (
    <label className="company-color-setting">
      {label}
      <div className="company-color-control">
        <span
          className="company-color-swatch"
          style={{ background: current }}
          aria-hidden="true"
        />
        <input
          className="company-color-picker"
          type="color"
          value={current}
          aria-label={`Selecionar ${label.toLowerCase()}`}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <small>
          {value ? value.toUpperCase() : `Padrão (${fallback})`}
        </small>
        {value && (
          <button type="button" onClick={() => onChange(null)}>
            Usar padrão
          </button>
        )}
      </div>
    </label>
  );
}
