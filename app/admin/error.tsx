"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="module admin-module">
      <section className="panel" role="alert">
        <span className="eyebrow">ADMINISTRAÇÃO HORÁRIA</span>
        <h1>Não foi possível atualizar esta área.</h1>
        <p>
          Tente carregar os dados novamente. Se o problema continuar, confira
          sua conexão e sessão.
        </p>
        <button className="primary" type="button" onClick={reset}>
          Tentar novamente
        </button>
      </section>
    </section>
  );
}
