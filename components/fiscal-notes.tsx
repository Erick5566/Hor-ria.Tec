"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [settings, setSettings] = useState<FiscalSettings>(() =>
    emptySettings(empresa.id),
  );
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [selectedOrder, setSelectedOrder] = useState(initialOrderId);
  const [portal, setPortal] = useState<FreeFiscalMode>(fallbackPortal);
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

      setSettings(nextSettings);
      setDocuments((documentsResult.data || []) as FiscalDocument[]);
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

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !canManage) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...settings,
        empresa_id: empresa.id,
        provider: "emissor_nacional_web",
        cnpj: settings.cnpj?.trim() || null,
        razao_social: settings.razao_social?.trim() || null,
        inscricao_municipal: settings.inscricao_municipal?.trim() || null,
        codigo_municipio: settings.codigo_municipio?.trim() || null,
        codigo_tributacao_nacional_iss:
          settings.codigo_tributacao_nacional_iss?.trim() || null,
        codigo_opcao_simples_nacional:
          settings.codigo_opcao_simples_nacional?.trim() || null,
        regime_especial_tributacao:
          settings.regime_especial_tributacao?.trim() || null,
        tributacao_iss:
          settings.tributacao_iss === null ||
          String(settings.tributacao_iss).trim() === ""
            ? null
            : Number(settings.tributacao_iss),
        serie_dps: Number(settings.serie_dps) || 1,
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
      setNotice("Configuração fiscal salva.");
      await load();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
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
        "Dados preparados. Agora revise o resumo e conclua gratuitamente no Emissor Nacional.",
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

  const completedSteps = [
    basicDataComplete,
    settings.ativo,
    documents.some((item) => item.status === "pronto_para_emitir"),
    documents.some((item) =>
      ["emitida_manual", "autorizado"].includes(item.status),
    ),
  ].filter(Boolean).length;

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
          title="Emissão gratuita de NFS-e"
          icon="receipt"
          subtitle="O Horária prepara os dados da OS e você conclui a emissão no Emissor Nacional oficial, sem contratar uma API fiscal."
        />
        <div className="definition-grid">
          <div>
            <dt>Configuração</dt>
            <dd>{completedSteps}/4 etapas</dd>
          </div>
          <div>
            <dt>Modo</dt>
            <dd>Emissor Nacional Web</dd>
          </div>
          <div>
            <dt>Ambiente</dt>
            <dd>
              {settings.ambiente === "producao"
                ? "Produção oficial"
                : "Produção restrita · teste"}
            </dd>
          </div>
          <div>
            <dt>Custo de API</dt>
            <dd>R$ 0,00</dd>
          </div>
        </div>
      </section>

      <form className="panel" onSubmit={saveSettings}>
        <PanelTitle
          title="Dados fiscais da assistência"
          icon="business"
          subtitle="Preencha com os dados confirmados pela empresa ou pelo contador. O Horária não define tributação automaticamente."
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
                  ambiente: event.target.value as "homologacao" | "producao",
                }))
              }
            >
              <option value="homologacao">Produção restrita · testes</option>
              <option value="producao">Produção oficial · validade fiscal</option>
            </select>
          </label>

          <label>
            CNPJ
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
            Razão social
            <input
              value={settings.razao_social || ""}
              disabled={!canManage || busy}
              maxLength={160}
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
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  inscricao_municipal: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Código IBGE do município
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

          <label>
            Código nacional do serviço / ISS
            <input
              value={settings.codigo_tributacao_nacional_iss || ""}
              disabled={!canManage || busy}
              maxLength={20}
              placeholder="Conforme orientação fiscal"
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
              placeholder="Conforme enquadramento"
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
              placeholder="Conforme enquadramento"
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

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={settings.ativo}
            disabled={!canManage || busy}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                ativo: event.target.checked,
              }))
            }
          />
          Ativar módulo de notas fiscais para esta assistência
        </label>

        {canManage ? (
          <button className="primary" disabled={busy} type="submit">
            {busy ? "Salvando…" : "Salvar configuração"}
          </button>
        ) : (
          <p className="notice">
            Somente proprietário ou administrador pode alterar dados fiscais.
          </p>
        )}
      </form>

      <section className="panel">
        <PanelTitle
          title="Preparar nota pela OS"
          icon="orders"
          subtitle="O Horária usa o valor do orçamento aprovado e organiza as informações antes de abrir o Emissor Nacional."
        />

        <div className="toolbar">
          <select
            value={selectedOrder}
            disabled={!canManage || busy || !orders.length}
            onChange={(event) => setSelectedOrder(event.target.value)}
            aria-label="Selecionar ordem finalizada"
          >
            {!orders.length && <option value="">Nenhuma OS finalizada</option>}
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
            {busy ? "Preparando…" : "Preparar emissão gratuita"}
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

        {!settings.ativo && (
          <p className="notice">
            Salve os dados e ative o módulo fiscal antes de preparar uma nota.
          </p>
        )}
        {settings.ambiente === "homologacao" && (
          <p className="subtle">
            O ambiente selecionado é de testes. Para uma nota com validade
            fiscal, altere para Produção oficial depois de validar o fluxo.
          </p>
        )}
      </section>

      <section className="panel">
        <PanelTitle
          title="Histórico fiscal"
          icon="receipt"
          subtitle="Imprima, salve o resumo em PDF e registre o número da NFS-e depois da emissão oficial."
        />

        {!documents.length ? (
          <Empty
            title="Nenhuma preparação fiscal ainda"
            text="Finalize uma OS com orçamento aprovado e prepare a primeira emissão."
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
