"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase, message } from "@/lib/supabase";
import { useWorkspace } from "./workspace";
import { ErrorBox, Empty, PanelTitle, SemanticBadge } from "./ui";

type FiscalSettings = {
  empresa_id: string;
  provider: "emissor_nacional_web" | "focusnfe";
  ambiente: "homologacao" | "producao";
  modelo: "nfsen";
  ativo: boolean;
  cnpj: string | null;
  razao_social: string | null;
  inscricao_municipal: string | null;
  codigo_municipio: string | null;
  codigo_tributacao_nacional_iss: string | null;
  codigo_opcao_simples_nacional: string | null;
  regime_especial_tributacao: string | null;
  tributacao_iss: number | null;
  serie_dps: number;
  proximo_numero_dps: number;
  dados_confirmados: boolean;
  configuracao_confirmada: boolean;
};

type FiscalDocument = {
  id: string;
  ordem_id: string;
  provider_ref: string;
  provider: string;
  ambiente: "homologacao" | "producao";
  status: string;
  valor: number;
  numero: string | null;
  chave: string | null;
  protocolo: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  mensagem: string | null;
  criado_em: string;
};

type OrderOption = {
  id: string;
  numero: number;
};

type FreeFiscalMode = {
  mode: "emissor_nacional_web";
  productionUrl: string;
  restrictedUrl: string;
};

const fallbackPortal: FreeFiscalMode = {
  mode: "emissor_nacional_web",
  productionUrl: "https://www.nfse.gov.br/EmissorNacional/Login",
  restrictedUrl:
    "https://www.producaorestrita.nfse.gov.br/EmissorNacional/",
};

const emptySettings = (empresaId: string): FiscalSettings => ({
  empresa_id: empresaId,
  provider: "emissor_nacional_web",
  ambiente: "homologacao",
  modelo: "nfsen",
  ativo: false,
  cnpj: "",
  razao_social: "",
  inscricao_municipal: "",
  codigo_municipio: "",
  codigo_tributacao_nacional_iss: "",
  codigo_opcao_simples_nacional: "",
  regime_especial_tributacao: "",
  tributacao_iss: null,
  serie_dps: 1,
  proximo_numero_dps: 1,
  dados_confirmados: false,
  configuracao_confirmada: false,
});

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    preparando: "Preparando",
    pronto_para_emitir: "Pronta para emitir",
    emitida_manual: "Emitida",
    processando_autorizacao: "Processando",
    autorizado: "Autorizada",
    erro_autorizacao: "Erro na emissão",
    rejeitado: "Rejeitada",
    cancelado: "Cancelada",
  };
  return labels[status] || status;
}

function statusTone(status: string) {
  if (["emitida_manual", "autorizado"].includes(status))
    return "success" as const;
  if (["erro_autorizacao", "rejeitado", "cancelado"].includes(status))
    return "danger" as const;
  if (["pronto_para_emitir", "processando_autorizacao"].includes(status))
    return "warning" as const;
  return "neutral" as const;
}

