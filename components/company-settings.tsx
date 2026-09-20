"use client";
import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "./workspace";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox } from "./ui";
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
    [colors, setColors] = useState({
      primary: empresa.cor_primaria || "#06141B",
      secondary: empresa.cor_secundaria || "#253745",
      button: empresa.cor_botao || "#11212D",
    });
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
            Object.values(colors).some(
              (color) => contrastWithWhite(color) < 4.5,
            )
          )
            throw new Error(
              "Escolha cores com contraste suficiente para textos brancos.",
            );
          if (
            ["painel", "agendar", "acompanhar", "api"].includes(
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
              endereco: f.get("endereco"),
              descricao_publica: f.get("descricao"),
              documento: f.get("documento") || null,
              whatsapp: f.get("whatsapp") || null,
              email_publico: f.get("email_publico") || null,
              instagram: f.get("instagram") || null,
              site: f.get("site") || null,
              logo_url: f.get("logo_url") || null,
              google_avaliacao_url: f.get("google_avaliacao_url") || null,
              google_maps_url: f.get("google_maps_url") || null,
              google_business_url: f.get("google_business_url") || null,
              cep: f.get("cep") || null,
              numero_endereco: f.get("numero_endereco") || null,
              complemento: f.get("complemento") || null,
              bairro: f.get("bairro") || null,
              cidade: f.get("cidade") || null,
              estado: f.get("estado") || null,
              cor_primaria: colors.primary,
              cor_secundaria: colors.secondary,
              cor_botao: colors.button,
              tema_publico: f.get("tema_publico"),
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
        <label>
          Logo (URL do storage)
          <input
            name="logo_url"
            type="url"
            defaultValue={empresa.logo_url || ""}
            placeholder="https://…"
          />
        </label>
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
        <label>
          Link do Google Maps / rota
          <input
            name="google_maps_url"
            type="url"
            defaultValue={empresa.google_maps_url || ""}
            placeholder="https://maps.google.com/…"
          />
        </label>
        <label>
          Endereço
          <input
            name="endereco"
            maxLength={300}
            defaultValue={empresa.endereco || ""}
          />
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
      <div className="form-grid">
        <label>
          CEP
          <input name="cep" defaultValue={empresa.cep || ""} />
        </label>
        <label>
          Número
          <input
            name="numero_endereco"
            defaultValue={empresa.numero_endereco || ""}
          />
        </label>
        <label>
          Complemento
          <input name="complemento" defaultValue={empresa.complemento || ""} />
        </label>
        <label>
          Bairro
          <input name="bairro" defaultValue={empresa.bairro || ""} />
        </label>
        <label>
          Cidade
          <input name="cidade" defaultValue={empresa.cidade || ""} />
        </label>
        <label>
          Estado
          <input
            name="estado"
            maxLength={2}
            defaultValue={empresa.estado || ""}
          />
        </label>
      </div>
      <h2 id="aparencia">Aparência da página pública</h2>
      <div className="appearance-layout">
        <div className="form-grid">
          <label>
            Cor principal
            <input
              type="color"
              value={colors.primary}
              onChange={(event) =>
                setColors({ ...colors, primary: event.target.value })
              }
            />
          </label>
          <label>
            Cor secundária
            <input
              type="color"
              value={colors.secondary}
              onChange={(event) =>
                setColors({ ...colors, secondary: event.target.value })
              }
            />
          </label>
          <label>
            Cor dos botões
            <input
              type="color"
              value={colors.button}
              onChange={(event) =>
                setColors({ ...colors, button: event.target.value })
              }
            />
          </label>
          <label>
            Tema
            <select
              name="tema_publico"
              defaultValue={empresa.tema_publico || "claro"}
            >
              <option value="claro">Claro</option>
              <option value="escuro">Escuro</option>
            </select>
          </label>
        </div>
        <div
          className="appearance-preview"
          style={{
            background: colors.secondary,
            color: "#fff",
            borderColor: colors.primary,
          }}
        >
          <small>Pré-visualização</small>
          <strong>{empresa.nome}</strong>
          <button type="button" style={{ background: colors.button }}>
            Agendar atendimento
          </button>
        </div>
      </div>
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
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}
