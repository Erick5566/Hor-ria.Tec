"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, syncServerSession } from "@/lib/supabase";
export default function TeamInvitation() {
  const search = useSearchParams();
  const token = search.get("token") || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token,
    );
  const next = `/convite?token=${encodeURIComponent(token)}`;
  async function accept() {
    setBusy(true);
    setError("");
    try {
      if (!supabase) throw new Error("Acesso indisponível.");
      const { data } = await supabase.auth.getSession();
      if (!data.session)
        throw new Error(
          "Entre ou crie sua conta com o e-mail convidado e confirme seu e-mail.",
        );
      const result = await supabase.rpc("accept_team_invitation", {
        p_token: token,
      });
      if (result.error) throw result.error;
      await syncServerSession(data.session);
      window.location.replace(
        result.data.role === "TECHNICIAN"
          ? "/painel/ordens?visao=bancada"
          : result.data.role === "ATTENDANT"
            ? "/painel/ordens/nova"
            : "/painel",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível aceitar o convite.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-simple-page">
      <section className="auth-simple-card">
        <h1>Convite para a equipe</h1>
        <p>
          Use a conta do e-mail convidado. O convite expira em 48 horas e pode
          ser usado uma vez.
        </p>
        {valid ? (
          <>
            <Link href={`/entrar?next=${encodeURIComponent(next)}`}>
              Entrar na minha conta
            </Link>
            <Link href={`/cadastro?next=${encodeURIComponent(next)}`}>
              Criar uma conta
            </Link>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void accept()}
            >
              {busy ? "Validando…" : "Aceitar convite"}
            </button>
          </>
        ) : (
          <p role="alert">Link de convite inválido.</p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
