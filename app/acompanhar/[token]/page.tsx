"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import TrackingResult, { Repair } from "@/components/tracking-result";
import { ErrorBox } from "@/components/ui";
import { message, publicDb } from "@/lib/supabase";

export default function DirectTracking({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<Repair | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [note, setNote] = useState("");
  const load = useCallback(async () => {
    const result = await publicDb!.rpc("acompanhar_por_token", {
      p_token: token,
    });
    if (result.error) throw result.error;
    if (!result.data)
      throw new Error("Este link de acompanhamento não é válido.");
    setData(result.data as Repair);
  }, [token]);
  useEffect(() => {
    load()
      .catch((reason) => setError(message(reason)))
      .finally(() => setBusy(false));
  }, [load]);
  async function respond(decision: string) {
    if (!data?.orcamento) return;
    setBusy(true);
    setError("");
    try {
      const result = await publicDb!.rpc("responder_orcamento_link", {
        p_orcamento: data.orcamento.id,
        p_decisao: decision,
        p_observacao: note,
        p_token: token,
      });
      if (result.error) throw result.error;
      await load();
    } catch (reason) {
      setError(message(reason as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public-portal">
      <Brand />
      <h1>Acompanhe seu reparo</h1>
      <p>Consulte o andamento e responda ao orçamento com segurança.</p>
      <ErrorBox error={error} />
      {busy && !data && (
        <section className="panel">Carregando atendimento…</section>
      )}
      {data && (
        <TrackingResult
          data={data}
          busy={busy}
          note={note}
          onNote={setNote}
          onRespond={respond}
        />
      )}
    </main>
  );
}
