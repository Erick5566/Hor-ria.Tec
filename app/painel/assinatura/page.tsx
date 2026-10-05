"use client";

import { useEffect, useMemo, useState } from "react";
import { Heading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { buildPixPayload, getSubscriptionPixPayment } from "@/lib/pix";

const PIX_KEY = "veniciuskiwify@gmail.com";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function SubscriptionPage() {
  const { access } = useWorkspace();
  const subscription = access.subscription;
  const [copied, setCopied] = useState<"pix" | "key" | "">("");
  const [, setClockTick] = useState(0);

  const payment = useMemo(
    () => getSubscriptionPixPayment(subscription?.status),
    [subscription?.status],
  );

  const pixPayload = useMemo(
    () =>
      buildPixPayload({
        key: PIX_KEY,
        amount: payment.amount,
        merchantName: "Horária",
        merchantCity: "Camaçari",
        description: payment.description,
      }),
    [payment.amount, payment.description],
  );

  const qrCodeUrl =
    "https://quickchart.io/qr?size=320&margin=2&ecLevel=M&text=" +
    encodeURIComponent(pixPayload);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const graceEndsAt =
    subscription?.nextBillingDate && subscription.status === "PAST_DUE"
      ? new Date(subscription.nextBillingDate).getTime() +
        (access.billing?.graceHours || 24) * 60 * 60 * 1000
      : null;
  const remainingMs = graceEndsAt ? Math.max(0, graceEndsAt - Date.now()) : 0;
  const remainingLabel = graceEndsAt
    ? [Math.floor(remainingMs / 3600000), Math.floor((remainingMs % 3600000) / 60000), Math.floor((remainingMs % 60000) / 1000)]
        .map((value) => String(value).padStart(2, "0"))
        .join(":")
    : "";

  async function handleCopy(type: "pix" | "key", value: string) {
    try {
      await copyText(value);
      setCopied(type);
      window.setTimeout(() => setCopied(""), 2200);
    } catch {
      setCopied("");
    }
  }

  return (
    <section className="module unified-pro subscription-pro">
      <Heading
        title="Assinatura da Horária"
        subtitle="Situação de acesso, ciclo da empresa e pagamento."
      />

      {subscription?.status === "ACTIVE" && (
        <section className="notice subscription-paid-status" role="status">
          <strong>Pagamento confirmado ✓</strong>
          <span>Sua assinatura está ativa. Esta tela acompanha novas confirmações automaticamente.</span>
        </section>
      )}

      {subscription?.status === "PAST_DUE" && remainingLabel && (
        <section className="notice subscription-countdown" role="status">
          <strong>Tolerância de pagamento: {remainingLabel}</strong>
          <span>Ao chegar a zero, o acesso é bloqueado automaticamente se o pagamento ainda não tiver sido confirmado.</span>
        </section>
      )}

      <section className="panel subscription-card">
        <dl className="definition-grid">
          <div>
            <dt>Status</dt>
            <dd>{subscription?.status || "Não disponível"}</dd>
          </div>
          <div>
            <dt>Período inicial</dt>
            <dd>
              {subscription?.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString("pt-BR")
                : "Concluído"}
            </dd>
          </div>
          <div>
            <dt>Próxima cobrança</dt>
            <dd>
              {subscription?.nextBillingDate
                ? new Date(subscription.nextBillingDate).toLocaleDateString(
                    "pt-BR",
                  )
                : "A definir"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel subscription-payment-card">
        <div className="subscription-payment-head">
          <div>
            <span className="eyebrow">PAGAMENTO VIA PIX</span>
            <h2>{payment.heading}</h2>
            <p>
              Escaneie o QR Code ou copie o código Pix para pagar sua
              assinatura.
            </p>
          </div>
          <div className="subscription-price">
            <small>{payment.priceLabel}</small>
            <strong>{formatCurrency(payment.amount)}</strong>
            {payment.kind === "initial" ? (
              <small>Depois, R$ 59,00/mês</small>
            ) : (
              <small>Pagamento mensal</small>
            )}
          </div>
        </div>

        <div className="subscription-pix-grid">
          <div className="subscription-qr-wrap">
            <div className="subscription-qr">
              <img
                src={qrCodeUrl}
                alt={`QR Code Pix para ${payment.heading.toLowerCase()}`}
                width={280}
                height={280}
              />
            </div>
            <small>
              Abra o aplicativo do seu banco e escolha a opção de pagar por QR
              Code Pix.
            </small>
          </div>

          <div className="subscription-pix-details">
            <div className="subscription-pix-amount">
              <span>{payment.priceLabel}</span>
              <strong>{formatCurrency(payment.amount)}</strong>
            </div>

            <div className="subscription-pix-field">
              <span>Chave Pix</span>
              <div>
                <code>{PIX_KEY}</code>
                <button
                  type="button"
                  className="outline"
                  onClick={() => void handleCopy("key", PIX_KEY)}
                >
                  {copied === "key" ? "Copiado ✓" : "Copiar chave"}
                </button>
              </div>
            </div>

            <div className="subscription-pix-field">
              <span>Pix Copia e Cola</span>
              <div className="subscription-pix-copy">
                <code>{pixPayload}</code>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleCopy("pix", pixPayload)}
                >
                  {copied === "pix" ? "Código copiado ✓" : "Copiar código Pix"}
                </button>
              </div>
            </div>

            <div className="notice subscription-manual-confirmation">
              <strong>Acompanhamento automático da assinatura</strong>
              <p>
                Esta página monitora a situação da conta em tempo real. Assim que
                o backend receber a confirmação do pagamento, o status muda para
                pago e o acesso é liberado sem F5.
              </p>
            </div>
          </div>
        </div>
      </section>

      {subscription?.status === "PAST_DUE" && (
        <section className="panel subscription-overdue-card">
          <div className="notice">
            <strong>Mensalidade pendente</strong>
            <p>
              Use o Pix acima para regularizar a assinatura. A página permanece
              acompanhando a assinatura e muda automaticamente quando a confirmação
              do pagamento chegar ao sistema.
            </p>
          </div>
        </section>
      )}
    </section>
  );
}
