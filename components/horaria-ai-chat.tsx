"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "./workspace";

type Line = { role: "user" | "assistant"; content: string };
type Mode = "support" | "company";
type AiReply = { reply?: string; error?: string; code?: string; origin?: string };
type CreditStatus = { availableUnits?: number; consumedUnits?: number };

const suggestions = [
  "Como cadastrar uma ordem de serviço?",
  "Como convidar um técnico?",
  "Como funcionam os pagamentos?",
  "Onde encontro o financeiro?",
];

export default function HorariaAiChat() {
  const { access } = useWorkspace();
  const [mode, setMode] = useState<Mode>("support");
  const [lines, setLines] = useState<Line[]>([
    { role: "assistant", content:
      "Olá! Eu sou o assistente da Horária. Posso te orientar sobre ordens de serviço, clientes, equipe, agenda e cobranças. Em que posso ajudar?" },
  ]);
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const companyAvailable = Boolean(access.company?.featureFlags.aiEnabled);

  useEffect(() => {
    mounted.current = true;
    if (supabase) {
      void supabase.rpc("ai_credit_status").then((r) => {
        if (mounted.current && !r.error) {
          const values = r.data as CreditStatus | null;
          setCredits(Math.max(0, Number(values?.availableUnits || 0)));
        }
      });
    }
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [lines, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (busy || message.length < 2 || message.length > 900) return;
    const before = lines;
    setLines([...before, { role: "user", content: message }]);
    setEntry("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          message,
          history: before.slice(-6),
        }),
      });
      const data = await response.json() as AiReply;
      if (!response.ok || !data.reply) {
        throw new Error(data.error || "Não foi possível responder agora.");
      }
      setLines((current) => [...current, { role: "assistant", content: data.reply! }]);
      if (data.origin === "openai-prepaid") setCredits(v => v === null ? null : Math.max(0, v - 1));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na comunicação com o chat.");
    } finally {
      setBusy(false);
    }
  }

  function selectMode(next: Mode) {
    if (busy || next === mode) return;
    setMode(next);
    setError("");
    setEntry("");
    setLines([{
      role: "assistant",
      content: next === "support"
        ? "Olá! Sou o suporte da Horária. Pergunte sobre as ferramentas e o funcionamento do sistema."
        : "Este assistente usa créditos pré-pagos da sua assistência para responder perguntas. Não salva dados, não cobra automaticamente e não envia mensagens por WhatsApp.",
    }]);
  }

  return (
    <section className="horaria-ai-chat panel" aria-label="Central Horária IA">
      <header className="horaria-ai-header">
        <span className="horaria-ai-avatar" aria-hidden="true">H</span>
        <div>
          <h2>Horária IA <span className="horaria-ai-label">Central de atendimento</span></h2>
          <p>Um único assistente para suporte, operação e integração futura ao WhatsApp.</p>
        </div>
      </header>
      <div className="horaria-ai-modes" role="group" aria-label="Modo de atendimento">
        <button type="button" aria-pressed={mode === "support"}
          onClick={() => selectMode("support")}>Suporte da Horária <small>Sem custo de API</small></button>
        <button type="button" aria-pressed={mode === "company"}
          onClick={() => selectMode("company")}>Assistente da assistência <small>{companyAvailable ? "Requer créditos" : "Aguardando ativação"}</small></button>
      </div>
      <div className="horaria-ai-status">
        {mode === "support" ? (
          <span>Respostas guiadas sobre o sistema — não é uma conversa paga com a OpenAI nesta fase.</span>
        ) : (
          <span>Créditos disponíveis: <strong>{credits === null ? "não consultados" : credits}</strong>. Só funciona após pagamento e ativação da API.</span>
        )}
      </div>
      <div className="horaria-ai-messages" role="log" aria-label="Histórico desta conversa" aria-live="polite">
        {lines.map((line, i) => (
          <div key={i} className={"horaria-ai-line " + (line.role === "user" ? "is-user" : "is-assistant")}>
            {line.role === "assistant" && <span className="horaria-ai-bubble-icon" aria-hidden="true">H</span>}
            <p>{line.content}</p>
          </div>
        ))}
        {busy && <p className="horaria-ai-thinking" role="status">Preparando resposta…</p>}
        <div ref={end} />
      </div>
      {mode === "support" && lines.length < 3 && (
        <div className="horaria-ai-suggestions">
          {suggestions.map((text) => (
            <button type="button" key={text} disabled={busy} onClick={() => void send(text)}>{text}</button>
          ))}
        </div>
      )}
      {error && <div className="horaria-ai-error" role="alert">{error}</div>}
      <form className="horaria-ai-compose" onSubmit={(event) => {
        event.preventDefault();
        void send(entry);
      }}>
        <label htmlFor="horaria-ai-question">Sua pergunta</label>
        <div className="horaria-ai-compose-controls">
          <input id="horaria-ai-question" value={entry}
            onChange={(event) => setEntry(event.target.value)}
            maxLength={900}
            autoComplete="off"
            disabled={busy}
            placeholder={mode === "support" ? "Pergunte sobre a Horária…" : "Pergunte ao assistente da assistência…"} />
          <button type="submit" className="primary" disabled={busy || entry.trim().length < 2}>
            Enviar
          </button>
        </div>
      </form>
      <footer className="horaria-ai-footer">
        <span>Não envie senhas, códigos de acesso ou dados bancários.</span>
        <button type="button" onClick={() => { if (!busy) selectMode(mode === "support" ? "company" : "support"); }}>
          {mode === "support" ? "Conhecer modo da assistência" : "Voltar ao suporte"}
        </button>
      </footer>
    </section>
  );
}
