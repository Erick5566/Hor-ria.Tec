import Link from "next/link";

export function FeatureUnavailable() {
  return (
    <section className="panel" role="status">
      <h1>Recurso temporariamente indisponível</h1>
      <p>
        Esta página foi desativada pela administração. Os dados continuam
        salvos.
      </p>
      <Link href="/painel/ajuda">Abrir ajuda</Link>
      {" · "}
      <Link href="/painel/assinatura">Minha assinatura</Link>
    </section>
  );
}
