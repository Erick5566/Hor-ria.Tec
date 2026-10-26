"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": (errorCode?: string) => void;
          "timeout-callback": () => void;
          language: "pt-br";
          theme: "auto";
          size: "normal" | "compact" | "flexible";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-horaria-turnstile="true"]',
    );
    const script = existing || document.createElement("script");
    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const failed = () => {
      cleanup();
      script.remove();
      scriptPromise = null;
      reject(new Error("Turnstile indisponível"));
    };
    const loaded = () => {
      if (!window.turnstile) return failed();
      cleanup();
      resolve();
    };
    const timer = setTimeout(failed, 15000);
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.horariaTurnstile = "true";
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

export default function Turnstile({
  siteKey,
  onToken,
  size = "flexible",
}: {
  siteKey: string;
  onToken: (token: string) => void;
  size?: "normal" | "compact" | "flexible";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [narrow, setNarrow] = useState(true);
  const widgetSize = narrow ? "compact" : size;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => setNarrow(container.clientWidth < 300);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let widgetId = "";
    onToken("");
    setError("");
    const fail = (message: string) => {
      if (!active) return;
      onToken("");
      setError(message);
    };

    loadScript()
      .then(() => {
        if (!active || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => {
            if (!active) return;
            setError("");
            onToken(token);
          },
          "expired-callback": () => fail("A verificação expirou. Tente novamente."),
          "timeout-callback": () => fail("O tempo da verificação terminou. Tente novamente."),
          language: "pt-br",
          "error-callback": (code) => {
            console.error(
              "[Turnstile] Falha no desafio:",
              code || "desconhecido",
            );
            fail(
              code === "110200"
                ? "A verificação não está configurada para este endereço. Entre em contato com o suporte."
                : ["110100", "110110", "400020", "400070"].includes(code || "")
                  ? "A verificação de segurança está indisponível. Entre em contato com o suporte."
                  : "Não foi possível concluir a verificação de segurança. Confira sua conexão e tente novamente.",
            );
          },
          theme: "auto",
          size: widgetSize,
        });
      })
      .catch((error) => {
        console.error("[Turnstile] Falha ao carregar script:", error);
        fail("Não foi possível carregar a verificação de segurança. Confira sua conexão e tente novamente.");
      });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken, widgetSize, attempt]);

  return (
    <div className="booking-turnstile" aria-label="Verificação de segurança">
      <div ref={ref} />
      {error && (
        <div className="turnstile-feedback">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

