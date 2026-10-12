"use client";

import { useMemo, useState } from "react";
import { suggestDiagnosis } from "@/lib/diagnostic-ai-triage";

type Props = {
  deviceType: string;
  brand: string;
  model: string;
  symptom: string;
};

/** Contextual no-cost technical suggestions while RECEIVING the device.
 *  Does not call any external API or persist records.
 */
export default function OrderAiIntakeCoach({ deviceType, brand, model, symptom }: Props) {
  const [tab,setTab]=useState<"tests"|"causes">("tests");
  const [copied,setCopied]=useState(false);
  const [expanded,setExpanded]=useState(true);
  const hint=useMemo(()=>suggestDiagnosis(symptom),[symptom]);
  const description=[deviceType,brand,model].filter(Boolean).join(" · ");
  const ready=symptom.trim().length>=3;
  const suggestions=tab==="tests"?hint.suggestedTests:hint.possibleCauses;

  async function copyPlan(){
    const text=[
      "Pré-triagem da Horária Plus — pendente de confirmação",
      description,
      "Relato: "+symptom.slice(0,650),
      "Possíveis causas: "+hint.possibleCauses.join("; "),
      "Testes recomendados: "+hint.suggestedTests.join("; "),
      "Aguardando análise e testes do técnico.",
    ].join("\n");
    try{
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className="ai-intake-coach" aria-label="Horária Plus · assistente técnico">
      <header className="ai-intake-head">
        <span className="ai-intake-emblem" aria-hidden="true">H<span>✦</span></span>
        <div className="ai-intake-intro">
          <span className="ai-intake-eyebrow">HORÁRIA PLUS <span>·</span> COPILOTO TÉCNICO</span>
          <strong>Seu próximo passo, mais claro.</strong>
          <p>{ready
            ? "Prepare a avaliação inicial enquanto cadastra o serviço."
            : "Descreva o defeito para receber orientações de triagem durante o recebimento."}</p>
        </div>
        <button type="button" className="ai-intake-toggle" aria-expanded={expanded}
          aria-label={expanded?"Recolher sugestões":"Mostrar sugestões"}
          onClick={()=>setExpanded(x=>!x)}>{expanded?"−":"+"}</button>
      </header>
      {expanded && <div className="ai-intake-body">
        <div className="ai-intake-context">
          <span className="ai-intake-context-dot" aria-hidden="true"/>
          {description || "Equipamento em cadastramento"}
        </div>
        {ready ? (
          <>
            <div className="ai-intake-insight">
              <small>PRIMEIRA HIPÓTESE</small>
              <strong>{hint.heading}</strong>
              <span>Orientação técnica, não diagnóstico confirmado.</span>
            </div>
            <div className="ai-intake-tabs" role="group" aria-label="Tipo de orientação">
              <button type="button" aria-pressed={tab==="tests"} onClick={()=>setTab("tests")}>Testes iniciais</button>
              <button type="button" aria-pressed={tab==="causes"} onClick={()=>setTab("causes")}>Causas possíveis</button>
            </div>
            <ul className="ai-intake-items">
              {suggestions.map((s,i)=><li key={s}><span>{String(i+1).padStart(2,"0")}</span>{s}</li>)}
            </ul>
            <div className="ai-intake-footer">
              <span>Nada é salvo ou enviado para IA externa nesta etapa.</span>
              <button type="button" onClick={()=>void copyPlan()}>{copied?"Copiado ✓":"Copiar plano de testes"}</button>
            </div>
          </>
        ) : (
          <div className="ai-intake-idle">
            <span aria-hidden="true">✧</span>
            <p>Seu assistente aparece automaticamente quando você informar o problema no campo acima.</p>
          </div>
        )}
      </div>}
    </aside>
  );
}
