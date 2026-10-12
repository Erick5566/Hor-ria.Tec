"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Route = { href: string; label: string };
type TutorialStep = {
  id: string;
  title: string;
  description: string;
  href?: string;
  target?: string;
  kind: "welcome" | "navigate" | "explain" | "click" | "type" | "finish";
};
type Progress = {
  eligible: boolean;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | null;
  step: number;
};

const descriptions: Record<string, string> = {
  "/painel": "Veja o movimento da assistência, as ordens em andamento e os indicadores. Os números são atualizados com os dados cadastrados.",
  "/painel/ordens/nova": "Registre um atendimento: cliente, aparelho, fotos, estado de entrada e defeito relatado. Vamos mostrar o formulário sem gravar nada automaticamente.",
  "/painel/ordens": "Acompanhe todas as OS e use a visualização de bancada para organizar os reparos por etapa.",
  "/painel/orcamentos": "Consulte os orçamentos preparados e acompanhe as aprovações dos clientes.",
  "/painel/agenda": "Organize recebimentos, retiradas e compromissos, evitando horários sobrepostos.",
  "/painel/clientes": "Cadastre os clientes e consulte seu histórico. Vamos experimentar abrir o formulário, sem criar um cliente fictício.",
  "/painel/estoque": "Controle entradas, saídas, peças e quantidades. Esta área só aparece para funcionários autorizados.",
  "/painel/vendas": "Registre as vendas de produtos e acompanhe as movimentações vinculadas.",
  "/painel/equipamentos": "Consulte aparelhos, identificação e histórico de serviços realizados.",
  "/painel/seminovos": "Acompanhe avaliação, preparação e comercialização de aparelhos usados.",
  "/painel/vitrine": "Gerencie os anúncios de aparelhos e produtos da vitrine pública.",
  "/painel/pos-venda": "Organize o contato com clientes após a entrega e acompanhe o atendimento.",
  "/painel/servicos": "Configure os tipos de serviço oferecidos, seus valores, duração e garantia.",
  "/painel/financeiro": "Veja receitas, despesas, saldo e relatórios. Somente o gestor autorizado pode visualizar estas informações.",
  "/painel/notas-fiscais": "Consulte documentos fiscais e os procedimentos de emissão disponíveis.",
  "/painel/equipe": "Convide funcionários por links individuais e controle cargos, vagas e permissões.",
  "/painel/empresa": "Configure nome, endereço, WhatsApp, logotipo e horários da assistência.",
  "/painel/minha-pagina": "Personalize a apresentação pública da assistência para seus clientes.",
  "/painel/configuracoes": "Ajuste preferências, comportamento e aparência do sistema.",
  "/painel/ajuda": "Encontre orientações e reinicie este tutorial sempre que precisar.",
};

