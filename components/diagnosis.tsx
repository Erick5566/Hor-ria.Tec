"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, PanelTitle } from "./ui";
import { money } from "@/lib/assistencia";
import AppliedParts from "./applied-parts";
import { PhotosPanel } from "./photos";
import {
  DiagnosisPart,
  DiagnosisPartStatus,
  DiagnosisTestItem,
  DiagnosisTestStatus,
  diagnosisTestsSummary,
  emptyDiagnosisTests,
  parseDiagnosisParts,
  parseDiagnosisTests,
  serializeDiagnosisParts,
  serializeDiagnosisTests,
} from "@/lib/diagnosis-structured";

type StockOption = {
  id: string;
  nome: string;
  quantidade: number;
  custo: number;
  preco: number;
};

const partStatuses: DiagnosisPartStatus[] = [
  "A pedir",
  "Pedida",
  "Em estoque",
  "Recebida",
];

export default function Diagnosis({
  ordemId,
  empresaId,
}: {
  ordemId: string;
  empresaId: string;
}) {
  const [problem, setProblem] = useState("");
  const [observations, setObservations] = useState("");
  const [tests, setTests] = useState<DiagnosisTestItem[]>(emptyDiagnosisTests());
  const [testLegacy, setTestLegacy] = useState("");
  const [parts, setParts] = useState<DiagnosisPart[]>([]);
  const [partsLegacy, setPartsLegacy] = useState("");
  const [stock, setStock] = useState<StockOption[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    void Promise.all([
      supabase!
        .from("diagnosticos")
        .select("*")
        .eq("ordem_id", ordemId)
        .maybeSingle(),
      supabase!
        .from("pecas")
        .select("id,nome,quantidade,custo,preco")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("nome"),
    ]).then(([diagnosisResult, stockResult]) => {
      if (!active) return;

      if (diagnosisResult.error) {
        setError(message(diagnosisResult.error));
      } else {
        const diagnosis = diagnosisResult.data;
        setProblem(diagnosis?.problema_identificado || "");
        setObservations(diagnosis?.observacoes || "");

        const parsedTests = parseDiagnosisTests(diagnosis?.testes_realizados);
        setTests(parsedTests.items);
        setTestLegacy(parsedTests.legacyText);

        const parsedParts = parseDiagnosisParts(diagnosis?.pecas_necessarias);
        setParts(parsedParts.items);
        setPartsLegacy(parsedParts.legacyText);
      }

      if (stockResult.error) {
        setError((current) => current || message(stockResult.error));
      } else {
        setStock((stockResult.data || []) as StockOption[]);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [empresaId, ordemId]);

  const testsSummary = useMemo(() => diagnosisTestsSummary(tests), [tests]);

  const totals = useMemo(() => {
    const custo = parts.reduce(
      (sum, item) => sum + Number(item.quantidade) * Number(item.custo),
      0,
    );
    const cobrado = parts.reduce(
      (sum, item) => sum + Number(item.quantidade) * Number(item.valor),
      0,
    );
    const margem = cobrado - custo;
    const margemPercentual = cobrado > 0 ? (margem / cobrado) * 100 : 0;
    return { custo, cobrado, margem, margemPercentual };
  }, [parts]);

  function updateTest(
    key: string,
    patch: Partial<Pick<DiagnosisTestItem, "status" | "note">>,
  ) {
    setTests((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
    setSaved(false);
  }

  function addPart() {
    setParts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        nome: "",
        quantidade: 1,
        custo: 0,
        valor: 0,
        status: "A pedir",
      },
    ]);
    setSaved(false);
  }

  function updatePart(index: number, patch: Partial<DiagnosisPart>) {
    setParts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
    setSaved(false);
  }

  function selectStockPart(index: number, name: string) {
    const match = stock.find(
      (item) => item.nome.toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR"),
    );

    if (!match) {
      updatePart(index, { nome: name, stockId: undefined });
      return;
    }

    updatePart(index, {
      nome: match.nome,
      stockId: match.id,
      custo: Number(match.custo),
      valor: Number(match.preco),
      status: match.quantidade > 0 ? "Em estoque" : "A pedir",
    });
  }

  function validateParts() {
    for (const item of parts) {
      if (item.nome.trim().length < 2)
        throw new Error("Informe o nome de todas as peças necessárias.");
      if (
        !Number.isInteger(Number(item.quantidade)) ||
        Number(item.quantidade) < 1 ||
        Number(item.quantidade) > 1000
      )
        throw new Error("A quantidade das peças deve estar entre 1 e 1000.");
      if (
        !Number.isFinite(Number(item.custo)) ||
        !Number.isFinite(Number(item.valor)) ||
        Number(item.custo) < 0 ||
        Number(item.valor) < 0
      )
        throw new Error("Custo e valor cobrado não podem ser negativos.");
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      validateParts();
      const result = await supabase!.from("diagnosticos").upsert({
        ordem_id: ordemId,
        empresa_id: empresaId,
        problema_identificado: problem,
        testes_realizados: serializeDiagnosisTests(tests, testLegacy),
        pecas_necessarias: serializeDiagnosisParts(parts, partsLegacy),
        observacoes: observations,
        atualizado_em: new Date().toISOString(),
      });
      if (result.error) throw result.error;
      setSaved(true);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  async function copyTestsSummary() {
    try {
      await navigator.clipboard.writeText(testsSummary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Não foi possível copiar o resumo dos testes.");
    }
  }

  return (
    <>
      <section className="panel diagnosis-panel">
        <PanelTitle title="Diagnóstico técnico" icon="services" />
        <p className="hint">
          Informações internas da assistência. Não aparecem na consulta pública.
        </p>
        <ErrorBox error={error} />
        {saved && (
          <p className="saved" role="status">
            Diagnóstico salvo. As peças necessárias já ficam disponíveis para
            preencher o próximo orçamento.
          </p>
        )}

        {!loading && (
          <form onSubmit={save} className="diagnosis-form">
            <label>
              Problema identificado
              <textarea
                name="problema_identificado"
                rows={3}
                maxLength={5000}
                value={problem}
                onChange={(event) => {
                  setProblem(event.target.value);
                  setSaved(false);
                }}
              />
            </label>

            <section className="diagnosis-section">
              <div className="diagnosis-section-head">
                <div>
                  <strong>Testes realizados</strong>
                  <small>
                    Marque o resultado de cada teste. O estado inicial é não
                    testado.
                  </small>
                </div>
                <button
                  type="button"
                  className="outline diagnosis-copy-button"
                  onClick={() => void copyTestsSummary()}
                >
                  {copied ? "Copiado ✓" : "Copiar resumo"}
                </button>
              </div>

              <div className="diagnosis-test-list">
                {tests.map((item) => (
                  <div className="diagnosis-test-row" key={item.key}>
                    <div className="diagnosis-test-title">
                      <strong>{item.label}</strong>
                      {!item.status && <small>Não testado</small>}
                    </div>

                    <div
                      className="diagnosis-test-states"
                      role="group"
                      aria-label={`Resultado do teste: ${item.label}`}
                    >
                      {(
                        [
                          ["ok", "OK"],
                          ["falha", "Falha"],
                          ["na", "N/A"],
                        ] as [Exclude<DiagnosisTestStatus, "">, string][]
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={item.status === value ? "is-selected" : ""}
                          data-state={value}
                          aria-pressed={item.status === value}
                          onClick={() =>
                            updateTest(item.key, {
                              status: item.status === value ? "" : value,
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <input
                      className="diagnosis-test-note"
                      maxLength={300}
                      value={item.note}
                      onChange={(event) =>
                        updateTest(item.key, { note: event.target.value })
                      }
                      placeholder="Observação opcional"
                      aria-label={`Observação de ${item.label}`}
                    />
                  </div>
                ))}
              </div>

              <div className="diagnosis-test-summary">
                <strong>Resumo automático</strong>
                <p>{testsSummary}</p>
              </div>

              {testLegacy && (
                <details className="diagnosis-legacy">
                  <summary>Texto antigo de testes preservado</summary>
                  <p>{testLegacy}</p>
                </details>
              )}
            </section>

            <section className="diagnosis-section">
              <div className="diagnosis-section-head">
                <div>
                  <strong>Peças necessárias</strong>
                  <small>
                    Organize custo, valor cobrado e situação de compra antes do
                    reparo.
                  </small>
                </div>
                <button type="button" className="outline" onClick={addPart}>
                  + Adicionar peça
                </button>
              </div>

              <datalist id="diagnosis-stock-options">
                {stock.map((item) => (
                  <option
                    key={item.id}
                    value={item.nome}
                    label={`${item.quantidade} em estoque`}
                  />
                ))}
              </datalist>

              {!parts.length ? (
                <div className="diagnosis-empty-parts">
                  Nenhuma peça necessária adicionada.
                </div>
              ) : (
                <div className="diagnosis-parts-list">
                  {parts.map((item, index) => {
                    const stockItem = item.stockId
                      ? stock.find((value) => value.id === item.stockId)
                      : stock.find(
                          (value) =>
                            value.nome.toLocaleLowerCase("pt-BR") ===
                            item.nome.trim().toLocaleLowerCase("pt-BR"),
                        );

                    return (
                      <div className="diagnosis-part-row" key={item.id}>
                        <label className="diagnosis-part-name">
                          Peça
                          <input
                            list="diagnosis-stock-options"
                            required
                            minLength={2}
                            maxLength={200}
                            value={item.nome}
                            onChange={(event) =>
                              selectStockPart(index, event.target.value)
                            }
                            placeholder="Buscar no estoque ou digitar"
                          />
                          {stockItem && stockItem.quantidade <= 0 && (
                            <small className="diagnosis-stock-warning">
                              Estoque zerado
                            </small>
                          )}
                          {stockItem && stockItem.quantidade > 0 && (
                            <small className="diagnosis-stock-ok">
                              {stockItem.quantidade} em estoque
                            </small>
                          )}
                        </label>

                        <label>
                          Qtd.
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            step={1}
                            required
                            value={item.quantidade}
                            onChange={(event) =>
                              updatePart(index, {
                                quantidade: Number(event.target.value),
                              })
                            }
                          />
                        </label>

                        <label>
                          Custo
                          <input
                            type="number"
                            min={0}
                            max={10000000}
                            step="0.01"
                            required
                            value={item.custo}
                            onChange={(event) =>
                              updatePart(index, {
                                custo: Number(event.target.value),
                              })
                            }
                          />
                        </label>

                        <label>
                          Valor cobrado
                          <input
                            type="number"
                            min={0}
                            max={10000000}
                            step="0.01"
                            required
                            value={item.valor}
                            onChange={(event) =>
                              updatePart(index, {
                                valor: Number(event.target.value),
                              })
                            }
                          />
                        </label>

                        <label>
                          Status
                          <select
                            value={item.status}
                            onChange={(event) =>
                              updatePart(index, {
                                status: event.target.value as DiagnosisPartStatus,
                              })
                            }
                          >
                            {partStatuses.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          className="diagnosis-remove-part"
                          aria-label={`Remover ${item.nome || "peça"}`}
                          onClick={() => {
                            setParts((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            );
                            setSaved(false);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {partsLegacy && (
                <details className="diagnosis-legacy">
                  <summary>Texto antigo de peças preservado</summary>
                  <p>{partsLegacy}</p>
                </details>
              )}

              <div className="diagnosis-parts-summary">
                <div>
                  <span>Total de custo</span>
                  <strong>{money(totals.custo)}</strong>
                </div>
                <div>
                  <span>Total cobrado</span>
                  <strong>{money(totals.cobrado)}</strong>
                </div>
                <div>
                  <span>Margem</span>
                  <strong>
                    {money(totals.margem)} ·{" "}
                    {totals.margemPercentual.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                    %
                  </strong>
                </div>
              </div>
              <p className="hint">
                Ao abrir um orçamento novo, estas peças e os valores cobrados
                serão usados como ponto de partida.
              </p>
            </section>

            <label>
              Observações técnicas
              <textarea
                name="observacoes"
                rows={3}
                maxLength={5000}
                value={observations}
                onChange={(event) => {
                  setObservations(event.target.value);
                  setSaved(false);
                }}
              />
            </label>

            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar diagnóstico"}
            </button>
          </form>
        )}
      </section>

      <AppliedParts orderIds={[ordemId]} />
      <PhotosPanel
        category="Diagnóstico"
        ordemId={ordemId}
        empresaId={empresaId}
      />
    </>
  );
}
