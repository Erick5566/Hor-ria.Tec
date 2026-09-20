import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import SessionBridge from "@/components/session-bridge";
import { getServerAccess } from "@/lib/server-auth";

export default async function Home() {
  const access = await getServerAccess();
  if (access) redirect(access.context.isSuperAdmin ? "/admin" : "/painel");
  return (
    <main className="login-layout">
      <SessionBridge />
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">ASSISTÊNCIA TÉCNICA EM UM SÓ LUGAR</span>
          <h1>
            Do diagnóstico
            <br />à entrega.
            <br />
            <em>Tudo conectado.</em>
          </h1>
          <p>
            Ordens, equipamentos, agenda, estoque e financeiro para organizar o
            ciclo completo do reparo.
          </p>
          <div className="decor-card">
            <span className="check">✓</span>
            <div>
              <strong>Controle de ponta a ponta</strong>
              <small>Do primeiro contato ao equipamento entregue.</small>
            </div>
            <span>↗</span>
          </div>
        </div>
        <small>Feito para quem cuida de cada atendimento.</small>
      </section>
      <section className="login-form">
        <div className="form-wrap">
          <span className="eyebrow">HORÁRIA PARA ASSISTÊNCIAS</span>
          <h2>Sua operação mais clara desde o primeiro atendimento.</h2>
          <p>
            Crie o espaço da sua assistência ou entre em uma conta existente.
          </p>
          <div className="landing-actions">
            <Link className="primary" href="/cadastro">
              Criar conta →
            </Link>
            <Link className="outline" href="/entrar">
              Entrar
            </Link>
          </div>
          <div className="privacy">
            ◈ &nbsp; Cada empresa acessa somente o próprio espaço.{" "}
            <Link href="/privacidade">Política de privacidade</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