export default function FiscalNotes({
  initialOrderId = "",
}: {
  initialOrderId?: string;
}) {
  const { empresa, access } = useWorkspace();
  const canManage = ["OWNER", "ADMIN"].includes(access.company?.role || "");
  const initializedStep = useRef(false);

  const [settings, setSettings] = useState<FiscalSettings>(() =>
    emptySettings(empresa.id),
  );
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [selectedOrder, setSelectedOrder] = useState(initialOrderId);
  const [portal, setPortal] = useState<FreeFiscalMode>(fallbackPortal);
  const [activeStep, setActiveStep] = useState(1);
  const [registeringId, setRegisteringId] = useState("");
  const [issuedNumber, setIssuedNumber] = useState("");
  const [issuedKey, setIssuedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !empresa.id) return;
    setLoading(true);
    try {
      const [settingsResult, documentsResult, ordersResult, portalResponse] =
        await Promise.all([
          supabase
            .from("fiscal_settings")
            .select("*")
            .eq("empresa_id", empresa.id)
            .maybeSingle(),
          supabase
            .from("fiscal_documents")
            .select(
              "id,ordem_id,provider_ref,provider,ambiente,status,valor,numero,chave,protocolo,pdf_url,xml_url,mensagem,criado_em",
            )
            .eq("empresa_id", empresa.id)
            .order("criado_em", { ascending: false })
            .limit(30),
          supabase
            .from("ordens_servico")
            .select("id,numero")
            .eq("empresa_id", empresa.id)
            .eq("status", "finalizado")
            .order("numero", { ascending: false })
            .limit(80),
          fetch("/api/fiscal/assistida", { cache: "no-store" }),
        ]);

      if (settingsResult.error) throw settingsResult.error;
      if (documentsResult.error) throw documentsResult.error;
      if (ordersResult.error) throw ordersResult.error;

      const nextSettings = settingsResult.data
        ? ({
            ...(settingsResult.data as FiscalSettings),
            provider: "emissor_nacional_web",
          } as FiscalSettings)
        : emptySettings(empresa.id);
      const nextDocuments = (documentsResult.data || []) as FiscalDocument[];

      setSettings(nextSettings);
      setDocuments(nextDocuments);
      setOrders((ordersResult.data || []) as OrderOption[]);

      if (portalResponse.ok) {
        setPortal((await portalResponse.json()) as FreeFiscalMode);
      }

      setSelectedOrder((current) => {
        if (
          initialOrderId &&
          (ordersResult.data || []).some((order) => order.id === initialOrderId)
        )
          return initialOrderId;
        if (current) return current;
        return ordersResult.data?.[0]?.id || "";
      });

      if (!initializedStep.current) {
        initializedStep.current = true;
        const firstIncomplete =
          !nextSettings.dados_confirmados
            ? 1
            : !nextSettings.configuracao_confirmada
              ? 2
              : !nextSettings.ativo
                ? 3
                : nextDocuments.length === 0
                  ? 4
                  : 4;
        setActiveStep(firstIncomplete);
      }

      setError("");
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setLoading(false);
    }
  }, [empresa.id, initialOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const basicDataComplete = useMemo(
    () =>
      (settings.cnpj || "").replace(/\D/g, "").length === 14 &&
      Boolean(settings.razao_social?.trim()) &&
      /^\d{7}$/.test(settings.codigo_municipio || ""),
    [settings],
  );

  const firstDocumentPrepared = documents.some((item) =>
    [
      "pronto_para_emitir",
      "emitida_manual",
      "processando_autorizacao",
      "autorizado",
    ].includes(item.status),
  );

  const steps = [
    {
      id: 1,
      title: "Dados da empresa",
      description: "CNPJ e identificação básica",
      done: settings.dados_confirmados && basicDataComplete,
    },
    {
      id: 2,
      title: "Configuração",
      description: "Escolha como a emissão será usada",
      done: settings.configuracao_confirmada,
    },
    {
      id: 3,
      title: "Ativar",
      description: "Liberar notas fiscais na assistência",
      done: settings.ativo,
    },
    {
      id: 4,
      title: "Primeira nota",
      description: "Preparar a primeira NFS-e",
      done: firstDocumentPrepared,
    },
  ];

  const completedSteps = steps.filter((step) => step.done).length;

  async function saveSettings(
    changes: Partial<FiscalSettings>,
    options?: { nextStep?: number; notice?: string },
  ) {
    if (!supabase || !canManage) return false;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const next = { ...settings, ...changes };
      const payload = {
        ...next,
        empresa_id: empresa.id,
        provider: "emissor_nacional_web",
        cnpj: next.cnpj?.trim() || null,
        razao_social: next.razao_social?.trim() || null,
        inscricao_municipal: next.inscricao_municipal?.trim() || null,
        codigo_municipio: next.codigo_municipio?.trim() || null,
        codigo_tributacao_nacional_iss:
          next.codigo_tributacao_nacional_iss?.trim() || null,
        codigo_opcao_simples_nacional:
          next.codigo_opcao_simples_nacional?.trim() || null,
        regime_especial_tributacao:
          next.regime_especial_tributacao?.trim() || null,
        tributacao_iss:
          next.tributacao_iss === null ||
          String(next.tributacao_iss).trim() === ""
            ? null
            : Number(next.tributacao_iss),
        serie_dps: Number(next.serie_dps) || 1,
        atualizado_em: new Date().toISOString(),
      };

      const result = await supabase
        .from("fiscal_settings")
        .upsert(payload, { onConflict: "empresa_id" })
        .select("*")
        .single();

      if (result.error) throw result.error;

      setSettings({
        ...(result.data as FiscalSettings),
        provider: "emissor_nacional_web",
      });
      if (options?.nextStep) setActiveStep(options.nextStep);
      setNotice(options?.notice || "Configuração fiscal salva.");
      return true;
    } catch (caught) {
      setError(message(caught as Error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function completeCompanyData() {
    if (!basicDataComplete) {
      setError("Preencha CNPJ, razão social e código IBGE do município.");
      return;
    }
    await saveSettings(
      { dados_confirmados: true },
      {
        nextStep: 2,
        notice: "Etapa 1 concluída. Dados da empresa salvos.",
      },
    );
  }

  async function completeConfiguration() {
    await saveSettings(
      { configuracao_confirmada: true },
      {
        nextStep: 3,
        notice: "Etapa 2 concluída. Configuração salva.",
      },
    );
  }

  async function activateFiscal() {
    await saveSettings(
      { ativo: true },
      {
        nextStep: 4,
        notice: "Etapa 3 concluída. Notas fiscais ativadas.",
      },
    );
  }

  async function prepareIssue() {
    if (!selectedOrder || !canManage) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/fiscal/assistida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", orderId: selectedOrder }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        productionUrl?: string;
        restrictedUrl?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Falha ao preparar a emissão.");

      if (data.productionUrl && data.restrictedUrl) {
        setPortal({
          mode: "emissor_nacional_web",
          productionUrl: data.productionUrl,
          restrictedUrl: data.restrictedUrl,
        });
      }

      setNotice(
        "Etapa 4 concluída. A primeira nota foi preparada e já está no histórico.",
      );
      await load();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  async function markIssued(documentId: string) {
    if (!issuedNumber.trim()) {
      setError("Informe o número da NFS-e emitida.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/fiscal/assistida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark-issued",
          documentId,
          numero: issuedNumber,
          chave: issuedKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Falha ao registrar a NFS-e.");

      setRegisteringId("");
      setIssuedNumber("");
      setIssuedKey("");
      setNotice("NFS-e registrada no histórico da Horária.");
      await load();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !documents.length)
    return <Empty title="Carregando configuração fiscal…" />;

  const officialPortal =
    settings.ambiente === "producao"
      ? portal.productionUrl
      : portal.restrictedUrl;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <ErrorBox error={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <section className="panel">
        <PanelTitle
          title="Configuração guiada"
          icon="receipt"
          subtitle="Faça uma vez. Cada etapa concluída fica marcada como tarefa feita."
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 10,
            marginTop: 16,
          }}
        >
          {steps.map((step) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                style={{
                  textAlign: "left",
                  border: active
                    ? "2px solid var(--primary, #2563eb)"
                    : "1px solid var(--border, #e4e7ec)",
                  borderRadius: 14,
                  padding: 14,
                  background: step.done ? "var(--surface, #fff)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    width: 28,
                    height: 28,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    border: "1px solid currentColor",
                    marginBottom: 8,
                    fontWeight: 800,
                  }}
                >
                  {step.done ? "✓" : step.id}
                </span>
                <strong style={{ display: "block" }}>{step.title}</strong>
                <small style={{ display: "block", marginTop: 4 }}>
                  {step.done ? "Tarefa feita" : step.description}
                </small>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 7,
            }}
          >
            <strong>{completedSteps}/4 tarefas concluídas</strong>
            <small>{Math.round((completedSteps / 4) * 100)}%</small>
          </div>
          <div
            aria-label="Progresso da configuração fiscal"
            style={{
              height: 8,
              borderRadius: 999,
              overflow: "hidden",
              background: "var(--muted, #eaecf0)",
            }}
          >
            <div
              style={{
                width: `${(completedSteps / 4) * 100}%`,
                height: "100%",
                background: "var(--primary, #2563eb)",
                transition: "width .2s ease",
              }}
            />
          </div>
        </div>
      </section>

      {activeStep === 1 && (
        <section className="panel">
          <PanelTitle
            title="1. Dados da empresa"
            icon="business"
            subtitle="Só pedimos o necessário para começar. Estes dados ficam salvos para as próximas notas."
          />

          <div className="definition-grid">
            <label>
              CNPJ *
              <input
                value={settings.cnpj || ""}
                disabled={!canManage || busy}
                inputMode="numeric"
                maxLength={18}
                placeholder="00.000.000/0000-00"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    cnpj: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Razão social *
              <input
                value={settings.razao_social || ""}
                disabled={!canManage || busy}
                maxLength={160}
                placeholder="Nome empresarial"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    razao_social: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Inscrição municipal
              <input
                value={settings.inscricao_municipal || ""}
                disabled={!canManage || busy}
                maxLength={40}
                placeholder="Se possuir"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    inscricao_municipal: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Código IBGE do município *
              <input
                value={settings.codigo_municipio || ""}
                disabled={!canManage || busy}
                inputMode="numeric"
                maxLength={7}
                placeholder="7 dígitos"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    codigo_municipio: event.target.value.replace(/\D/g, ""),
                  }))
                }
              />
            </label>
          </div>

          <div className="inline-actions" style={{ marginTop: 16 }}>
            <button
              className="primary"
              type="button"
              disabled={!canManage || busy || !basicDataComplete}
              onClick={() => void completeCompanyData()}
            >
              {busy ? "Salvando…" : "Salvar e continuar"}
            </button>
          </div>
        </section>
      )}

      {activeStep === 2 && (
        <section className="panel">
          <PanelTitle
            title="2. Como você vai emitir"
            icon="settings"
            subtitle="Comece em teste. Os campos fiscais avançados são opcionais e podem ser preenchidos depois."
          />

          <div className="definition-grid">
            <label>
              Ambiente
              <select
                value={settings.ambiente}
                disabled={!canManage || busy}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    ambiente: event.target.value as
                      | "homologacao"
                      | "producao",
                  }))
                }
              >
                <option value="homologacao">
                  Teste · sem validade fiscal
                </option>
                <option value="producao">
                  Produção · nota com validade fiscal
                </option>
              </select>
            </label>
          </div>

          <div className="notice" style={{ marginTop: 14 }}>
            Recomendado: deixe em <strong>Teste</strong> até validar todo o fluxo.
          </div>

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              Configuração fiscal avançada
            </summary>
            <p className="subtle">
              Preencha somente se seu contador já tiver informado esses dados.
            </p>
            <div className="definition-grid">
              <label>
                Código nacional do serviço / ISS
                <input
                  value={settings.codigo_tributacao_nacional_iss || ""}
                  disabled={!canManage || busy}
                  maxLength={20}
                  placeholder="Opcional"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      codigo_tributacao_nacional_iss: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Opção do Simples Nacional
                <input
                  value={settings.codigo_opcao_simples_nacional || ""}
                  disabled={!canManage || busy}
                  maxLength={10}
                  placeholder="Opcional"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      codigo_opcao_simples_nacional: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Regime especial de tributação
                <input
                  value={settings.regime_especial_tributacao || ""}
                  disabled={!canManage || busy}
                  maxLength={10}
                  placeholder="Opcional"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      regime_especial_tributacao: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Tributação do ISS
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.tributacao_iss ?? ""}
                  disabled={!canManage || busy}
                  placeholder="Opcional"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      tributacao_iss:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          </details>

          <div className="inline-actions" style={{ marginTop: 16 }}>
            <button
              className="outline"
              type="button"
              disabled={busy}
              onClick={() => setActiveStep(1)}
            >
              Voltar
            </button>
            <button
              className="primary"
              type="button"
              disabled={!canManage || busy}
              onClick={() => void completeConfiguration()}
            >
              {busy ? "Salvando…" : "Confirmar e continuar"}
            </button>
          </div>
        </section>
      )}

      {activeStep === 3 && (
        <section className="panel">
          <PanelTitle
            title="3. Ativar notas fiscais"
            icon="receipt"
            subtitle="Depois de ativar, a Horária libera a preparação de NFS-e para as ordens finalizadas."
          />

          <div className="definition-grid">
            <div>
              <dt>Emissor</dt>
              <dd>Emissor Nacional oficial</dd>
            </div>
            <div>
              <dt>Custo da API</dt>
              <dd>R$ 0,00</dd>
            </div>
            <div>
              <dt>Ambiente inicial</dt>
              <dd>
                {settings.ambiente === "producao" ? "Produção" : "Teste"}
              </dd>
            </div>
          </div>

          {settings.ativo ? (
            <p className="notice">✓ Notas fiscais já estão ativadas.</p>
          ) : (
            <p className="subtle">
              Você poderá desativar ou editar os dados depois, se precisar.
            </p>
          )}

          <div className="inline-actions" style={{ marginTop: 16 }}>
            <button
              className="outline"
              type="button"
              disabled={busy}
              onClick={() => setActiveStep(2)}
            >
              Voltar
            </button>
            {settings.ativo ? (
              <button
                className="primary"
                type="button"
                onClick={() => setActiveStep(4)}
              >
                Continuar
              </button>
            ) : (
              <button
                className="primary"
                type="button"
                disabled={!canManage || busy}
                onClick={() => void activateFiscal()}
              >
                {busy ? "Ativando…" : "Ativar e continuar"}
              </button>
            )}
          </div>
        </section>
      )}

      {activeStep === 4 && (
        <section className="panel">
          <PanelTitle
            title="4. Preparar a primeira NFS-e"
            icon="orders"
            subtitle="Escolha uma OS finalizada. A Horária usa o orçamento aprovado e deixa tudo organizado para a emissão."
          />

          {!orders.length ? (
            <Empty
              title="Nenhuma OS pronta para emissão"
              text="Finalize uma ordem com orçamento aprovado. Depois ela aparecerá aqui automaticamente."
              href="/painel/ordens"
              action="Ver ordens"
            />
          ) : (
            <>
              <div className="toolbar">
                <select
                  value={selectedOrder}
                  disabled={!canManage || busy}
                  onChange={(event) => setSelectedOrder(event.target.value)}
                  aria-label="Selecionar ordem finalizada"
                >
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      OS #{order.numero}
                    </option>
                  ))}
                </select>

                <button
                  className="primary"
                  type="button"
                  disabled={
                    !canManage ||
                    busy ||
                    !selectedOrder ||
                    !settings.ativo ||
                    !basicDataComplete
                  }
                  onClick={() => void prepareIssue()}
                >
                  {busy ? "Preparando…" : "Preparar emissão"}
                </button>

                <a
                  className="outline"
                  href={officialPortal}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir Emissor Nacional ↗
                </a>
              </div>

              {firstDocumentPrepared && (
                <p className="notice">
                  ✓ Primeira nota preparada. A configuração inicial está
                  concluída.
                </p>
              )}
            </>
          )}

          <div className="inline-actions" style={{ marginTop: 16 }}>
            <button
              className="outline"
              type="button"
              disabled={busy}
              onClick={() => setActiveStep(3)}
            >
              Voltar
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <PanelTitle
          title="Histórico fiscal"
          icon="receipt"
          subtitle="Depois da configuração, esta vira a área principal para acompanhar, imprimir e salvar suas notas."
        />

        {!documents.length ? (
          <Empty
            title="Nenhuma nota preparada ainda"
            text="Conclua o passo a passo acima para preparar a primeira."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Ambiente</th>
                  <th>Valor</th>
                  <th>NFS-e</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td>
                      {new Date(document.criado_em).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      <SemanticBadge tone={statusTone(document.status)}>
                        {statusLabel(document.status)}
                      </SemanticBadge>
                    </td>
                    <td>
                      {document.ambiente === "producao"
                        ? "Produção"
                        : "Teste"}
                    </td>
                    <td>{currency(Number(document.valor))}</td>
                    <td>{document.numero || "—"}</td>
                    <td>
                      <div className="inline-actions">
                        <Link
                          className="outline"
                          href={`/painel/notas-fiscais/${document.id}/imprimir`}
                          target="_blank"
                        >
                          Imprimir / PDF
                        </Link>

                        {document.status === "pronto_para_emitir" && (
                          <>
                            <a
                              className="primary"
                              href={
                                document.ambiente === "producao"
                                  ? portal.productionUrl
                                  : portal.restrictedUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              Emitir no portal ↗
                            </a>
                            <button
                              className="outline"
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRegisteringId(document.id);
                                setIssuedNumber("");
                                setIssuedKey("");
                              }}
                            >
                              Já emiti
                            </button>
                          </>
                        )}

                        {document.pdf_url && (
                          <a
                            className="outline"
                            href={document.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF oficial ↗
                          </a>
                        )}
                        {document.xml_url && (
                          <a
                            className="outline"
                            href={document.xml_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            XML ↗
                          </a>
                        )}
                      </div>

                      {registeringId === document.id && (
                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                            marginTop: 10,
                            minWidth: 240,
                          }}
                        >
                          <input
                            value={issuedNumber}
                            placeholder="Número da NFS-e"
                            onChange={(event) =>
                              setIssuedNumber(event.target.value)
                            }
                          />
                          <input
                            value={issuedKey}
                            placeholder="Chave de acesso (opcional)"
                            onChange={(event) =>
                              setIssuedKey(event.target.value)
                            }
                          />
                          <div className="inline-actions">
                            <button
                              className="primary"
                              type="button"
                              disabled={busy}
                              onClick={() => void markIssued(document.id)}
                            >
                              Salvar emissão
                            </button>
                            <button
                              className="outline"
                              type="button"
                              disabled={busy}
                              onClick={() => setRegisteringId("")}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {document.mensagem && (
                        <small style={{ display: "block", marginTop: 6 }}>
                          {document.mensagem}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
