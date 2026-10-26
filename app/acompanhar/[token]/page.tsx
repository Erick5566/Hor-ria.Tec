"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import TrackingResult, { Repair } from "@/components/tracking-result";
import { ErrorBox } from "@/components/ui";
import { useTrackingRefresh } from "@/lib/use-tracking-refresh";
import { publicDb } from "@/lib/supabase";

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

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await publicDb!.functions.invoke("public-tracking", {
        body: { action: "lookup-token", token },
        signal,
      });
      if (result.error)
        throw new Error("Não foi possível consultar o atendimento agora.");
      if (!result.data?.ok || !result.data.data)
        throw new Error(
          result.data?.error || "Este link de acompanhamento não é válido.",
        );
      return result.data.data as Repair;
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setBusy(true);
    setError("");
    load(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError((reason as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [load]);

  const syncWarning = useTrackingRefresh(Boolean(data) && !busy, load, setData);

  async function respond(decision: string) {
    if (!data?.orcamento) return;
    if (decision === "alteracao_solicitada" && note.trim().length < 3) {
      setError("Explique o que você gostaria de alterar no orçamento.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await publicDb!.functions.invoke("public-tracking", {
        body: {
          action: "respond-token",
          token,
          quoteId: data.orcamento.id,
          decision,
          note: note.trim(),
        },
      });
      if (result.error)
        throw new Error("Não foi possível registrar sua resposta agora.");
      if (!result.data?.ok || !result.data.data)
        throw new Error(
          result.data?.error || "Não foi possível registrar sua resposta.",
        );
      setData(result.data.data as Repair);
      setNote("");
    } catch (reason) {
      setError((reason as Error).message);
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
        <p role="status">
          {syncWarning ||
            "Atualização automática a cada 75 segundos enquanto esta página estiver aberta."}
        </p>
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
