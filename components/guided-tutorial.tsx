"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AccessContext } from "@/lib/access";
import { buildTutorialSteps, type TourStep } from "@/lib/tutorial-steps";

type RemoteTour = { automatico: boolean; status: "pending" | "active" | "done" | "skipped" | "none"; passo: number };
type Spotlight = { left: number; top: number; width: number; height: number; visible: boolean };
const emptySpotlight: Spotlight = { left: 0, top: 0, width: 0, height: 0, visible: false };

export default function GuidedTutorial({
  userId,
  access,
  openSidebar,
}: {
  userId: string;
  access: AccessContext;
  openSidebar: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [enabledRoutes, setEnabledRoutes] = useState<ReadonlySet<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const [spotlight, setSpotlight] = useState<Spotlight>(emptySpotlight);
  const [error, setError] = useState("");
  const [viewport, setViewport] = useState({ width: 1000, height: 700 });
  const currentTarget = useRef<HTMLElement | null>(null);
  const steps = useMemo(() => buildTutorialSteps(access, enabledRoutes), [access, enabledRoutes]);
  const current = steps[Math.min(index, steps.length - 1)] as TourStep | undefined;
  const isOnPage = !current?.path || pathname === current.path;

  const save = useCallback(async (status: "active" | "done" | "skipped", step: number) => {
    if (!supabase) return;
    const result = await supabase.rpc("atualizar_tutorial", {
      p_status: status,
      p_passo: step,
    });
    if (result.error) setError("Não foi possível salvar o progresso. Você ainda pode continuar.");
    else setError("");
  }, []);

  useEffect(() => {
    const anchors = document.querySelectorAll<HTMLAnchorElement>(".main-sidebar nav a[href]");
    setEnabledRoutes(new Set(Array.from(anchors, (anchor) => anchor.getAttribute("href") || "")));
  }, [access.company?.role, access.company?.featureFlags]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setShow(false);
    if (!supabase || !userId) return;
    void supabase.rpc("consultar_tutorial").then(({ data, error: requestError }) => {
      if (cancelled) return;
      if (requestError) {
        setReady(true);
        setError("O tutorial está temporariamente indisponível.");
        return;
      }
      const result = data as RemoteTour | null;
      if (result && (result.status === "pending" || result.status === "active")) {
        setIndex(Math.min(Math.max(result.passo || 0, 0), 499));
        setShow(true);
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const setStep = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(next, steps.length - 1));
    setTouched(false);
    setIndex(bounded);
    void save("active", bounded);
  }, [save, steps.length]);

  const quit = useCallback((status: "done" | "skipped") => {
    setShow(false);
    setSpotlight(emptySpotlight);
    void save(status, Math.min(index, steps.length - 1));
  }, [save, index, steps.length]);

  // A máscara apenas destaca. O usuário continua operando os controles verdadeiros.
  useEffect(() => {
    if (!show || !current || !isOnPage || current.kind === "welcome" || current.kind === "finish") {
      currentTarget.current = null;
      setSpotlight(emptySpotlight);
      return;
    }
    let frame = 0;
    let previous = "";
    const update = () => {
      const element = current.selector
        ? document.querySelector<HTMLElement>(current.selector)
        : null;
      currentTarget.current = element;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const rect = element?.getBoundingClientRect();
      const visible = Boolean(rect && rect.width > 0 && rect.height > 0 &&
        rect.right > 0 && rect.left < width && rect.bottom > 0 && rect.top < height);
      const next: Spotlight = visible && rect
        ? {
            left: Math.max(4, rect.left - 5),
            top: Math.max(4, rect.top - 5),
            width: Math.min(width - Math.max(4, rect.left - 5) - 4, rect.width + 10),
            height: Math.min(height - Math.max(4, rect.top - 5) - 4, rect.height + 10),
            visible: true,
          }
        : emptySpotlight;
      const serial = JSON.stringify(next);
      if (serial !== previous) {
        previous = serial;
        setSpotlight(next);
      }
      setViewport({ width, height });
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const scrollParent = document.querySelector(".main-sidebar nav");
    scrollParent?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: false });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      scrollParent?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      currentTarget.current = null;
    };
  }, [show, current, pathname, isOnPage]);

  useEffect(() => {
    if (!show || !current || !isOnPage) return;
    if (current.kind !== "navigate" && current.kind !== "click" && current.kind !== "type") return;
    const onClick = (event: MouseEvent) => {
      if (current.kind === "type" || !currentTarget.current) return;
      if (event.target instanceof Node && currentTarget.current.contains(event.target)) {
        setStep(index + 1);
      }
    };
    const onInput = (event: Event) => {
      if (current.kind === "type" && event.target instanceof Node &&
          currentTarget.current?.contains(event.target)) setTouched(true);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
    };
  }, [show, current, isOnPage, setStep, index]);

  useEffect(() => {
    if (!show) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShow(false);
        setSpotlight(emptySpotlight);
        // Pausa o tutorial sem marcar como concluído.
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show]);

  if (!ready || !userId || !access.company) return null;

  const openTraining = () => {
    setError("");
    setIndex(0);
    setTouched(false);
    setShow(true);
    void save("active", 0);
  };

  const navigateToStep = () => {
    if (!current?.path) return;
    if (window.matchMedia("(max-width: 767px)").matches && current.kind === "navigate") {
      // O menu lateral é o ponto de referência também no celular.
      openSidebar();
    }
    router.push(current.path);
    if (current.kind === "navigate") setStep(index + 1);
  };

  const cardWidth = Math.min(360, viewport.width - 24);
  let cardLeft = Math.max(12, (viewport.width - cardWidth) / 2);
  let cardTop = Math.max(16, (viewport.height - 305) / 2);
  if (spotlight.visible && viewport.width >= 768) {
    cardLeft = spotlight.left + spotlight.width + 16;
    if (cardLeft + cardWidth > viewport.width - 12)
      cardLeft = Math.max(12, spotlight.left - cardWidth - 16);
    cardTop = Math.min(Math.max(12, spotlight.top), Math.max(12, viewport.height - 315));
  } else if (spotlight.visible) {
    cardTop = Math.max(12, viewport.height - 300);
  }

  return (
    <>
      {!show && (
        <button
          type="button"
          className="horaria-tour-launch"
          onClick={openTraining}
          aria-label="Iniciar ou rever o tutorial interativo"
          title="Aprenda a usar cada função"
        >
          <span aria-hidden="true">✦</span> Conheça a Horária
        </button>
      )}
      {show && current && (
        <div className="horaria-tour-root" aria-label="Treinamento interativo da Horária">
          {spotlight.visible && (
            <div
              aria-hidden="true"
              className="horaria-tour-focus"
              style={{
                left: spotlight.left,
                top: spotlight.top,
                width: spotlight.width,
                height: spotlight.height,
              }}
            />
          )}
          {!spotlight.visible && <div aria-hidden="true" className="horaria-tour-backdrop" />}
          <section
            className={"horaria-tour-card" +
              (current.kind === "welcome" || current.kind === "finish" ? " is-centered" : "")}
            role="dialog"
            aria-modal={false}
            aria-labelledby="horaria-tour-title"
            aria-describedby="horaria-tour-description"
            style={{ width: cardWidth, left: cardLeft, top: cardTop }}
          >
            <div className="horaria-tour-card-top">
              <span>✦ GUIA INTERATIVO</span>
              <span>{index + 1} / {steps.length}</span>
            </div>
            <div className="horaria-tour-progress" aria-label="Progresso do treinamento">
              <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
            </div>
            <h2 id="horaria-tour-title">{current.title}</h2>
            <p id="horaria-tour-description">{current.description}</p>
            {current.kind === "navigate" && isOnPage && spotlight.visible && (
              <p className="horaria-tour-hint">Toque na opção destacada para continuar.</p>
            )}
            {current.kind === "click" && spotlight.visible && (
              <p className="horaria-tour-hint">Clique no botão indicado. Nenhum cadastro será enviado automaticamente.</p>
            )}
            {current.kind === "type" && (
              <p className="horaria-tour-hint">
                {touched ? "Campo utilizado! Você pode continuar ou preencher apenas dados verdadeiros." :
                  "Toque no campo destacado para praticar. Este passo é opcional."}
              </p>
            )}
            {current.path && !isOnPage && (
              <p className="horaria-tour-hint">Para este passo, abra a página correspondente.</p>
            )}
            {current.kind !== "welcome" && current.kind !== "finish" && isOnPage &&
              !spotlight.visible && (
                <p className="horaria-tour-hint">O elemento pode estar em outro trecho da página. Use as opções abaixo para continuar.</p>
              )}
            {error && <p className="horaria-tour-error" role="status">{error}</p>}
            <div className="horaria-tour-actions">
              {current.kind === "finish" ? (
                <button className="horaria-tour-next" type="button" onClick={() => quit("done")}>
                  Concluir tutorial ✓
                </button>
              ) : (
                <>
                  <button type="button" className="horaria-tour-back"
                    disabled={index === 0} onClick={() => setStep(index - 1)}>
                    ← Voltar
                  </button>
                  {current.path && (!isOnPage || current.kind === "navigate") ? (
                    <button className="horaria-tour-next" type="button" onClick={navigateToStep}>
                      Abrir área →
                    </button>
                  ) : (
                    <button className="horaria-tour-next" type="button" onClick={() => setStep(index + 1)}>
                      {current.kind === "welcome" ? "Começar →" :
                        current.optional && !touched ? "Continuar / pular →" : "Próximo →"}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="horaria-tour-footer">
              <button type="button" onClick={() => { setShow(false); setSpotlight(emptySpotlight); }}>
                Continuar depois
              </button>
              <button type="button" onClick={() => quit("skipped")}>Não mostrar novamente</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
