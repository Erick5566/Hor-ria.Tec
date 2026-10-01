"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand, MissingConfig } from "./brand";
import Turnstile from "./turnstile";
import { configured, supabase } from "@/lib/supabase";

export function RequestPasswordReset() {
  useEffect(() => {
    const { data } =
      supabase?.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          window.location.replace("/redefinir-senha");
        }
      }) || { data: null };

    return () => data?.subscription.unsubscribe();
  }, []);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  if (!configured) return <MissingConfig />;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    if (turnstileSiteKey && !captchaToken) {
      setError("Conclua a verificação de segurança para continuar.");
      return;
    }
    setBusy(true);
    try {
      const redirectTo = location.origin;
      const result = await supabase!.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
        ...(turnstileSiteKey ? { captchaToken } : {}),
      });
      if (result.error) throw result.error;
      setNotice("");
      setSent(true);
    } catch {
      setError("Não foi possível enviar o link agora. Tente novamente.");
    } finally {
      setBusy(false);
      if (turnstileSiteKey) {
        setCaptchaToken("");
        setCaptchaResetKey((current) => current + 1);
      }
    }
  }

  return (
    <main className="auth-simple-page">
      <section className="auth-simple-card">
        <Brand />
        {sent ? (
          <>
            <span className="check">✓</span>
            <span className="eyebrow">LINK SOLICITADO</span>
            <h1>Confira seu e-mail.</h1>
            <p>
              Se existir uma conta com esse endereço, você receberá um link
              seguro para criar uma nova senha.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <Link className="primary" href="/entrar">
                Voltar para entrar
              </Link>
              <button
                className="outline"
                type="button"
                onClick={() => {
                  setSent(false);
                  setError("");
                  setNotice("");
                }}
              >
                Tentar novamente
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="eyebrow">RECUPERAR ACESSO</span>
            <h1>Esqueceu sua senha?</h1>
            <p>Informe seu e-mail para receber o link de redefinição.</p>
            <form onSubmit={submit}>
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={200}
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {turnstileSiteKey && (
                <Turnstile
                  key={captchaResetKey}
                  siteKey={turnstileSiteKey}
                  onToken={setCaptchaToken}
                />
              )}
              <button
                className="primary"
                disabled={busy || (Boolean(turnstileSiteKey) && !captchaToken)}
              >
                {busy ? "Enviando…" : "Enviar link seguro"}
              </button>
            </form>
            {notice && <p className="notice success" role="status">{notice}</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
            <Link href="/entrar">← Voltar para entrar</Link>
          </>
        )}
      </section>
    </main>
  );
}

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!configured) return <MissingConfig />;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 5) {
      setError("Use uma senha com pelo menos 5 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }

    setBusy(true);
    try {
      const session = await supabase!.auth.getSession();
      if (!session.data.session)
        throw new Error("Abra novamente o link recebido por e-mail.");
      const result = await supabase!.auth.updateUser({ password });
      if (result.error) throw result.error;
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível redefinir a senha.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-simple-page">
      <section className="auth-simple-card">
        <Brand />
        {done ? (
          <>
            <span className="check">✓</span>
            <h1>Senha atualizada.</h1>
            <p>Seu novo acesso já está pronto para uso.</p>
            <Link className="primary" href="/entrar">
              Entrar na Horária
            </Link>
          </>
        ) : (
          <>
            <span className="eyebrow">NOVA SENHA</span>
            <h1>Crie uma nova senha.</h1>
            <p>Use pelo menos 5 caracteres e prefira uma senha única.</p>
            <form onSubmit={submit}>
              <label>
                Nova senha
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={5}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Confirmar nova senha
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={5}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Salvando…" : "Atualizar senha"}
              </button>
            </form>
            {error && <p className="notice error" role="alert">{error}</p>}
          </>
        )}
      </section>
    </main>
  );
}
