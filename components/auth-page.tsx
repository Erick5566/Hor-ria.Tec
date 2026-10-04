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
import { turnstileSiteKey } from "@/lib/turnstile-config";
import styles from "@/app/home.module.css";
import HorariaHeroBrand from "@/components/horaria-hero-brand";

type RegistrationStatus = {
  enabled: boolean;
  registrationEnabled: boolean;
  currentCompanies: number;
  maxCompanies: number;
  globalMaintenance: boolean;
};

const TERMS_VERSION = "2026-10-01";
const PRIVACY_VERSION = "2026-09-20";
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
    if (access.error) throw access.error;
    const context = access.data as AccessContext | null;
    if (!context?.authenticated) {
      throw new Error("Não foi possível validar o acesso desta conta.");
    }

    const requested = search.get("next");
    if (context.isSuperAdmin) {
      const destination = requested?.startsWith("/admin") ? requested : "/admin";
      router.replace(
        `/seguranca/mfa?next=${encodeURIComponent(destination)}`,
      );
    } else {
      router.replace(requested?.startsWith("/painel") ? requested : "/painel");
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
                terms_version: TERMS_VERSION,
                privacy_accepted_at: new Date().toISOString(),
                privacy_version: PRIVACY_VERSION,
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
    <main className={`${styles.page} ${styles.authViewport} ${signup ? styles.signupViewport : ""}`}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <span>{signup ? "Já tem conta?" : "Ainda não tem conta?"}</span>
          <Link
            className={styles.loginButton}
            href={signup ? "/entrar" : "/cadastro"}
          >
            {signup ? "Entrar" : "Criar conta"}
          </Link>
        </header>

        <div className={styles.decorations} aria-hidden="true">
          <span className={styles.decorSquareOne} />
          <span className={styles.decorSquareTwo} />
          <span className={styles.decorSquareThree} />
          <span className={styles.decorSquareFour} />
          <span className={styles.decorSquareFive} />
          <span className={styles.decorSquareSix} />
          <span className={styles.decorDotOne} />
          <span className={styles.decorDotTwo} />
          <span className={styles.decorDotThree} />
          <span className={styles.decorDotFour} />
          <span className={styles.decorPhoneOne} />
          <span className={styles.decorPhoneTwo} />
          <span className={styles.decorPhoneThree} />
          <span className={styles.decorTabletOne} />
          <span className={styles.decorTabletTwo} />
          <span className={styles.decorLaptopOne} />
          <span className={styles.decorLaptopTwo} />
          <span className={styles.decorDash} />
          <span className={styles.entryStamp}>ENTRADA</span>
        </div>

        <section className={styles.hero} aria-labelledby="auth-title">
          <div className={styles.brandSide}>
            <div className={styles.orbit} aria-hidden="true" />
            <HorariaHeroBrand />
            <p className={styles.eyebrow}>ASSISTÊNCIA TÉCNICA EM UM SÓ LUGAR</p>
            <h1 id="auth-title">
              Todo aparelho que entra
              <br />
              ganha uma etiqueta.
            </h1>
            <Link className={styles.authHomeLink} href="/">
              ← Voltar para o início
            </Link>
          </div>

          <div className={styles.tagStage}>
            <svg className={styles.string} viewBox="0 0 60 140" aria-hidden="true">
              <path d="M45 0 C45 24 58 39 53 58 C48 78 43 96 40 138" />
            </svg>

            <section
              className={styles.authTagCard}
              aria-label={signup ? "Criar conta Horária" : "Entrar na Horária"}
            >
              <span className={styles.hole} aria-hidden="true" />

              <div className={styles.tagHeader}>
                <strong>Horária</strong>
                <span>{signup ? "NOVO ESPAÇO" : "ACESSO"}</span>
              </div>

              {registration?.globalMaintenance && (
                <p className={styles.authNotice}>
                  Estamos realizando uma atualização. O acesso administrativo
                  continua disponível.
                </p>
              )}

              {closed ? (
                <div className={styles.authClosed}>
                  <p>
                    As novas vagas para esta fase da Horária estão temporariamente
                    encerradas.
                  </p>
                  <Link className={styles.authTopLink} href="/entrar">
                    Já tenho conta
                  </Link>
                </div>
              ) : (
                <form className={styles.authForm} onSubmit={submit}>
                  <div className={styles.authFieldsGrid}>
                    {signup && (
                      <>
                        <label className={styles.authField}>
                          <span className={styles.authLabel}>SEU NOME</span>
                          <input
                            className={styles.authInput}
                            name="responsavel"
                            required
                            minLength={2}
                            maxLength={120}
                            autoComplete="name"
                          />
                        </label>

                        <label className={styles.authField}>
                          <span className={styles.authLabel}>ASSISTÊNCIA</span>
                          <input
                            className={styles.authInput}
                            name="empresa"
                            required
                            minLength={2}
                            maxLength={100}
                            defaultValue={search.get("empresa") ?? ""}
                            placeholder="Nome da assistência"
                            autoComplete="organization"
                          />
                        </label>

                        <label className={styles.authField}>
                          <span className={styles.authLabel}>ENDEREÇO PÚBLICO</span>
                          <input
                            className={styles.authInput}
                            name="slug"
                            required
                            pattern="[a-z0-9]+(-[a-z0-9]+)*"
                            placeholder="minha-assistencia"
                            autoComplete="off"
                          />
                          <small className={styles.authHint}>
                            Letras minúsculas, números e hífens.
                          </small>
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

                    <label
                      className={`${styles.authField} ${signup ? "" : styles.authFieldFull}`}
                    >
                      <span className={styles.authLabel}>E-MAIL</span>
                      <input
                        className={styles.authInput}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="voce@suaassistencia.com"
                      />
                    </label>

                    <label
                      className={`${styles.authField} ${signup ? "" : styles.authFieldFull}`}
                    >
                      <span className={styles.authLabel}>SENHA</span>
                      <input
                        className={styles.authInput}
                        name="password"
                        type="password"
                        minLength={8}
                        autoComplete={signup ? "new-password" : "current-password"}
                        required
                        placeholder={signup ? "Mínimo de 8 caracteres" : "Sua senha"}
                      />
                      {signup && (
                        <small className={styles.authHint}>
                          Use pelo menos 8 caracteres e prefira uma senha única.
                        </small>
                      )}
                    </label>
                  </div>

                  {!signup && (
                    <div className={styles.authActionsRow}>
                      <span />
                      <Link className={styles.authHelpLink} href="/recuperar-senha">
                        Esqueci minha senha
                      </Link>
                    </div>
                  )}

                  {signup && (
                    <label className={styles.authLegal}>
                      <input name="legal" type="checkbox" required />
                      <span>
                        Li e aceito os <Link href="/termos">Termos de Uso</Link> e a{" "}
                        <Link href="/privacidade">Política de Privacidade</Link>.
                      </span>
                    </label>
                  )}

                  {turnstileSiteKey && (
                    <div className={styles.authCaptcha}>
                      <Turnstile
                        key={captchaResetKey}
                        siteKey={turnstileSiteKey}
                        onToken={setCaptchaToken}
                      />
                    </div>
                  )}

                  <div
                    className={`${styles.cutLine} ${styles.authCutLine}`}
                    aria-hidden="true"
                  >
                    <span />
                    <i />
                  </div>

                  <div className={styles.tagFooter}>
                    <div className={styles.barcodeWrap}>
                      <div className={styles.authBarcode} aria-hidden="true" />
                      <small>{signup ? "NOVO-ESPAÇO" : "ACESSO-HORARIA"}</small>
                    </div>
                    <button
                      className={styles.authSubmit}
                      disabled={busy || (Boolean(turnstileSiteKey) && !captchaToken)}
                    >
                      {busy
                        ? "Aguarde…"
                        : signup
                          ? "Criar conta"
                          : "Entrar"}
                    </button>
                  </div>
                </form>
              )}

              {notice && (
                <p className={styles.authNotice} role="status">
                  {notice}
                </p>
              )}

              <div className={styles.authBottom}>
                <span>
                  {signup ? "Já tem uma conta?" : "Ainda não usa a Horária?"}
                </span>
                <Link
                  className={styles.authSwitchLink}
                  href={signup ? "/entrar" : "/cadastro"}
                >
                  {signup ? "Entrar" : "Criar conta"}
                </Link>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
