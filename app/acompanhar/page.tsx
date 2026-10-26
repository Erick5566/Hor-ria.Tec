"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { ErrorBox } from "@/components/ui";
import TrackingResult, { Repair } from "@/components/tracking-result";
import { useTrackingRefresh } from "@/lib/use-tracking-refresh";
import { publicDb } from "@/lib/supabase";

export default function Tracking() {
  const [code, setCode] = useState(""),
    [phone, setPhone] = useState(""),
    [data, setData] = useState<Repair | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");

  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await publicDb!.functions.invoke("public-tracking", {
        signal,
        body: {
          action: "lookup-code",
          code: code.trim().toUpperCase(),
          phone,
        },
      });
      if (result.error)
        throw new Error("Não foi possível consultar o atendimento agora.");
      if (!result.data?.ok || !result.data.data)
        throw new Error(
          result.data?.error ||
            "Não encontramos uma ordem com esses dados. Confira o código e o telefone.",
        );
      return result.data.data as Repair;
    },
    [code, phone],
  );

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
          action: "respond-code",
          code: code.trim().toUpperCase(),
          phone,
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
      <p>
        Informe o código de acompanhamento recebido da assistência e o telefone
        cadastrado.
      </p>
      <form
        className="panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setData(null);
          request.current?.abort();
          const controller = new AbortController();
          request.current = controller;
          try {
            const result = await load(controller.signal);
            if (!controller.signal.aborted) setData(result);
          } catch (reason) {
            if (!controller.signal.aborted) setError((reason as Error).message);
          } finally {
            if (!controller.signal.aborted) setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Código de acompanhamento da OS
            <input
              required
              minLength={16}
              maxLength={16}
              autoCapitalize="characters"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                request.current?.abort();
                setBusy(false);
                setData(null);
              }}
            />
          </label>
          <label>
            Telefone / WhatsApp
            <input
              required
              type="tel"
              minLength={8}
              maxLength={25}
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                request.current?.abort();
                setBusy(false);
                setData(null);
              }}
            />
          </label>
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Consultando…" : "Consultar reparo"}
        </button>
      </form>
      <ErrorBox error={error} />
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
