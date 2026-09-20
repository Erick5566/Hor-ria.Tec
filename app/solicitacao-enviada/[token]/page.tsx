import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Solicitação recebida",
  description: "Sua solicitação de atendimento foi recebida.",
  robots: { index: false, follow: false },
};

export default async function RequestThanks({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ os?: string }>;
}) {
  const { token } = await params;
  const values = await searchParams;

  return (
    <main className="system-page">
      <section className="system-card confirmation-page">
        <Brand />
        <span className="check">✓</span>
        <span className="eyebrow">SOLICITAÇÃO RECEBIDA</span>
        <h1>Seu atendimento entrou na fila.</h1>
        <p>
          {values.os ? `A OS #${values.os} foi criada. ` : ""}
          A assistência analisará as informações e responderá pelo contato
          informado durante o horário de atendimento.
        </p>
        <div className="system-actions">
          <Link className="primary" href={`/acompanhar/${token}`}>
            Acompanhar reparo
          </Link>
          <Link className="outline" href="/privacidade">
            Política de privacidade
          </Link>
        </div>
      </section>
    </main>
  );
}
