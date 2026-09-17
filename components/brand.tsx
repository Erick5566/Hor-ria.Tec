export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Horária — página inicial">
      <img
        className="brand-logo"
        src="/brand/horaria-logo.png"
        width="720"
        height="611"
        alt="Horária"
      />
    </a>
  );
}
export function MissingConfig() {
  return (
    <main className="center">
      <Brand />
      <section className="card">
        <span className="eyebrow">PRIMEIRO ACESSO</span>
        <h1>Conecte sua assistência.</h1>
        <p>
          Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no
          arquivo .env.local e aplique as migrations no seu Supabase.
        </p>
        <p>As instruções completas estão no README do projeto.</p>
      </section>
    </main>
  );
}
