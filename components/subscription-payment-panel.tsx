"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccessContext } from "@/lib/access";
import { buildPixPayload, getSubscriptionPixPayment } from "@/lib/pix";

const PIX_KEY = "veniciuskiwify@gmail.com";

type Subscription = AccessContext["subscription"];
type Billing = AccessContext["billing"];

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

function currency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dueAt(subscription: Subscription) {
  const raw = subscription?.nextBillingDate || subscription?.trialEndsAt;
  return raw ? new Date(raw).getTime() : null;
}

function remainingLabel(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

export default function SubscriptionPaymentPanel({
  subscription,
  billing,
  blocked = false,
}: {
  subscription: Subscription;
  billing?: Billing;
  blocked?: boolean;
}) {
  const [copied, setCopied] = useState<"pix" | "key" | "">("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (subscription?.status !== "PAST_DUE") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [subscription?.status]);

  const payment = useMemo(
    () =>
      getSubscriptionPixPayment(subscription?.status, {
        initialAmount: billing?.initialAmount,
        monthlyAmount: billing?.monthlyAmount,
        hasApprovedPayment: billing?.hasApprovedPayment,
      }),
    [
      billing?.hasApprovedPayment,
      billing?.initialAmount,
      billing?.monthlyAmount,
      subscription?.status,
    ],
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

  const due = dueAt(subscription);
  const graceHours = Number(billing?.graceHours || 24);
  const deadline = due ? due + graceHours * 60 * 60 * 1000 : null;
  const remaining =
    subscription?.status === "PAST_DUE" && deadline
      ? remainingLabel(deadline - now)
      : null;

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
    <section
      className={
        "panel subscription-payment-card" +
        (blocked ? " subscription-payment-blocked" : "")
      }
    >
      <div className="subscription-payment-head">
        <div>
          <span className="eyebrow">PAGAMENTO VIA PIX</span>
          <h2>{payment.heading}</h2>
          <p>
            Escaneie o QR Code ou copie o código Pix. A tela acompanha a
            situação da assinatura automaticamente.
          </p>
          {remaining && (
            <div className="subscription-countdown" role="timer">
              <span>Tempo restante antes do bloqueio</span>
              <strong>{remaining}</strong>
            </div>
          )}
        </div>
        <div className="subscription-price">
          <small>{payment.priceLabel}</small>
          <strong>{currency(payment.amount)}</strong>
          {payment.kind === "initial" ? (
            <small>Depois, {currency(Number(billing?.monthlyAmount || 59))}/mês</small>
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
              alt={"QR Code Pix para " + payment.heading.toLowerCase()}
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
            <strong>{currency(payment.amount)}</strong>
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

          <div className="notice subscription-auto-confirmation">
            <strong>Atualização automática</strong>
            <p>
              Assim que a Horária receber a confirmação do pagamento, o status
              muda e o acesso é liberado automaticamente, sem F5. Enquanto o
              provedor automático não estiver conectado, a confirmação manual
              do Super Admin continua disponível como contingência.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
