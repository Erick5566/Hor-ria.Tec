import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerAccess } from "@/lib/server-auth";
import FiscalPrintActions from "@/components/fiscal-print-actions";

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function stamp(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function FiscalPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getServerAccess();
  const company = access?.context.company;
  if (!access || !company) notFound();
  if (!["OWNER", "ADMIN"].includes(company.role)) notFound();

  const documentResult = await access.client
    .from("fiscal_documents")
    .select(
      "id,empresa_id,ordem_id,status,valor,numero,chave,ambiente,criado_em,mensagem",
    )
    .eq("id", id)
    .eq("empresa_id", company.id)
    .maybeSingle();

  if (documentResult.error || !documentResult.data) notFound();
  const document = documentResult.data;

  const [settingsResult, orderResult] = await Promise.all([
    access.client
      .from("fiscal_settings")
      .select(
        "cnpj,razao_social,inscricao_municipal,codigo_municipio,codigo_tributacao_nacional_iss",
      )
      .eq("empresa_id", company.id)
      .maybeSingle(),
    access.client
      .from("ordens_servico")
      .select("id,numero,cliente_id,equipamento_id,problema,status")
      .eq("id", document.ordem_id)
      .eq("empresa_id", company.id)
      .maybeSingle(),
  ]);

  if (orderResult.error || !orderResult.data) notFound();
  const order = orderResult.data;

  const [customerResult, equipmentResult, quoteResult] = await Promise.all([
    access.client
      .from("clientes")
      .select("nome,documento,email,whatsapp,telefone,endereco")
      .eq("id", order.cliente_id)
      .eq("empresa_id", company.id)
      .maybeSingle(),
    access.client
      .from("equipamentos")
      .select("categoria,marca,modelo,imei,numero_serie")
      .eq("id", order.equipamento_id)
      .eq("empresa_id", company.id)
      .maybeSingle(),
    access.client
      .from("orcamentos")
      .select("total,mao_obra,desconto,servicos,pecas,versao,status")
      .eq("ordem_id", order.id)
      .eq("empresa_id", company.id)
      .eq("status", "aprovado")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    settingsResult.error ||
    customerResult.error ||
    equipmentResult.error ||
    quoteResult.error
  ) {
    throw (
      settingsResult.error ||
      customerResult.error ||
      equipmentResult.error ||
      quoteResult.error
    );
  }

  const customer = customerResult.data;
  const equipment = equipmentResult.data;
  const settings = settingsResult.data;
  const quote = quoteResult.data;

  return (
    <>
      <style>{`
        .fiscal-print-shell {
          max-width: 900px;
          margin: 0 auto;
          padding: 24px;
        }
        .fiscal-print-page {
          background: #fff;
          color: #101828;
          border: 1px solid #e4e7ec;
          border-radius: 18px;
          padding: 32px;
        }
        .fiscal-print-top {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
          padding-bottom: 22px;
          border-bottom: 1px solid #e4e7ec;
        }
        .fiscal-print-top h1 {
          margin: 4px 0 6px;
          font-size: 26px;
        }
        .fiscal-print-top p,
        .fiscal-print-page p {
          margin: 0;
        }
        .fiscal-print-badge {
          display: inline-flex;
          border: 1px solid #d0d5dd;
          border-radius: 999px;
          padding: 7px 12px;
          font-weight: 700;
          white-space: nowrap;
        }
        .fiscal-print-alert {
          margin: 22px 0;
          padding: 14px 16px;
          border: 1px solid #f79009;
          border-radius: 12px;
          background: #fffaeb;
        }
        .fiscal-print-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-top: 24px;
        }
        .fiscal-print-card {
          border: 1px solid #e4e7ec;
          border-radius: 14px;
          padding: 18px;
        }
        .fiscal-print-card h2 {
          margin: 0 0 14px;
          font-size: 16px;
        }
        .fiscal-print-card dl {
          display: grid;
          gap: 10px;
          margin: 0;
        }
        .fiscal-print-card dt {
          color: #667085;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .fiscal-print-card dd {
          margin: 2px 0 0;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .fiscal-print-total {
          margin-top: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border: 1px solid #d0d5dd;
          border-radius: 14px;
        }
        .fiscal-print-total strong {
          font-size: 24px;
        }
        .fiscal-print-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .fiscal-print-actions small {
          width: 100%;
        }
        @media (max-width: 720px) {
          .fiscal-print-grid { grid-template-columns: 1fr; }
          .fiscal-print-top { flex-direction: column; }
        }
        @media print {
          body * { visibility: hidden !important; }
          .fiscal-print-page,
          .fiscal-print-page * { visibility: visible !important; }
          .fiscal-print-page {
            position: absolute;
            inset: 0;
            width: 100%;
            border: 0;
            border-radius: 0;
            padding: 0;
          }
          .no-print { display: none !important; }
          @page { margin: 14mm; }
        }
      `}</style>

      <section className="fiscal-print-shell">
        <div className="no-print" style={{ marginBottom: 14 }}>
          <Link className="subtle" href="/painel/notas-fiscais">
            ← Voltar para notas fiscais
          </Link>
        </div>

        <FiscalPrintActions />

        <article className="fiscal-print-page">
          <header className="fiscal-print-top">
            <div>
              <small>HORÁRIA · RESUMO PARA NFS-e</small>
              <h1>
                {document.numero
                  ? `NFS-e nº ${document.numero}`
                  : `Preparação fiscal · OS #${order.numero}`}
              </h1>
              <p>Gerado em {stamp(document.criado_em)}</p>
            </div>
            <span className="fiscal-print-badge">
              {document.status === "emitida_manual" ||
              document.status === "autorizado"
                ? "Emissão registrada"
                : "Aguardando emissão oficial"}
            </span>
          </header>

          <div className="fiscal-print-alert">
            <strong>Importante:</strong>{" "}
            {document.status === "emitida_manual" ||
            document.status === "autorizado"
              ? "este é um resumo de controle da Horária. O documento fiscal oficial é a NFS-e emitida no sistema nacional."
              : "este resumo não é uma nota fiscal e não possui validade fiscal. Use os dados abaixo para concluir a emissão no Emissor Nacional."}
          </div>

          <div className="fiscal-print-grid">
            <section className="fiscal-print-card">
              <h2>Prestador</h2>
              <dl>
                <div>
                  <dt>Razão social</dt>
                  <dd>{settings?.razao_social || company.name}</dd>
                </div>
                <div>
                  <dt>CNPJ</dt>
                  <dd>{settings?.cnpj || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Inscrição municipal</dt>
                  <dd>{settings?.inscricao_municipal || "Não informada"}</dd>
                </div>
                <div>
                  <dt>Município IBGE</dt>
                  <dd>{settings?.codigo_municipio || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Código do serviço</dt>
                  <dd>
                    {settings?.codigo_tributacao_nacional_iss ||
                      "Confirmar no emissor"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="fiscal-print-card">
              <h2>Tomador</h2>
              <dl>
                <div>
                  <dt>Nome</dt>
                  <dd>{customer?.nome || "Não informado"}</dd>
                </div>
                <div>
                  <dt>CPF/CNPJ</dt>
                  <dd>{customer?.documento || "Não informado"}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{customer?.email || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>
                    {customer?.telefone ||
                      customer?.whatsapp ||
                      "Não informado"}
                  </dd>
                </div>
                <div>
                  <dt>Endereço</dt>
                  <dd>{customer?.endereco || "Não informado"}</dd>
                </div>
              </dl>
            </section>

            <section className="fiscal-print-card">
              <h2>Ordem de serviço</h2>
              <dl>
                <div>
                  <dt>OS</dt>
                  <dd>#{order.numero}</dd>
                </div>
                <div>
                  <dt>Equipamento</dt>
                  <dd>
                    {[equipment?.categoria, equipment?.marca, equipment?.modelo]
                      .filter(Boolean)
                      .join(" · ") || "Não informado"}
                  </dd>
                </div>
                <div>
                  <dt>IMEI / Série</dt>
                  <dd>
                    {equipment?.imei ||
                      equipment?.numero_serie ||
                      "Não informado"}
                  </dd>
                </div>
                <div>
                  <dt>Descrição</dt>
                  <dd>{order.problema}</dd>
                </div>
              </dl>
            </section>

            <section className="fiscal-print-card">
              <h2>Valores do orçamento aprovado</h2>
              <dl>
                <div>
                  <dt>Mão de obra</dt>
                  <dd>{currency(Number(quote?.mao_obra || 0))}</dd>
                </div>
                <div>
                  <dt>Desconto</dt>
                  <dd>{currency(Number(quote?.desconto || 0))}</dd>
                </div>
                <div>
                  <dt>Versão do orçamento</dt>
                  <dd>{quote?.versao || "—"}</dd>
                </div>
                <div>
                  <dt>Ambiente</dt>
                  <dd>
                    {document.ambiente === "producao"
                      ? "Produção oficial"
                      : "Produção restrita / teste"}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="fiscal-print-total">
            <span>Valor de referência</span>
            <strong>{currency(Number(document.valor))}</strong>
          </div>

          {document.chave && (
            <section className="fiscal-print-card" style={{ marginTop: 24 }}>
              <h2>Identificação registrada</h2>
              <dl>
                <div>
                  <dt>Número da NFS-e</dt>
                  <dd>{document.numero || "—"}</dd>
                </div>
                <div>
                  <dt>Chave de acesso</dt>
                  <dd>{document.chave}</dd>
                </div>
              </dl>
            </section>
          )}
        </article>
      </section>
    </>
  );
}
