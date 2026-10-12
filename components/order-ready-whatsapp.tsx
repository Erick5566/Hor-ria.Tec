"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Delivery = {
  eligiblePlan: boolean;
  authorized: boolean;
  channelEnabled: boolean;
  deliveryStatus: "pendente" | "processando" | "enviada" | "falhou" | null;
  hasNotification: boolean;
  sentAt: string | null;
};

export default function OrderReadyWhatsapp({
  orderId, manualUrl, plus,
}: {orderId:string;manualUrl:string;plus:boolean}) {
  const [delivery,setDelivery]=useState<Delivery | null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    if(!plus || !supabase) return;
    let active=true;
    async function read(){
      const result=await supabase!.rpc("status_aviso_whatsapp_ordem",{p_ordem:orderId});
      if(!active) return;
      if(result.error){setError(true);return;}
      setDelivery(result.data as Delivery);
      setError(false);
    }
    void read();
    const timer=window.setInterval(()=>void read(),20000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[orderId,plus]);

  if(!plus) return manualUrl ? (
    <a className="outline" href={manualUrl} target="_blank" rel="noreferrer">
      Avisar no WhatsApp ↗
    </a>
  ) : null;

  if(error || !delivery) return (
    <div className="wa-ready-state" role="status">
      <span>{error?"Não foi possível conferir o aviso automático.":"Verificando aviso automático…"}</span>
      {error && manualUrl && <a href={manualUrl} target="_blank" rel="noreferrer">Abrir WhatsApp ↗</a>}
    </div>
  );

  const status=delivery.deliveryStatus;
  if(status==="enviada") return (
    <div className="wa-ready-state wa-ready-ok" role="status">
      <strong>✓ Aviso enviado automaticamente</strong>
      <small>{delivery.sentAt
        ? `Confirmado em ${new Date(delivery.sentAt).toLocaleString("pt-BR")}`
        : "Mensagem registrada como enviada pelo provedor"}</small>
    </div>
  );

  if(status==="processando" || status==="pendente") return (
    <div className="wa-ready-state wa-ready-wait" role="status">
      <strong>{status==="processando"?"Enviando aviso ao cliente…":"Aviso na fila de envio"}</strong>
      <small>O envio ainda não foi confirmado. Evite enviar outro aviso para não duplicar a mensagem.</small>
    </div>
  );

  const pendingFailure=status==="falhou";
  const disabled=!delivery.authorized || !delivery.eligiblePlan || !delivery.channelEnabled;
  return (
    <div className="wa-ready-state" role="status">
      <strong>{pendingFailure?"Aviso automático não confirmado":disabled?"Aviso automático não habilitado nesta OS":"Aviso automático indisponível"}</strong>
      <small>{pendingFailure
        ? "Confira o envio com a assistência antes de tentar novamente; falhas de rede podem gerar mensagens duplicadas."
        : !delivery.authorized
          ? "O cliente não autorizou o aviso automático nesta OS."
          : !delivery.channelEnabled
            ? "O WhatsApp Business oficial precisa estar conectado e habilitado para enviar sozinho."
            : "Confira as configurações e o histórico de envios desta assistência."}</small>
      {manualUrl && <a href={manualUrl} target="_blank" rel="noreferrer">
        Abrir WhatsApp manualmente ↗
      </a>}
    </div>
  );
}
