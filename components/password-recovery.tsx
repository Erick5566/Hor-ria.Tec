"use client";

import { useState } from "react";
import Link from "next/link";
import { Brand, MissingConfig } from "./brand";
import { configured, supabase } from "@/lib/supabase";

export function RequestPasswordReset() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  if (!configured) return <MissingConfig />;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const redirectTo = `${location.origin}/redefinir-senha`;
      const result = await supabase!.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (result.error) throw result.error;
      setNotice(
        "Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.",
      );
    } catch {
      setError("Não foi possível enviar o link agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-simple-page">
      <section className="auth-simple-card">
        <Brand />
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Enviando…" : "Enviar link seguro"}
          </button>
        </form>
        {notice && <p className="notice success" role="status">{notice}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <Link href="/entrar">← Voltar para entrar</Link>
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
    if (password.length < 8) {
      setError("Use uma senha com pelo menos 8 caracteres.");
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
            <p>Use pelo menos 8 caracteres e evite reutilizar senhas antigas.</p>
            <form onSubmit={submit}>
              <label>
                Nova senha
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
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
                  minLength={8}
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
