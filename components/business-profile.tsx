"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "./workspace";
import { ErrorBox, PanelTitle } from "./ui";
import { message, supabase } from "@/lib/supabase";

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

export default function BusinessProfile() {
  const { empresa, access, refresh } = useWorkspace();
  const canManage = ["OWNER", "ADMIN"].includes(access.company?.role || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState<Record<string, [string, string]>>(empresa.horario);
  const [address, setAddress] = useState({
    cep: formatCep(empresa.cep || ""),
    rua: empresa.endereco || "",
    numero: empresa.numero_endereco || "",
    complemento: empresa.complemento || "",
    bairro: empresa.bairro || "",
    cidade: empresa.cidade || "",
    estado: empresa.estado || "",
  });
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "filled">("idle");

  const completeAddress = useMemo(
    () =>
      [address.rua, address.numero, address.bairro, address.cidade, address.estado]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(", "),
    [address],
  );

  async function lookupCep() {
    const cep = address.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepStatus("loading");
    try {
      const response = await fetch(`/api/cep/${cep}`, { cache: "no-store" });
      if (!response.ok) {
        setCepStatus("idle");
        return;
      }
      const data = (await response.json()) as CepLookup;
      if (!data.found) {
        setCepStatus("idle");
        return;
      }
      setAddress((current) => ({
        ...current,
        rua: data.logradouro || current.rua,
        bairro: data.bairro || current.bairro,
        cidade: data.cidade || current.cidade,
        estado: data.estado || current.estado,
      }));
      setCepStatus("filled");
    } catch {
      setCepStatus("idle");
    }
  }

  if (!canManage) {
    return (
      <section className="panel">
        <h2>Dados da assistência</h2>
        <p>Somente proprietários e administradores podem alterar os dados do negócio.</p>
      </section>
    );
  }

  return (
    <form
      className="panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setSaved(false);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          const result = await supabase!
            .from("empresas")
            .update({
              nome: form.get("nome"),
              documento: form.get("documento") || null,
              telefone: form.get("telefone") || null,
              whatsapp: form.get("whatsapp") || null,
              email_publico: form.get("email_publico") || null,
              endereco: address.rua || null,
              numero_endereco: address.numero || null,
              complemento: address.complemento || null,
              bairro: address.bairro || null,
              cidade: address.cidade || null,
              estado: address.estado || null,
              cep: address.cep.replace(/\D/g, "") || null,
              horario: hours,
            })
            .eq("id", empresa.id)
            .select("id")
            .single();
          if (result.error) throw result.error;
          await refresh();
          setSaved(true);
        } catch (caught) {
          setError(message(caught as Error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorBox error={error} />
      {saved && <p className="notice" role="status">Dados da assistência atualizados.</p>}

      <section className="settings-purpose-card">
        <strong>Função desta página</strong>
        <p>
          Manter os dados operacionais do negócio corretos. Aparência, textos e
          conteúdo da página pública ficam em <b>Minha página</b>.
        </p>
      </section>

      <PanelTitle title="Identificação do negócio" icon="business" />
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
          CPF ou CNPJ
          <input name="documento" defaultValue={empresa.documento || ""} />
        </label>
        <label>
          Telefone
          <input name="telefone" type="tel" defaultValue={empresa.telefone || ""} />
        </label>
        <label>
          WhatsApp
          <input name="whatsapp" type="tel" defaultValue={empresa.whatsapp || ""} />
        </label>
        <label>
          E-mail de contato
          <input
            name="email_publico"
            type="email"
            defaultValue={empresa.email_publico || ""}
          />
        </label>
      </div>

      <PanelTitle title="Endereço operacional" icon="publicPage" />
      <div className="form-grid company-address-grid">
        <label>
          CEP
          <input
            inputMode="numeric"
            maxLength={9}
            value={address.cep}
            onChange={(event) => {
              setCepStatus("idle");
              setAddress((current) => ({
                ...current,
                cep: formatCep(event.target.value),
              }));
            }}
            onBlur={() => void lookupCep()}
          />
          {cepStatus === "loading" && <small>Buscando endereço…</small>}
          {cepStatus === "filled" && <small>Endereço preenchido pelo CEP.</small>}
        </label>
        <label className="company-address-street">
          Rua / Logradouro
          <input
            value={address.rua}
            onChange={(event) =>
              setAddress((current) => ({ ...current, rua: event.target.value }))
            }
          />
        </label>
        <label>
          Número
          <input
            value={address.numero}
            onChange={(event) =>
              setAddress((current) => ({ ...current, numero: event.target.value }))
            }
          />
        </label>
        <label>
          Complemento
          <input
            value={address.complemento}
            onChange={(event) =>
              setAddress((current) => ({ ...current, complemento: event.target.value }))
            }
          />
        </label>
        <label>
          Bairro
          <input
            value={address.bairro}
            onChange={(event) =>
              setAddress((current) => ({ ...current, bairro: event.target.value }))
            }
          />
        </label>
        <label>
          Cidade
          <input
            value={address.cidade}
            onChange={(event) =>
              setAddress((current) => ({ ...current, cidade: event.target.value }))
            }
          />
        </label>
        <label>
          Estado
          <input
            maxLength={2}
            value={address.estado}
            onChange={(event) =>
              setAddress((current) => ({
                ...current,
                estado: event.target.value.toUpperCase().slice(0, 2),
              }))
            }
          />
        </label>
      </div>
      {completeAddress && <p className="hint">Endereço: {completeAddress}</p>}

      <PanelTitle title="Horário de funcionamento" icon="clock" />
      <p className="hint">
        Estes são os horários reais da assistência. A agenda usa essa informação para
        orientar os atendimentos.
      </p>
      {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map(
        (name, index) => (
          <div className="hour-row" key={name}>
            <label className="check-label">
              <input
                type="checkbox"
                checked={Boolean(hours[index])}
                onChange={(event) => {
                  const next = { ...hours };
                  if (event.target.checked) next[index] = ["09:00", "18:00"];
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
        ),
      )}

      <div className="form-actions">
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar dados da assistência"}
        </button>
      </div>
    </form>
  );
}
