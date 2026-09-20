import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="system-page">
      <section className="system-card">
        <Brand />
        <span className="system-code">404</span>
        <h1>Essa página não foi encontrada.</h1>
        <p>
          O endereço pode ter mudado ou o link pode estar incompleto. Você pode
          voltar ao início ou acessar sua conta.
        </p>
        <div className="system-actions">
          <Link className="primary" href="/">
            Voltar ao início
          </Link>
          <Link className="outline" href="/entrar">
            Entrar na Horária
          </Link>
        </div>
      </section>
    </main>
  );
}
