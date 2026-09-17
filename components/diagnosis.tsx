"use client";
import { useState, useEffect } from "react";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox } from "./ui";
import { Diagnostico } from "@/lib/assistencia";
import AppliedParts from "./applied-parts";
import { PhotosPanel } from "./photos";
export default function Diagnosis({
  ordemId,
  empresaId,
}: {
  ordemId: string;
  empresaId: string;
}) {
  const [data, setData] = useState<Diagnostico | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase!
      .from("diagnosticos")
      .select("*")
      .eq("ordem_id", ordemId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(message(error));
        else setData(data);
        setLoading(false);
      });
  }, [ordemId]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await supabase!.from("diagnosticos").upsert({
        ordem_id: ordemId,
        empresa_id: empresaId,
        problema_identificado: f.get("problema_identificado"),
        testes_realizados: f.get("testes_realizados"),
        pecas_necessarias: f.get("pecas_necessarias"),
        observacoes: f.get("observacoes"),
        atualizado_em: new Date().toISOString(),
      });
      if (result.error) throw result.error;
      setSaved(true);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>Diagnóstico técnico</h2>
        <p className="hint">
          Informações internas da assistência. Não aparecem na consulta pública.
        </p>
        <ErrorBox error={error} />
        {saved && (
          <p className="saved" role="status">
            Diagnóstico salvo.
          </p>
        )}
        {!loading && (
          <form onSubmit={save}>
            {[
              ["problema_identificado", "Problema identificado"],
              ["testes_realizados", "Testes realizados"],
              ["pecas_necessarias", "Peças necessárias"],
              ["observacoes", "Observações técnicas"],
            ].map(([name, label]) => (
              <label key={name}>
                {label}
                <textarea
                  name={name}
                  rows={3}
                  maxLength={5000}
                  defaultValue={data?.[name as keyof Diagnostico] || ""}
                />
              </label>
            ))}
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
