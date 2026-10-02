"use client";

import Link from "next/link";

export default function PanelError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="module">
      <section className="panel">
        <span className="eyebrow">PAINEL HORÁRIA</span>
        <h1>Não foi possível carregar esta área.</h1>
        <p>
          Sua sessão continua protegida. Tente carregar novamente; se o erro
          persistir, volte para a visão geral.
        </p>
        <div className="auth-help-row">
          <button className="primary" type="button" onClick={reset}>
            Tentar novamente
          </button>
          <Link className="outline" href="/painel">
            Voltar para o painel
          </Link>
        </div>
      </section>
    </section>
  );
}
