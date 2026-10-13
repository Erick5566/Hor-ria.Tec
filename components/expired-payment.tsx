"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildPixPayload, getSubscriptionPixPayment } from "@/lib/pix";

const PIX_KEY = "veniciuskiwify@gmail.com";

type Props = {
  hasApprovedPayment: boolean;
  pendingActivation?: boolean;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
  amounts?: { initialAmount: number; monthlyAmount: number };
};

export default function ExpiredPayment({ hasApprovedPayment, status, amounts, pendingActivation = false }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const payment = useMemo(
    () => getSubscriptionPixPayment(status, hasApprovedPayment, amounts),
    [status, hasApprovedPayment, amounts],
  );
  const payload = useMemo(
    () => buildPixPayload({
      key: PIX_KEY,
      amount: payment.amount,
      merchantName: "Horária",
      merchantCity: "Camaçari",
      description: payment.description,
    }),
    [payment.amount, payment.description],
  );
  const qr = "https://quickchart.io/qr?size=320&margin=2&ecLevel=M&text=" + encodeURIComponent(payload);

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 10000);
    return () => window.clearInterval(interval);
  }, [router]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="state-card" aria-labelledby="payment-title">
      <span className="eyebrow">{pendingActivation ? "ATIVAÇÃO DA HORÁRIA" : "PRAZO DE USO ENCERRADO"}</span>
      <h1 id="payment-title">{pendingActivation ? "Pague agora e ganhe 7 dias extras" : "Sua assinatura venceu"}</h1>
      <p>{pendingActivation
        ? "O pagamento inicial é realizado na contratação. Após a confirmação, você ganha 7 dias de bônus e começa seu primeiro mês de assinatura. A próxima mensalidade vence depois desse mês."
        : "Para continuar usando a Horária, realize o PIX abaixo. O acesso será liberado quando o administrador confirmar o pagamento."}</p>
      <p><strong>{payment.heading}: {payment.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></p>
      <img src={qr} alt="QR Code Pix da assinatura Horária" width={240} height={240} style={{ maxWidth: "100%", height: "auto", margin: "12px auto" }} />
      <p>Chave PIX: <strong>{PIX_KEY}</strong></p>
      <button type="button" className="primary" onClick={() => void copy()}>{copied ? "Código copiado" : "Copiar Pix Copia e Cola"}</button>
      <p role="status">Aguardando confirmação manual do ADM. Esta página consulta a situação da assinatura automaticamente.</p>
    </section>
  );
}
