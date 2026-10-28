"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import WhatsappMessageAction from "./whatsapp-message-action";

type Delivery = {
  eligiblePlan: boolean;
  authorized: boolean;
  channelEnabled: boolean;
  deliveryStatus: "pendente" | "processando" | "enviada" | "falhou" | null;
  hasNotification: boolean;
  sentAt: string | null;
};

type Props = {
  orderId: string;
  plus: boolean;
  phone?: string | null;
  clientName?: string | null;
  deviceModel?: string | null;
  trackingToken?: string | null;
};

export default function OrderReadyWhatsapp({
  orderId, plus, phone, clientName, deviceModel, trackingToken,
}: Props) {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!plus || !supabase) return;
    let active = true;
    async function read() {
      const result = await supabase!.rpc("status_aviso_whatsapp_ordem", { p_ordem: orderId });
      if (!active) return;
      if (result.error) { setError(true); return; }
      setDelivery(result.data as Delivery);
      setError(false);
    }
    void read();
    const timer = window.setInterval(() => void read(), 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderId, plus]);

  const manualAction = (
    <WhatsappMessageAction
      type="pronto_retirada"
      phone={phone}
      clientName={clientName}
      deviceModel={deviceModel}
      trackingToken={trackingToken}
    />
  );

  if (!plus) return manualAction;

  if (error || !delivery) return (
    <div className="wa-ready-state" role="status">
      <span>
        {error
          ? "Não foi possível conferir o aviso automático."
          : "Verificando aviso automático…"}
      </span>
      {error && (
        <small>Confirme o status do envio antes de tentar manualmente, para evitar duplicidade.</small>
      )}
    </div>
  );

  const status = delivery.deliveryStatus;
  if (status === "enviada") return (
    <div className="wa-ready-state wa-ready-ok" role="status">
      <strong>✓ Aviso enviado automaticamente</strong>
      <small>
        {delivery.sentAt
          ? "Confirmado em " + new Date(delivery.sentAt).toLocaleString("pt-BR")
          : "Mensagem registrada como enviada pelo provedor"}
      </small>
    </div>
  );

  if (status === "processando" || (status === "pendente" &&
      delivery.authorized && delivery.eligiblePlan && delivery.channelEnabled)) return (
    <div className="wa-ready-state wa-ready-wait" role="status">
      <strong>
        {status === "processando" ? "Enviando aviso ao cliente…" : "Aviso na fila de envio"}
      </strong>
      <small>Evite enviar outro aviso para não duplicar a mensagem.</small>
    </div>
  );

  return (
    <div className="wa-ready-state" role="status">
      <strong>
        {status === "falhou"
          ? "Aviso automático não confirmado"
          : "Aviso automático não habilitado nesta OS"}
      </strong>
      <small>
        {status === "falhou"
          ? "Confirme com o cliente se recebeu o aviso antes de tentar novamente."
          : !delivery.authorized
            ? "O cliente não autorizou o aviso automático nesta OS."
            : !delivery.channelEnabled
              ? "O WhatsApp Business oficial não está habilitado."
              : "Confira as configurações do envio automático."}
      </small>
      {manualAction}
    </div>
  );
}