export function buildTutorialSteps(routes: Route[]): TutorialStep[] {
  const steps: TutorialStep[] = [
    {
      id: "welcome",
      title: "Bem-vindo à Horária!",
      description: "Vamos conhecer sua assistência por dentro. A cada etapa vou destacar um botão, explicar para que serve e mostrar onde clicar. Nenhum cadastro de exemplo será salvo automaticamente.",
      kind: "welcome",
    },
  ];
  for (const route of routes) {
    steps.push({
      id: "nav:" + route.href,
      title: "Conheça: " + route.label,
      description: descriptions[route.href] || "Abra esta área para conhecer suas funções.",
      href: route.href,
      target: '[data-tour-href="' + route.href + '"]',
      kind: "navigate",
    });
    if (route.href === "/painel") {
      steps.push({
        id: "dashboard",
        title: "Seu painel de controle",
        description: "Este resumo ajuda você a acompanhar o negócio. Observe os indicadores; eles só mudam quando há movimentações reais. Toque em Próximo para continuar.",
        href: route.href,
        target: '[data-tour="dashboard-hero"]',
        kind: "explain",
      });
    }
    if (route.href === "/painel/ordens") {
      steps.push({
        id: "order-search",
        title: "Encontre um atendimento",
        description: "Use a busca para localizar uma OS pelo número, cliente ou aparelho. Você pode clicar e procurar sem alterar nenhum serviço.",
        href: route.href,
        target: '[data-tour="order-search"]',
        kind: "explain",
      });
    }
    if (route.href === "/painel/ordens/nova") {
      steps.push({
        id: "order-customer",
        title: "Primeiro: quem trouxe o aparelho?",
        description: "Este campo permite escolher um cliente já cadastrado ou começar um novo registro. Toque para conhecer as opções. Não precisa salvar uma OS de teste.",
        href: route.href,
        target: '[data-tour="order-customer"]',
        kind: "explain",
      });
    }
    if (route.href === "/painel/clientes") {
      steps.push({
        id: "client-add",
        title: "Experimente abrir o cadastro",
        description: "Agora toque em Novo cliente. Vou mostrar o formulário de cadastro sem enviar nenhuma informação.",
        href: route.href,
        target: '[data-tour="customer-create"]',
        kind: "click",
      });
      steps.push({
        id: "client-name",
        title: "Conheça o campo Nome",
        description: "Toque neste campo e digite um nome para experimentar. O texto só vira cadastro quando você escolhe Salvar; não vamos fazer isso por você.",
        href: route.href,
        target: '[data-tour="customer-name"]',
        kind: "type",
      });
      steps.push({
        id: "client-phone",
        title: "Informações para contato",
        description: "No WhatsApp você informaria o contato real do cliente. Para este treino, não precisa preencher nem salvar. Continue e visite as outras áreas.",
        href: route.href,
        target: '[data-tour="customer-whatsapp"]',
        kind: "explain",
      });
    }
    if (route.href === "/painel/equipamentos") {
      steps.push({
        id: "equipment-add",
        title: "Conheça o cadastro de aparelhos",
        description: "Toque em Novo equipamento para abrir o formulário. Você poderá associar um aparelho a um cliente, mas não faremos um cadastro fictício.",
        href: route.href,
        target: '[data-tour="equipment-create"]',
        kind: "click",
      });
      steps.push({
        id: "equipment-customer",
        title: "Vincule ao cliente certo",
        description: "Todo aparelho precisa ser associado ao cliente. Abra a lista e veja as opções; só salve se estiver cadastrando um aparelho real.",
        href: route.href,
        target: '[data-tour="equipment-customer"]',
        kind: "explain",
      });
    }
    if (route.href === "/painel/estoque") {
      steps.push({
        id: "stock-add",
        title: "Como cadastrar produtos ou peças",
        description: "Toque no botão de cadastro para conhecer os campos. Esta etapa é apenas uma demonstração, sem criar estoque fictício.",
        href: route.href,
        target: '[data-tour="stock-create"]',
        kind: "click",
      });
      steps.push({
        id: "stock-name",
        title: "Descrição do item",
        description: "Aqui você informa o nome de uma peça ou produto, depois sua quantidade e os valores. Pode experimentar digitar sem salvar.",
        href: route.href,
        target: '[data-tour="stock-name"]',
        kind: "type",
      });
    }
    if (route.href === "/painel/equipe") {
      steps.push({
        id: "team-invite",
        title: "Cadastre sua equipe",
        description: "Use Adicionar membro para escolher o cargo e convidar um técnico ou atendente. Não vamos enviar convites de teste automaticamente.",
        href: route.href,
        target: '[data-tour="team-add"]',
        kind: "explain",
      });
    }
  }
  steps.push({
    id: "finish",
    title: "Você já conhece a Horária!",
    description: "Pronto! Você pode trabalhar normalmente. Se quiser rever algum detalhe, abra Ajuda e toque em Rever tutorial. O progresso fica salvo em sua conta.",
    kind: "finish",
  });
  return steps;
}

function visibleElement(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      rect.width > 0 && rect.height > 0 &&
      rect.right > 0 && rect.left < window.innerWidth &&
      rect.bottom > 0 && rect.top < window.innerHeight &&
      style.visibility !== "hidden" && style.display !== "none"
    ) return el;
  }
  return null;
}

