"use client";

import { useState } from "react";
import { useWorkspace } from "./workspace";
import { ErrorBox } from "./ui";
import { message, supabase } from "@/lib/supabase";


export default function SystemSettings() {
  const { empresa, access, refresh } = useWorkspace();
  const canManage = ["OWNER", "ADMIN"].includes(access.company?.role || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [responseHours, setResponseHours] = useState(
    String(empresa.prazo_resposta_horas || 4),
  );
  const [photosRequired, setPhotosRequired] = useState(
    Boolean(empresa.fotos_obrigatorias),
  );
  const [requestAddress, setRequestAddress] = useState(
    Boolean(empresa.solicitar_endereco),
  );

  if (!canManage) {
    return (
      <section className="panel">
        <h2>Configurações do sistema</h2>
        <p>Somente proprietários e administradores podem alterar as regras do sistema.</p>
      </section>
    );
  }


  return (
    <div className="system-settings-layout system-settings-single">
      <section className="panel">
        <ErrorBox error={error} />
        {saved && <p className="notice" role="status">Configurações atualizadas.</p>}

        <section className="settings-purpose-card">
          <strong>Função desta página</strong>
          <p>
            Definir como o Horária deve funcionar no dia a dia. Dados do negócio ficam
            em <b>Minha assistência</b> e aparência pública fica em <b>Minha página</b>.
          </p>
        </section>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setSaved(false);
            setError("");
            try {
              const result = await supabase!
                .from("empresas")
                .update({
                  prazo_resposta_horas: Number(responseHours),
                  fotos_obrigatorias: photosRequired,
                  solicitar_endereco: requestAddress,
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
          <h2>Regras de atendimento</h2>
          <div className="form-grid">
            <label>
              Prazo de resposta informado ao cliente
              <select
                value={responseHours}
                onChange={(event) => setResponseHours(event.target.value)}
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

          <h2>Recebimento e agendamento</h2>
          <label className="check-label">
            <input
              type="checkbox"
              checked={photosRequired}
              onChange={(event) => setPhotosRequired(event.target.checked)}
            />
            Exigir pelo menos uma foto na entrada do equipamento
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={requestAddress}
              onChange={(event) => setRequestAddress(event.target.checked)}
            />
            Solicitar endereço quando o cliente fizer um agendamento
          </label>

          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar regras do sistema"}
            </button>
          </div>
        </form>
      </section>

    </div>
  );
}
