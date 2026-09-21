"use client";

import { useEffect, useState } from "react";
import { Brand } from "./brand";
import { supabase, syncServerSession } from "@/lib/supabase";

type Enrollment = {
  id: string;
  qrCode: string;
  secret: string;
};

export default function SuperAdminMfa({
  next,
  email,
}: {
  next: string;
  email: string;
}) {
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [factorId, setFactorId] = useState("");
  const [hasVerifiedFactor, setHasVerifiedFactor] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    const session = await supabase!.auth.getSession();
    if (!session.data.session)
      throw new Error("Sua sessão expirou. Entre novamente.");
    await syncServerSession(session.data.session);

    // Faz uma navegação completa depois de gravar o novo JWT AAL2 no cookie.
    // Evita uma corrida entre router.replace/router.refresh e o layout SSR.
    window.location.replace(next);
  }

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    (async () => {
      try {
        const assurance =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error) throw assurance.error;
        if (assurance.data.currentLevel === "aal2") {
          await finish();
          return;
        }

        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) throw factors.error;
        const verified = factors.data.totp.find(
          (factor) => factor.status === "verified",
        );
        if (!active) return;
        if (verified) {
          setFactorId(verified.id);
          setHasVerifiedFactor(true);
        }
      } catch {
        if (active)
          setError(
            "Não foi possível carregar a verificação em duas etapas. Tente novamente.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
    // Executa uma única vez para a sessão autenticada atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnrollment() {
    if (!supabase) return;
    setBusy(true);
    setError("");

    // Nunca deixe um QR antigo visível enquanto tentamos gerar outro.
    // Isso evita que o usuário escaneie um fator que acabou de ser substituído.
    setEnrollment(null);
    setFactorId("");
    setCode("");

    try {
      const session = await supabase.auth.getSession();
      if (session.error) throw session.error;
      if (!session.data.session) {
        throw new Error("SESSION_EXPIRED");
      }

      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;

      for (const factor of factors.data.totp.filter(
        (item) => item.status !== "verified",
      )) {
        const removed = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });

        if (removed.error) {
          // Uma sessão antiga pode falhar ao remover um fator pendente.
          // Atualizamos o token e tentamos uma vez; se ainda falhar,
          // seguimos com um nome único para não bloquear um novo QR.
          const refreshed = await supabase.auth.refreshSession();
          if (!refreshed.error && refreshed.data.session) {
            const retry = await supabase.auth.mfa.unenroll({
              factorId: factor.id,
            });
            if (retry.error) {
              console.warn("Não foi possível limpar fator MFA pendente.", retry.error);
            }
          } else {
            console.warn(
              "Não foi possível atualizar a sessão para limpar MFA pendente.",
              removed.error,
            );
          }
        }
      }

      const result = await supabase.auth.mfa.enroll({
        factorType: "totp",
        // O Supabase exige friendly_name único por usuário.
        // Um nome único impede que um fator pendente antigo bloqueie o novo QR.
        friendlyName: `Horária SUPER_ADMIN ${new Date().toISOString()}`,
      });
      if (result.error) throw result.error;

      setEnrollment({
        id: result.data.id,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      });
      setFactorId(result.data.id);
    } catch (cause) {
      console.error("Falha ao iniciar MFA do SUPER_ADMIN.", cause);
      const message = cause instanceof Error ? cause.message : "";

      setError(
        message === "SESSION_EXPIRED"
          ? "Sua sessão expirou. Entre novamente para gerar um novo QR Code."
          : "Não foi possível gerar um novo QR Code. Atualize a página e tente novamente. O QR anterior não deve ser usado.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !factorId) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Digite o código de 6 dígitos do aplicativo autenticador.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (result.error) throw result.error;

      // Depois que o fator atual foi verificado, a sessão já está em AAL2.
      // Limpamos fatores TOTP antigos que ficaram pendentes por tentativas anteriores.
      const factors = await supabase.auth.mfa.listFactors();
      if (!factors.error) {
        for (const factor of factors.data.totp.filter(
          (item) => item.status !== "verified",
        )) {
          const removed = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (removed.error) {
            console.warn("Não foi possível limpar fator MFA antigo.", removed.error);
          }
        }
      }

      await finish();
    } catch {
      setError(
        enrollment
          ? "Código inválido ou expirado. Use o código de 6 dígitos gerado pelo QR Code que está aparecendo nesta tela. Se necessário, clique em Gerar outro QR Code."
          : "Código inválido ou expirado. Confira se você está usando o autenticador correto desta conta.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mfa-page">
      <div className="mfa-shell">
        <Brand />
        <section className="mfa-card">
          <span className="mfa-security-badge">
            ◈ ACESSO SUPER_ADMIN PROTEGIDO
          </span>
          <h1>Verificação em duas etapas</h1>
          <p>
            A conta administrativa da Horária controla todas as empresas. Por
            isso, o painel só abre depois de confirmar um segundo fator.
          </p>
          {email && <p className="mfa-note">Conta: {email}</p>}

          {loading ? (
            <p>Verificando segurança da conta…</p>
          ) : (
            <>
              {error && (
                <p className="mfa-error" role="alert">
                  {error}
                </p>
              )}

              {!hasVerifiedFactor && !enrollment && (
                <div className="mfa-setup">
                  <div>
                    <strong>Gere um novo QR Code para este acesso.</strong>
                    <p className="mfa-note">
                      Escaneie o QR novo no Google Authenticator, Microsoft
                      Authenticator, 1Password ou outro aplicativo TOTP. Se
                      existir um cadastro antigo da Horária no celular, remova-o
                      para não usar o código errado.
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={startEnrollment}
                  >
                    {busy ? "Preparando…" : "Gerar novo QR Code →"}
                  </button>
                </div>
              )}

              {enrollment && (
                <div className="mfa-setup">
                  <strong>1. Escaneie o QR Code</strong>
                  <img
                    className="mfa-qr"
                    src={enrollment.qrCode}
                    alt="QR Code para configurar o autenticador"
                  />
                  <div className="mfa-secret">
                    <small>Ou digite esta chave manualmente:</small>
                    <code>{enrollment.secret}</code>
                  </div>
                  <strong>2. Confirme o código gerado</strong>
                </div>
              )}

              {(hasVerifiedFactor || enrollment) && (
                <form className="mfa-code-form" onSubmit={verify}>
                  {hasVerifiedFactor && !enrollment && (
                    <p className="mfa-note">
                      Abra seu aplicativo autenticador e informe o código atual.
                    </p>
                  )}
                  <label>
                    Código de 6 dígitos
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      required
                    />
                  </label>
                  <div className="mfa-actions">
                    <button className="primary" disabled={busy}>
                      {busy ? "Confirmando…" : "Confirmar e entrar →"}
                    </button>
                    {enrollment && (
                      <button
                        type="button"
                        className="outline"
                        disabled={busy}
                        onClick={startEnrollment}
                      >
                        Gerar outro QR Code
                      </button>
                    )}
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
