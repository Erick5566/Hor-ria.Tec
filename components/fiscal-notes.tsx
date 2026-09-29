"use client";
import Link from "next/link";
import { PanelTitle, MetricCard, MetricGrid } from "./ui";
import { HorariaIcon } from "./horaria-icon";

export default function FiscalNotes() {
  return (
    <div className="fiscal-notes">
      <MetricGrid columns={3}>
        <MetricCard
          label="Rotina fiscal"
          value="Centralizada"
          note="Acompanhe emissão e conferência"
          iconName="receipt"
          tone="blue"
        />
        <MetricCard
          label="Origem dos valores"
          value="Financeiro"
          note="Use os lançamentos como base"
          iconName="finance"
          tone="green"
        />
        <MetricCard
          label="Vínculo"
          value="Por OS"
          note="Consulte cliente, serviço e valor"
          iconName="orders"
          tone="purple"
        />
      </MetricGrid>

      <section className="panel">
        <PanelTitle
          title="Notas fiscais"
          icon="receipt"
          subtitle="Organize o que precisa ser emitido sem misturar a rotina fiscal com a operação da bancada."
        />
        <div className="notice">
          <strong>Emissão fiscal ainda não está integrada a um provedor.</strong>
          <span>
            Esta área prepara o fluxo e concentra os atalhos necessários. A emissão automática só deve ser ativada após integrar um serviço fiscal compatível com os dados da sua empresa.
          </span>
        </div>

        <div className="fiscal-flow-grid">
          <Link className="panel fiscal-flow-card" href="/painel/ordens">
            <span aria-hidden="true"><HorariaIcon name="orders" /></span>
            <div>
              <strong>1. Revisar a ordem</strong>
              <small>Confira cliente, equipamento, serviço executado e valor final.</small>
            </div>
          </Link>

          <Link className="panel fiscal-flow-card" href="/painel/financeiro">
            <span aria-hidden="true"><HorariaIcon name="finance" /></span>
            <div>
              <strong>2. Conferir financeiro</strong>
              <small>Valide o lançamento e confirme se a receita está registrada corretamente.</small>
            </div>
          </Link>

          <Link className="panel fiscal-flow-card" href="/painel/relatorios">
            <span aria-hidden="true"><HorariaIcon name="reports" /></span>
            <div>
              <strong>3. Fechar o período</strong>
              <small>Use os relatórios para conferir os totais antes do fechamento fiscal.</small>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
