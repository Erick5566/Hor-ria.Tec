"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Delivery = {
  eligiblePlan: boolean;
  authorized: boolean;
  revoked: boolean;
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
  const [revoking,setRevoking]=useState(false);
  const [actionError,setActionError]=useState("");
  useEffect(()=>{
    if(!supabase) return;
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

  async function revoke() {
    if(!supabase || revoking || !delivery?.authorized) return;
    setRevoking(true);
    setActionError("");
    const response=await supabase.rpc("revogar_aviso_whatsapp_ordem",{p_ordem:orderId});
    if(response.error){
      setActionError("Não foi possível cancelar o aviso. Tente novamente.");
    } else {
      setDelivery(current=>current ? {...current,revoked:true,authorized:false}:current);
    }
    setRevoking(false);
  }
  const cancellation=delivery?.authorized && !delivery.revoked ? (
    <div className="wa-ready-privacy">
      <button type="button" className="outline" disabled={revoking}
        onClick={()=>void revoke()}>
        {revoking ? "Cancelando autorização…" : "Cancelar aviso automático"}
      </button>
      <small>Uma mensagem que já estiver em envio pode chegar ao cliente.</small>
      {actionError && <small role="alert">{actionError}</small>}
    </div>
  ):null;
  const revoked=delivery?.revoked ? (
    <div className="wa-ready-state" role="status">
      <strong>Autorização cancelada nesta OS</strong>
      <small>Novos envios estão bloqueados. Mensagens já enviadas não podem ser desfeitas.</small>
    </div>
  ):null;
  if(!plus && revoked) return revoked;
  if(!plus && cancellation) return (
    <div className="wa-ready-state">
      {manualUrl && <a href={manualUrl} target="_blank" rel="noreferrer">Abrir WhatsApp ↗</a>}
      {cancellation}
    </div>
  );

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

  if(revoked) return revoked;
  const status=delivery.deliveryStatus;
  if(status==="enviada") return (
    <div className="wa-ready-state wa-ready-ok" role="status">
      <strong>✓ Aviso enviado automaticamente</strong>
      <small>{delivery.sentAt
        ? `Confirmado em ${new Date(delivery.sentAt).toLocaleString("pt-BR")}`
        : "Mensagem registrada como enviada pelo provedor"}</small>
    </div>
  );

  // Uma notificação antiga pendente não deve prender a OS se o envio oficial
  // está desligado ou não existe autorização. Em processamento, porém, um
  // disparo pode estar em voo e o envio manual poderia duplicar a mensagem.
  if(status==="processando" || (status==="pendente" &&
    delivery.authorized && delivery.eligiblePlan && delivery.channelEnabled)) return (
    <div className="wa-ready-state wa-ready-wait" role="status">
      <strong>{status==="processando"?"Enviando aviso ao cliente…":"Aviso na fila de envio"}</strong>
      <small>O envio ainda não foi confirmado. Evite enviar outro aviso para não duplicar a mensagem.</small>
      {cancellation}
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
      {cancellation}}
    </div>
  );
}
