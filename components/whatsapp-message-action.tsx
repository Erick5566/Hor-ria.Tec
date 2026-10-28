"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./workspace";
import { supabase } from "@/lib/supabase";
import {
  WHATSAPP_TEMPLATES,
  renderWhatsappTemplate,
  whatsappMessageContext,
  whatsappUrl,
  type WhatsappTemplateType,
} from "@/lib/whatsapp-templates";

type Props = {
  type: WhatsappTemplateType;
  phone?: string | null;
  clientName?: string | null;
  deviceModel?: string | null;
  trackingToken?: string | null;
  label?: string;
};

export default function WhatsappMessageAction({
  type,
  phone,
  clientName,
  deviceModel,
  trackingToken,
  label = "Enviar por WhatsApp",
}: Props) {
  const { empresa } = useWorkspace();
  const [template, setTemplate] = useState<string>(WHATSAPP_TEMPLATES[type].defaultText);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setTemplate(WHATSAPP_TEMPLATES[type].defaultText);
    setLoading(true);
    setError("");

    if (!supabase || !empresa.id) {
      setError("Não foi possível carregar as mensagens desta assistência.");
      setLoading(false);
      return;
    }

    void supabase
      .from("mensagens_whatsapp_templates")
      .select("conteudo")
      .eq("empresa_id", empresa.id)
      .eq("tipo", type)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Não foi possível consultar a mensagem salva. Tente novamente.");
        else setTemplate(data?.conteudo || WHATSAPP_TEMPLATES[type].defaultText);
        setLoading(false);
      });

    return () => { active = false; };
  }, [empresa.id, type]);

  const text = useMemo(() => renderWhatsappTemplate(template, whatsappMessageContext({
    clientName,
    deviceModel,
    trackingToken,
    storeName: empresa.nome,
  })), [template, clientName, deviceModel, trackingToken, empresa.nome]);
  const url = whatsappUrl(phone, text);

  return (
    <div className="wa-message-action">
      {error && <small role="alert">{error}</small>}
      {!url && <small role="status">Cadastre um WhatsApp válido para este cliente antes do envio.</small>}
      <details>
        <summary>Conferir texto da mensagem</summary>
        <p className="wa-message-preview">{text}</p>
      </details>
      {url && !loading && !error ? (
        <a className="outline" target="_blank" rel="noopener noreferrer" href={url}>
          {label} ↗
        </a>
      ) : (
        <button className="outline" type="button" disabled>
          {loading ? "Preparando mensagem…" : label}
        </button>
      )}
    </div>
  );
}
