"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "./workspace";
import { diagnosticDraft, suggestDiagnosis } from "@/lib/diagnostic-ai-triage";

type PhotoItem = { id:string; categoria:string; descricao:string|null; criado_em:string; caminho:string };
type PhotoView = PhotoItem & { thumbnail?:string };
type CreditState = { availableUnits?:number };

export default function DiagnosisAiAssistant({
  ordemId,
  problem,
  onApplyDraft,
}: {
  ordemId: string;
  problem: string;
  onApplyDraft: (suggestion:string) => void;
}) {
  const { access }=useWorkspace();
  const [details,setDetails]=useState("");
  const [showTriage,setShowTriage]=useState(false);
  const [photos,setPhotos]=useState<PhotoView[]>([]);
  const [selection,setSelection]=useState<string[]>([]);
  const [consent,setConsent]=useState(false);
  const [credits,setCredits]=useState<number|null>(null);
  const [vision,setVision]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [loadingPhotos,setLoadingPhotos]=useState(true);
  const [photoRevision,setPhotoRevision]=useState(0);
  const enabled=Boolean(access.company?.featureFlags.aiEnabled);
  const hint=useMemo(()=>suggestDiagnosis([problem,details].join(" ")),[problem,details]);

  useEffect(()=>{
    let active=true;
    setLoadingPhotos(true);
    setSelection([]);
    setPhotos([]);
    setVision("");
    setConsent(false);
    setError("");
    void (async()=>{
      if (!supabase) {
        if(active) {setLoadingPhotos(false);setError("Sessão não disponível. Atualize a página e entre novamente.");}
        return;
      }
      const companyId=access.company?.id;
      if(!companyId) {
        if(active) {setLoadingPhotos(false);setError("Selecione uma assistência para consultar as fotos.");}
        return;
      }
      const r=await supabase.from("fotos_os").select("id,categoria,descricao,criado_em,caminho")
        .eq("empresa_id",companyId).eq("ordem_id",ordemId)
        .order("criado_em",{ascending:false}).limit(35);
      if(!active) return;
      if(r.error){setError("Não foi possível carregar fotos da OS.");setLoadingPhotos(false);return;}
      const rows=(r.data||[]) as PhotoItem[];
      setPhotos(rows);
      setLoadingPhotos(false);
      if (!rows.length) return;
      const signed=await supabase.storage.from("os-fotos")
        .createSignedUrls(rows.map(x=>x.caminho),180);
      if(!active) return;
      if(signed.error || !signed.data) {
        setError("Fotos carregadas, mas não foi possível gerar as miniaturas privadas.");
        return;
      }
      const thumbs=new Map(signed.data.map((x,i)=>[rows[i].id,x.signedUrl||""]));
      setPhotos(rows.map(x=>({...x,thumbnail:thumbs.get(x.id)||undefined})));
    })().catch(()=>{
      if(active) {setLoadingPhotos(false);setError("Falha ao carregar as fotos. Tente atualizar a lista.");}
    });
    return ()=>{active=false;};
  },[ordemId,photoRevision,access.company?.id]);

  useEffect(()=>{
    let active=true;
    setCredits(null);
    const companyId=access.company?.id;
    if (companyId && supabase) {
      void supabase.rpc("ai_credit_status_for_company",{p_empresa:companyId})
        .then(r=>{
          if (!active || r.error) return;
          setCredits(Math.max(0,Number((r.data as CreditState)?.availableUnits||0)));
        });
    }
    return ()=>{active=false;};
  },[access.company?.id]);

  function toggle(id:string){
    setVision("");
    setError("");
    setConsent(false);
    setSelection(current=>
      current.includes(id) ? current.filter(x=>x!==id) :
      current.length<2 ? [...current,id] : current
    );
  }

  async function analyze(){
    if (!selection.length || !consent || busy) return;
    setBusy(true);setError("");setVision("");
    try{
      const response=await fetch("/api/ai/diagnosis",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ordemId,photoIds:selection,notes:details.slice(0,650),consent:true}),
      });
      const json=await response.json() as {analysis?:string;error?:string};
      if(!response.ok || !json.analysis)
        throw new Error(json.error||"Não foi possível analisar as imagens.");
      setVision(json.analysis);
      setCredits(n=>n===null?null:Math.max(0,n-1));
    }catch(caught){
      setError(caught instanceof Error?caught.message:"Falha na análise.");
    }finally{setBusy(false);}
  }

  return (
    <section className="diagnosis-ai" aria-labelledby="diagnosis-ai-title">
      <header className="diagnosis-ai-header">
        <div>
          <span className="diagnosis-ai-kicker">HORÁRIA IA · APOIO AO TÉCNICO</span>
          <h3 id="diagnosis-ai-title">Diagnóstico inteligente</h3>
          <p>Investigue possíveis causas e confira os sinais visíveis nas fotos. Nenhuma sugestão substitui testes reais.</p>
        </div>
        <span className="diagnosis-ai-status">Revisão humana obrigatória</span>
      </header>

      <div className="diagnosis-ai-free">
        <div className="diagnosis-ai-title-row">
          <div><strong>Triagem inicial por sintomas</strong><small>Gratuita · regras técnicas orientativas · sem envio de dados</small></div>
          <button type="button" className="outline" onClick={()=>{setShowTriage(true);setError("");}}>
            {showTriage?"Atualizar sugestões":"Gerar sugestões"}
          </button>
        </div>
        <label htmlFor="diagnosis-ai-symptom">Mais detalhes sobre o defeito (opcional)</label>
        <textarea id="diagnosis-ai-symptom" value={details} onChange={e=>{setDetails(e.target.value);setShowTriage(false);}}
          placeholder="Ex.: desligou após contato com água, conector está danificado…" rows={2} maxLength={650}/>
        {showTriage && (
          <div className="diagnosis-ai-result" role="region" aria-label="Triagem automática">
            <strong>{hint.heading}</strong>
            <b>Possíveis causas</b>
            <ul>{hint.possibleCauses.map(x=><li key={x}>{x}</li>)}</ul>
            <b>Testes recomendados</b>
            <ul>{hint.suggestedTests.map(x=><li key={x}>{x}</li>)}</ul>
            <p>{hint.caveat}</p>
            <button type="button" className="outline" onClick={()=>onApplyDraft(diagnosticDraft(hint))}>
              Copiar sugestões para observações (rascunho)
            </button>
          </div>
        )}
      </div>

      <div className="diagnosis-ai-vision">
        <div className="diagnosis-ai-title-row">
          <div>
            <strong>Análise inteligente de fotos</strong>
            <small>IA visual da OpenAI · até 2 imagens por análise · 1 crédito pré-pago</small>
          </div>
          <span>Saldo: {credits===null?"indisponível":credits+" crédito(s)"}</span>
        </div>
        {!enabled && <p className="diagnosis-ai-warning">Recurso de IA paga ainda não habilitado para esta assistência. A triagem gratuita acima continua disponível.</p>}
        <p className="diagnosis-ai-instruction">Selecione uma ou duas fotos já registradas nesta ordem. A IA apontará apenas sinais visíveis e testes recomendados, sem identificar automaticamente a causa do defeito.</p>
        <div className="diagnosis-ai-photo-tools">
          <button type="button" className="outline" disabled={busy||loadingPhotos}
            onClick={()=>setPhotoRevision(n=>n+1)}>
            Atualizar fotos da OS
          </button>
          <small>Use após fotografar o aparelho na aba de fotos.</small>
        </div>
        {loadingPhotos ? (
          <p className="hint">Carregando fotos da OS…</p>
        ) : photos.length === 0 ? (
          <p className="hint">Ainda não há fotos registradas. Use o painel Fotos do diagnóstico para adicionar imagens e depois volte aqui.</p>
        ) : (
          <div className="diagnosis-ai-photos" role="group" aria-label="Fotos para análise">
            {photos.map(photo=><label className={"diagnosis-ai-photo"+(selection.includes(photo.id)?" is-selected":"")} key={photo.id}>
              <input type="checkbox" checked={selection.includes(photo.id)} disabled={!selection.includes(photo.id)&&selection.length>=2||busy}
                onChange={()=>toggle(photo.id)}/>
              {photo.thumbnail?<img src={photo.thumbnail} alt={"Foto da OS: "+photo.categoria}/>:
                <span className="diagnosis-ai-photo-fallback">Imagem protegida</span>}
              <span><strong>{photo.categoria}</strong><small>{photo.descricao?.slice(0,75)||new Date(photo.criado_em).toLocaleDateString("pt-BR")}</small></span>
            </label>)}
          </div>
        )}
        <label className="diagnosis-ai-consent">
          <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy||selection.length===0}/>
          <span>Conferi que as imagens não contêm dados pessoais desnecessários. Autorizo enviar <strong>somente as fotos selecionadas e o relato do defeito</strong> para análise pela OpenAI. Sei que poderá consumir 1 crédito pré-pago e que as sugestões exigem revisão de um técnico.</span>
        </label>
        <button className="primary" type="button" onClick={()=>void analyze()}
          disabled={!enabled||busy||!consent||selection.length===0||credits===0}>
          {busy?"Analisando imagens…":"Analisar fotos com IA"}
        </button>
        {error && <p className="diagnosis-ai-error" role="alert">{error}</p>}
        {vision && <div className="diagnosis-ai-result" role="region" aria-label="Sugestões da análise visual">
          <strong>Observações sugeridas pela IA</strong>
          <p className="diagnosis-ai-analysis">{vision}</p>
          <p>O texto não é um diagnóstico confirmado e não será salvo automaticamente na OS.</p>
          <button className="outline" type="button" onClick={()=>onApplyDraft("Análise visual por IA (hipóteses não confirmadas):\n"+vision)}>
            Usar como rascunho das observações
          </button>
        </div>}
      </div>
    </section>
  );
}
