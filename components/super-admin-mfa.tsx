"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
    router.replace(next);
    router.refresh();
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
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;

      for (const factor of factors.data.totp.filter(
        (item) => item.status !== "verified",
      )) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const result = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Horária SUPER_ADMIN",
      });
      if (result.error) throw result.error;

      setEnrollment({
        id: result.data.id,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      });
      setFactorId(result.data.id);
      setCode("");
    } catch {
      setError(
        "Não foi possível iniciar o 2FA. Confira se MFA está permitido no Supabase Auth.",
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
      await finish();
    } catch {
      setError(
        "Código inválido ou expirado. Gere um novo código e tente novamente.",
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
                    <strong>Configure seu aplicativo autenticador.</strong>
                    <p className="mfa-note">
                      Use Google Authenticator, Microsoft Authenticator,
                      1Password ou outro aplicativo compatível com TOTP.
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={startEnrollment}
                  >
                    {busy ? "Preparando…" : "Ativar 2FA →"}
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
                        Gerar novo QR Code
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
