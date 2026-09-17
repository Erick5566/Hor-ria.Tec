"use client";
import { useState } from "react";
import { Brand } from "@/components/brand";
import { ErrorBox } from "@/components/ui";
import TrackingResult, { Repair } from "@/components/tracking-result";
import { publicDb, message } from "@/lib/supabase";
export default function Tracking() {
  const [code, setCode] = useState(""),
    [phone, setPhone] = useState(""),
    [data, setData] = useState<Repair | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  async function load() {
    const r = await publicDb!.rpc("consultar_reparo", {
      p_codigo: code.trim(),
      p_telefone: phone,
    });
    if (r.error) throw r.error;
    if (!r.data)
      throw new Error(
        "Não encontramos uma ordem com esses dados. Confira o código e o telefone.",
      );
    setData(r.data);
  }
  async function respond(decision: string) {
    setBusy(true);
    setError("");
    try {
      const r = await publicDb!.rpc("responder_orcamento", {
        p_orcamento: data!.orcamento!.id,
        p_decisao: decision,
        p_observacao: note,
        p_codigo: code.trim(),
        p_telefone: phone,
      });
      if (r.error) throw r.error;
      await load();
    } catch (e) {
      setError(message(e as Error));
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
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setData(null);
          try {
            await load();
          } catch (e) {
            setError(message(e as Error));
          } finally {
            setBusy(false);
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
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setData(null);
              }}
            />
          </label>
          <label>
            Telefone / WhatsApp
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setData(null);
              }}
            />
          </label>
        </div>
        <button className="primary" disabled={busy}>
          Consultar reparo
        </button>
      </form>
      <ErrorBox error={error} />
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
