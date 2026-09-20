"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand, MissingConfig } from "./brand";
import {
  configured,
  publicDb,
  supabase,
  syncServerSession,
} from "@/lib/supabase";
import type { AccessContext } from "@/lib/access";

type RegistrationStatus = {
  enabled: boolean;
  registrationEnabled: boolean;
  currentCompanies: number;
  maxCompanies: number;
  globalMaintenance: boolean;
};

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [registration, setRegistration] = useState<RegistrationStatus | null>(null);
  useEffect(() => {
    publicDb
      ?.rpc("registration_status")
      .then(({ data }) => setRegistration(data as RegistrationStatus));
  }, []);
  if (!configured) return <MissingConfig />;
  const closed = signup && registration && !registration.enabled;
  async function finishLogin(
    session: NonNullable<
      Awaited<
        ReturnType<NonNullable<typeof supabase>["auth"]["getSession"]>
      >["data"]["session"]
    >,
  ) {
    await syncServerSession(session);
    const access = await supabase!.rpc("access_context");
    const context = access.data as AccessContext | null;
    const requested = search.get("next");
    if (context?.isSuperAdmin) {
      const destination = requested?.startsWith("/admin") ? requested : "/admin";
      router.push(
        `/seguranca/mfa?next=${encodeURIComponent(destination)}`,
      );
    } else {
      router.push(requested?.startsWith("/painel") ? requested : "/painel");
    }
    router.refresh();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const credentials = {
        email: String(form.get("email")),
        password: String(form.get("password")),
      };
      if (signup) {
        const slug = String(form.get("slug"));
        const reserved = new Set([
          "painel",
          "agendar",
          "acompanhar",
          "api",
          "admin",
          "entrar",
          "cadastro",
          "privacidade",
          "recuperar-senha",
          "redefinir-senha",
          "solicitacao-enviada",
          "manutencao",
          "conta-bloqueada",
          "seguranca",
        ]);
        if (reserved.has(slug))
          throw new Error("Escolha outro endereço para a página pública.");
      }
      const result = signup
        ? await supabase!.auth.signUp({
            ...credentials,
            options: {
              data: {
                responsible_name: String(form.get("responsavel")),
                company_name: String(form.get("empresa")),
                company_slug: String(form.get("slug")),
              },
            },
          })
        : await supabase!.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (result.data.session) await finishLogin(result.data.session);
      else
        setNotice(
          "Conta criada. Confirme seu e-mail e depois entre na Horária.",
        );
    } catch (error) {
      setNotice(
        error instanceof Error &&
        (error.message.includes("vagas") ||
          error.message.includes("Escolha outro endereço"))
          ? error.message
          : "Não foi possível concluir. Confira os dados e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">SUA EMPRESA, SEU ESPAÇO</span>
          <h1>
            {signup ? (
              <>
                Comece com
                <br />
                <em>7 dias iniciais.</em>
              </>
            ) : (
              <>
                Bom ter você
                <br />
                <em>por aqui.</em>
              </>
            )}
          </h1>
          <p>
            Gestão de ordens, clientes, equipamentos e cada etapa do reparo.
          </p>
        </div>
        <Link href="/">← Voltar para o início</Link>
      </section>
      <section className="login-form">
        <div className="form-wrap">
          <span className="eyebrow">{signup ? "CRIAR CONTA" : "ENTRAR"}</span>
          <h2>
            {signup ? "Cadastre sua assistência." : "Acesse sua assistência."}
          </h2>
          {registration?.globalMaintenance && (
            <p className="notice">
              Estamos realizando uma atualização. O acesso administrativo
              continua disponível.
            </p>
          )}
          {closed ? (
            <>
              <p className="notice">
                As novas vagas para esta fase da Horária estão temporariamente
                encerradas.
              </p>
              <Link className="outline" href="/entrar">
                Já tenho conta
              </Link>
            </>
          ) : (
            <form onSubmit={submit}>
              {signup && (
                <>
                  <label>
                    Seu nome
                    <input
                      name="responsavel"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Nome da assistência
                    <input
                      name="empresa"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="Ex.: João Cell Assistência"
                    />
                  </label>
                  <label>
                    Endereço público
                    <input
                      name="slug"
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      placeholder="joao-cell"
                    />
                    <small>Use letras minúsculas, números e hífens.</small>
                  </label>
                </>
              )}
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Senha
                <input
                  name="password"
                  type="password"
                  minLength={signup ? 12 : 8}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                />
                {signup && (
                  <small>
                    Use pelo menos 12 caracteres e prefira uma senha única.
                  </small>
                )}
              </label>
              {!signup && (
                <div className="auth-help-row">
                  <Link href="/recuperar-senha">Esqueci minha senha</Link>
                </div>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Aguarde…" : signup ? "Criar conta →" : "Entrar →"}
              </button>
            </form>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <p className="switch">
            {signup ? "Já tem uma conta?" : "Ainda não usa a Horária?"}{" "}
            <Link href={signup ? "/entrar" : "/cadastro"}>
              {signup ? "Entrar" : "Criar conta"}
            </Link>
          </p>
          <div className="privacy">
            ◈ &nbsp; Seus dados ficam isolados por empresa.{" "}
            <Link href="/privacidade">Política de privacidade</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