export default function InteractiveTutorial({
  userId,
  availableRoutes,
  openMobileMenu,
}: {
  userId: string;
  availableRoutes: Route[];
  openMobileMenu: () => void;
}) {
  const router = useRouter();
  const path = usePathname();
  const steps = useMemo(() => buildTutorialSteps(availableRoutes), [availableRoutes]);
  const [loaded, setLoaded] = useState(false);
  const [savedStatus, setSavedStatus] = useState<Progress["status"]>(null);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<DOMRect | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [error, setError] = useState("");
  const indexRef = useRef(index);
  indexRef.current = index;
  const step = steps[Math.min(index, steps.length - 1)];
  const stepRef = useRef(step);
  stepRef.current = step;
  const finishRequest = useRef(false);

  const persist = useCallback(async (nextIndex: number, status: "ACTIVE" | "PAUSED" | "COMPLETED") => {
    setSavedStatus(status);
    if (!supabase) return;
    const result = await supabase.rpc("tutorial_save_progress", {
      p_step: Math.min(nextIndex, 150),
      p_status: status,
    });
    if (result.error) setError("Não foi possível sincronizar o progresso. Você ainda pode continuar nesta sessão.");
  }, []);

  const next = useCallback(() => {
    if (finishRequest.current) return;
    const current = indexRef.current;
    if (current >= steps.length - 1) {
      finishRequest.current = true;
      setActive(false);
      void persist(current, "COMPLETED");
    } else {
      setIndex(current + 1);
      void persist(current + 1, "ACTIVE");
    }
  }, [persist, steps.length]);

  const back = useCallback(() => {
    setIndex((current) => {
      const nextIndex = Math.max(current - 1, 0);
      void persist(nextIndex, "ACTIVE");
      return nextIndex;
    });
  }, [persist]);

  const pause = useCallback(() => {
    setActive(false);
    setSpot(null);
    void persist(indexRef.current, "PAUSED");
  }, [persist]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setActive(false);
    setIndex(0);
    setSavedStatus(null);
    finishRequest.current = false;
    if (!supabase || !userId) return;
    void (async () => {
      const result = await supabase.rpc("tutorial_get_progress");
      if (cancelled) return;
      if (result.error) {
        setError("O guia estará disponível no menu Ajuda assim que o serviço de progresso estiver configurado.");
        setLoaded(true);
        return;
      }
      const state = result.data as Progress | null;
      setSavedStatus(state?.status || null);
      const firstAccess = Boolean(state?.eligible && !state?.status);
      const resume = state?.status === "ACTIVE";
      setIndex(Math.max(0, Math.min(Number(state?.step) || 0, steps.length - 1)));
      setActive(firstAccess || resume);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId, steps.length]);

  useEffect(() => {
    const restart = () => {
      finishRequest.current = false;
      setError("");
      setIndex(0);
      setActive(true);
      void persist(0, "ACTIVE");
    };
    const resume = () => {
      finishRequest.current = false;
      setError("");
      setActive(true);
      if (savedStatus === "COMPLETED") {
        setIndex(0);
        void persist(0, "ACTIVE");
      } else void persist(indexRef.current, "ACTIVE");
    };
    window.addEventListener("horaria:start-tutorial", restart);
    window.addEventListener("horaria:resume-tutorial", resume);
    return () => {
      window.removeEventListener("horaria:start-tutorial", restart);
      window.removeEventListener("horaria:resume-tutorial", resume);
    };
  }, [persist, savedStatus]);

  useEffect(() => {
    if (!active || !loaded || !step) return;
    if (step.kind === "welcome" || step.kind === "finish") {
      setSpot(null); setTargetFound(false); return;
    }
    if (step.kind === "navigate" && window.innerWidth < 1024 && !visibleElement(step.target || "")) {
      openMobileMenu();
    }
  }, [active, loaded, index, step, openMobileMenu, path]);

  useEffect(() => {
    if (!active || !step?.target) return;
    let handle = 0;
    const measure = () => {
      cancelAnimationFrame(handle);
      handle = requestAnimationFrame(() => {
        const target = visibleElement(step.target!);
        setTargetFound(Boolean(target));
        if (target) {
          const r = target.getBoundingClientRect();
          setSpot(new DOMRect(r.x, r.y, r.width, r.height));
        } else setSpot(null);
      });
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class","style","aria-expanded"] });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      cancelAnimationFrame(handle);
    };
  }, [active, index, step?.target, path]);

  useEffect(() => {
    if (!active || !step?.target || !["click", "navigate", "type"].includes(step.kind)) return;
    const onClick = (event: MouseEvent) => {
      if (step.kind === "type") return;
      const hit = event.target instanceof Element && event.target.closest(step.target!);
      if (hit) next();
    };
    const onInput = (event: Event) => {
      if (step.kind !== "type") return;
      if (event.target instanceof HTMLInputElement &&
          event.target.matches(step.target!) &&
          event.target.value.trim().length >= 2) next();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
    };
  }, [active, index, next, step]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") pause();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, pause]);

  if (!loaded || !active || !step) return null;

  const isDialog = step.kind === "welcome" || step.kind === "finish";
  const needsRoute = Boolean(step.href && path !== step.href && step.kind !== "navigate");
  const openStep = () => {
    if (step.kind === "navigate" && step.href) {
      router.push(step.href);
      next();
    } else if (needsRoute && step.href) router.push(step.href);
    else next();
  };

  return (
    <div className="horaria-tour" aria-label="Tutorial interativo da Horária">
      {isDialog ? <div className="horaria-tour-dim" /> : null}
      {!isDialog && spot && !needsRoute && (
        <div
          className="horaria-tour-spotlight"
          aria-hidden="true"
          style={{
            top: Math.max(0, spot.top - 5),
            left: Math.max(0, spot.left - 5),
            width: spot.width + 10,
            height: spot.height + 10,
          }}
        />
      )}
      <section className={"horaria-tour-card" + (isDialog ? " is-welcome" : "")}
        role="dialog" aria-modal={isDialog} aria-labelledby="horaria-tour-title"
        aria-describedby="horaria-tour-description">
        <div className="horaria-tour-overline">
          <strong>Conheça a Horária</strong>
          <span>{index + 1} de {steps.length}</span>
        </div>
        <div className="horaria-tour-track" role="progressbar" aria-valuemin={0}
          aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label="Etapas concluídas">
          <span style={{width: ((index + 1) / steps.length * 100) + "%"}} />
        </div>
        <h2 id="horaria-tour-title">{step.title}</h2>
        <p id="horaria-tour-description">{step.description}</p>
        {!isDialog && needsRoute && <p className="horaria-tour-note">Vamos abrir a página correspondente para mostrar esta função.</p>}
        {!isDialog && !needsRoute && step.target && !targetFound &&
          <p className="horaria-tour-note">Se o botão não estiver visível, use Abrir página ou Próximo. O sistema pode estar carregando esta função.</p>}
        {error && <p className="horaria-tour-error" role="status">{error}</p>}
        <div className="horaria-tour-actions">
          <button type="button" className="horaria-tour-later" onClick={pause}>Agora não</button>
          <div>
            <button type="button" className="horaria-tour-back" disabled={index===0} onClick={back}>← Voltar</button>
            <button type="button" className="horaria-tour-next" onClick={openStep}>
              {step.kind==="finish" ? "Concluir" :
               step.kind==="welcome" ? "Começar" :
               step.kind==="navigate" || needsRoute ? "Abrir página →" :
               step.kind==="click" ? "Pular demonstração →" : "Próximo →"}
            </button>
          </div>
        </div>
        {!isDialog && <small className="horaria-tour-hint">Você pode tocar na área destacada ou avançar pelas setas. Esc fecha o guia.</small>}
      </section>
    </div>
  );
}
