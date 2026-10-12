"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ResponsiveTable from "./responsive-table";
import { Heading } from "./ui";

export type AdminAiCompany = {
  id: string;
  companyName: string;
  slug: string;
  status: string;
  availableUnits: number;
  consumedUnits: number;
  pendingCount: number;
};

export type AdminAiPending = {
  id: string;
  companyId: string;
  companyName: string;
  channel: "web";
  status: "RESERVED";
  reservedAt: string;
  providerStartedAt: string | null;
  reviewState: "PROVIDER_STARTED" | "NEVER_STARTED_STALE" | "AWAITING_PROVIDER";
};

export type AdminAiOverviewData = {
  summary: {
    companiesWithWallet: number;
    availableUnits: number;
    consumedUnits: number;
    topUpUnits: number;
    pendingCount: number;
    requiresReview: number;
    waitingToStart: number;
  };
  companies: AdminAiCompany[];
  pending: AdminAiPending[];
};

function dateTime(value: string | null) {
  if (!value) return "Não iniciado";
  const d=new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("pt-BR") : "Data indisponível";
}

function statusLabel(state: AdminAiPending["reviewState"]) {
  if (state === "PROVIDER_STARTED") return "Chamada iniciada — conferir provedor";
  if (state === "NEVER_STARTED_STALE") return "Não iniciada há mais de 10 minutos";
  return "Aguardando início";
}

export default function AdminAiOperations({ data }: { data: AdminAiOverviewData }) {
  const router=useRouter();
  const [search,setSearch]=useState("");
  const [onlyPending,setOnlyPending]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const companies=useMemo(()=>{
    const q=search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    return data.companies.filter(company=>{
      const text=(company.companyName+" "+company.slug).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      return (!q || text.includes(q)) && (!onlyPending || company.pendingCount>0);
    });
  },[data.companies,search,onlyPending]);
  const s=data.summary;
  return (
    <section className="module admin-module admin-ai-operations">
      <Heading
        title="Operações da Horária IA"
        subtitle="Acompanhamento de créditos pré-pagos e chamadas que exigem conferência. Sem ativação ou cobrança automática."
      />
      <div className="admin-ai-toolbar">
        <span className="admin-ai-readonly">Painel somente leitura · Super Admin com MFA</span>
        <button type="button" className="outline" disabled={refreshing} onClick={()=>{
          setRefreshing(true);
          router.refresh();
          window.setTimeout(()=>setRefreshing(false),1200);
        }}>{refreshing?"Atualizando…":"Atualizar dados"}</button>
      </div>
      <div className="admin-ai-metrics" role="group" aria-label="Resumo financeiro da IA">
        <div><span>Créditos disponíveis</span><strong>{s.availableUnits.toLocaleString("pt-BR")}</strong><small>Unidades pré-pagas não consumidas</small></div>
        <div><span>Créditos consumidos</span><strong>{s.consumedUnits.toLocaleString("pt-BR")}</strong><small>Respostas confirmadas</small></div>
        <div><span>Reservas em aberto</span><strong>{s.pendingCount.toLocaleString("pt-BR")}</strong><small>Não significa cobrança confirmada</small></div>
        <div className={s.requiresReview>0?"needs-review":""}><span>Revisão necessária</span><strong>{s.requiresReview.toLocaleString("pt-BR")}</strong><small>Chamadas iniciadas há mais de 10 minutos</small></div>
      </div>
      <section className="panel admin-ai-panel">
        <div className="admin-ai-section-head">
          <div>
            <h2>Pendências de conciliação</h2>
            <p>Chamadas iniciadas podem ter sido cobradas pela OpenAI mesmo sem resposta. Confirme o consumo no provedor antes de solicitar qualquer estorno.</p>
          </div>
        </div>
        {data.pending.length===0?(
          <p className="admin-ai-empty">Nenhuma análise ou conversa de IA aguardando conciliação.</p>
        ):(
          <div className="table-wrap">
            <ResponsiveTable>
              <thead><tr><th>Assistência</th><th>Reserva</th><th>Início</th><th>Situação</th></tr></thead>
              <tbody>{data.pending.map(item=>(
                <tr key={item.id}>
                  <td><Link href={`/admin/empresas/${item.companyId}`}>{item.companyName}</Link><small>Canal: {item.channel==="web"?"Painel web":item.channel}</small></td>
                  <td><code>{item.id.slice(0,8)}…</code><small>{dateTime(item.reservedAt)}</small></td>
                  <td>{dateTime(item.providerStartedAt)}</td>
                  <td><span className={item.reviewState==="PROVIDER_STARTED"?"admin-ai-pill review":"admin-ai-pill"}>{statusLabel(item.reviewState)}</span></td>
                </tr>
              ))}</tbody>
            </ResponsiveTable>
          </div>
        )}
        {s.pendingCount>data.pending.length&&<p className="admin-ai-note">Exibindo as {data.pending.length} pendências mais antigas de {s.pendingCount} totais.</p>}
      </section>

      <section className="panel admin-ai-panel">
        <div className="admin-ai-section-head">
          <div>
            <h2>Créditos por assistência</h2>
            <p>Consulte saldos e consumo antes de aprovar comercialmente um plano de IA. O módulo não concede créditos.</p>
          </div>
          <span className="admin-ai-note">Total de unidades já adicionadas: {s.topUpUnits.toLocaleString("pt-BR")}</span>
        </div>
        <div className="admin-ai-filters">
          <label>
            Buscar assistência
            <input type="search" placeholder="Nome ou endereço da página" value={search} onChange={e=>setSearch(e.target.value)}/>
          </label>
          <label className="admin-ai-checkbox">
            <input type="checkbox" checked={onlyPending} onChange={e=>setOnlyPending(e.target.checked)}/>
            Somente com reservas pendentes
          </label>
        </div>
        {companies.length===0?(
          <p className="admin-ai-empty">{data.companies.length===0?"Nenhuma empresa possui créditos ou histórico de IA.":"Nenhuma assistência encontrada com esses filtros."}</p>
        ):(
          <div className="table-wrap"><ResponsiveTable>
            <thead><tr><th>Assistência</th><th>Disponíveis</th><th>Consumidos</th><th>Pendentes</th><th>Administração</th></tr></thead>
            <tbody>{companies.map(item=>(
              <tr key={item.id}>
                <td><strong>{item.companyName}</strong><small>/{item.slug} · {item.status}</small></td>
                <td><strong>{item.availableUnits.toLocaleString("pt-BR")}</strong></td>
                <td>{item.consumedUnits.toLocaleString("pt-BR")}</td>
                <td>{item.pendingCount>0?<strong className="admin-ai-alert">{item.pendingCount}</strong>:"0"}</td>
                <td><Link href={`/admin/empresas/${item.id}`}>Ver assistência →</Link></td>
              </tr>
            ))}</tbody>
          </ResponsiveTable></div>
        )}
        {s.companiesWithWallet>data.companies.length&&<p className="admin-ai-note">A listagem foi limitada para manter a página rápida. Consulte a assistência individualmente para maiores detalhes.</p>}
      </section>
      <p className="admin-ai-footnote">A análise de imagens com OpenAI e o WhatsApp automático continuam desligados por padrão. Nenhum saldo é creditado automaticamente pela mensalidade Básico ou Pro.</p>
    </section>
  );
}
