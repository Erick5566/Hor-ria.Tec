import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Agendamento confirmado",
  description: "Seu agendamento foi confirmado.",
  robots: { index: false, follow: false },
};

export default async function BookingThanks({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ servico?: string; dia?: string; hora?: string }>;
}) {
  const { slug } = await params;
  const values = await searchParams;

  return (
    <main className="system-page">
      <section className="system-card confirmation-page">
        <Brand />
        <span className="check">✓</span>
        <span className="eyebrow">AGENDAMENTO CONFIRMADO</span>
        <h1>Obrigado. Seu horário foi reservado.</h1>
        <p>
          A assistência recebeu seu agendamento e poderá falar com você pelo
          contato informado, se necessário.
        </p>
        {(values.servico || values.dia || values.hora) && (
          <div className="booking-summary">
            {values.servico && <strong>{values.servico}</strong>}
            {[values.dia, values.hora].filter(Boolean).join(" · ")}
          </div>
        )}
        <div className="system-actions">
          <Link className="primary" href={`/${slug}`}>
            Voltar para a assistência
          </Link>
          <Link className="outline" href="/privacidade">
            Política de privacidade
          </Link>
        </div>
      </section>
    </main>
  );
}
