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
    if (existing) {
      if (existing.dataset.horariaTurnstileLoaded === "true") {
        existing.remove();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => {
            existing.remove();
            scriptPromise = null;
            reject(new Error("Turnstile indisponível"));
          },
          { once: true },
        );
        return;
      }
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.horariaTurnstile = "true";
    script.onload = () => {
      script.dataset.horariaTurnstileLoaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      scriptPromise = null;
      reject(new Error("Turnstile indisponível"));
    };
    document.head.appendChild(script);
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

    loadScript()
      .then(() => {
        if (!active || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": (code) => {
            console.error(
              "[Turnstile] Falha no desafio:",
              code || "desconhecido",
            );
            onToken("");
          },
          theme: "auto",
          size: widgetSize,
        });
      })
      .catch((error) => {
        console.error("[Turnstile] Falha ao carregar script:", error);
        onToken("");
      });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken, widgetSize]);

  return (
    <div className="booking-turnstile" aria-label="Verificação de segurança">
      <div ref={ref} />
    </div>
  );
}

