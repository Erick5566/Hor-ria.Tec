"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand, MissingConfig } from "./brand";
import Turnstile from "./turnstile";
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

const SIGNUP_ATTEMPTS_KEY = "horaria_signup_attempts";
const SIGNUP_ATTEMPTS_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_ATTEMPTS_LIMIT = 5;

function consumeSignupAttempt() {
  if (typeof window === "undefined") return { allowed: true, minutes: 0 };

  try {
    const now = Date.now();
    const stored = JSON.parse(
      window.localStorage.getItem(SIGNUP_ATTEMPTS_KEY) ?? "[]",
    ) as number[];
    const attempts = stored.filter(
      (timestamp) => now - timestamp < SIGNUP_ATTEMPTS_WINDOW_MS,
    );

    if (attempts.length >= SIGNUP_ATTEMPTS_LIMIT) {
      const oldest = Math.min(...attempts);
      const remaining = SIGNUP_ATTEMPTS_WINDOW_MS - (now - oldest);
      return {
        allowed: false,
        minutes: Math.max(1, Math.ceil(remaining / 60_000)),
      };
    }

    attempts.push(now);
    window.localStorage.setItem(SIGNUP_ATTEMPTS_KEY, JSON.stringify(attempts));
    return { allowed: true, minutes: 0 };
  } catch {
    return { allowed: true, minutes: 0 };
  }
}

function clearSignupAttempts() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(SIGNUP_ATTEMPTS_KEY);
  } catch {
    // O armazenamento local pode estar bloqueado pelo navegador.
  }
}


export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [registration, setRegistration] = useState<RegistrationStatus | null>(null),
    [captchaToken, setCaptchaToken] = useState(""),
    [captchaResetKey, setCaptchaResetKey] = useState(0);
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
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
    setNotice("");
    const form = new FormData(event.currentTarget);

    if (signup && String(form.get("website") ?? "").trim()) {
      setNotice("Não foi possível concluir. Tente novamente.");
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      setNotice("Conclua a verificação de segurança para continuar.");
      return;
    }

    if (signup && form.get("legal") !== "on") {
      setNotice(
        "Para criar a conta, confirme que leu os Termos de Uso e a Política de Privacidade.",
      );
      return;
    }

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
          "login",
          "dashboard",
          "suporte",
          "horaria",
          "entrar",
          "cadastro",
          "privacidade",
          "termos",
          "recuperar-senha",
          "redefinir-senha",
          "solicitacao-enviada",
          "manutencao",
          "conta-bloqueada",
          "seguranca",
          "opengraph-image",
        ]);
        if (reserved.has(slug))
          throw new Error("Escolha outro endereço para a página pública.");

        const attempt = consumeSignupAttempt();
        if (!attempt.allowed) {
          throw new Error(
            `Muitas tentativas de cadastro. Aguarde ${attempt.minutes} min e tente novamente.`,
          );
        }
      }

      setBusy(true);
      const result = signup
        ? await supabase!.auth.signUp({
            ...credentials,
            options: {
              data: {
                responsible_name: String(form.get("responsavel")),
                company_name: String(form.get("empresa")),
                company_slug: String(form.get("slug")),
                terms_accepted_at: new Date().toISOString(),
                privacy_accepted_at: new Date().toISOString(),
              },
              ...(turnstileSiteKey ? { captchaToken } : {}),
            },
          })
        : await supabase!.auth.signInWithPassword({
            ...credentials,
            ...(turnstileSiteKey
              ? { options: { captchaToken } }
              : {}),
          });
      if (result.error) throw result.error;
      if (signup) clearSignupAttempts();
      if (result.data.session) await finishLogin(result.data.session);
      else
        setNotice(
          "Conta criada. Entre com seu e-mail e senha para acessar a Horária.",
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status?: number }).status)
          : 0;

      if (
        status === 429 ||
        /rate limit|too many requests|muitas tentativas/i.test(message)
      ) {
        setNotice(
          message.startsWith("Muitas tentativas")
            ? message
            : "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
        );
      } else if (/captcha/i.test(message)) {
        setNotice(
          turnstileSiteKey
            ? "Não foi possível validar a verificação de segurança. Tente novamente."
            : "A verificação de segurança está ativa, mas não foi configurada neste ambiente. Atualize a configuração da aplicação e tente novamente.",
        );
      } else if (
        message.includes("vagas") ||
        message.includes("Escolha outro endereço")
      ) {
        setNotice(message);
      } else {
        setNotice("Não foi possível concluir. Confira os dados e tente novamente.");
      }
    } finally {
      setBusy(false);
      if (turnstileSiteKey) {
        setCaptchaToken("");
        setCaptchaResetKey((current) => current + 1);
      }
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
                  <div className="anti-bot-field" aria-hidden="true">
                    <label>
                      Site
                      <input
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </label>
                  </div>
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
                  minLength={6}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                />
                {signup && (
                  <small>
                    Use pelo menos 6 caracteres e prefira uma senha única.
                  </small>
                )}
              </label>
              {!signup && (
                <div className="auth-help-row">
                  <Link href="/recuperar-senha">Esqueci minha senha</Link>
                </div>
              )}
              {signup && (
                <label className="check-label auth-legal-consent">
                  <input name="legal" type="checkbox" required />
                  <span>
                    Li e aceito os <Link href="/termos">Termos de Uso</Link> e a{" "}
                    <Link href="/privacidade">Política de Privacidade</Link>.
                  </span>
                </label>
              )}
              {turnstileSiteKey && (
                <Turnstile
                  key={captchaResetKey}
                  siteKey={turnstileSiteKey}
                  onToken={setCaptchaToken}
                />
              )}
              <button
                className="primary"
                disabled={
                  busy || (Boolean(turnstileSiteKey) && !captchaToken)
                }
              >
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
            {" · "}
            <Link href="/termos">Termos de uso</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
