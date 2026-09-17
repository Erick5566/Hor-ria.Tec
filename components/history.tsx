"use client";
import { useEffect, useState } from "react";
import { supabase, message } from "@/lib/supabase";
import { Historico, stamp, statuses, Status } from "@/lib/assistencia";
import { useWorkspace } from "./workspace";
import { ErrorBox, Empty } from "./ui";
export default function History({ ordemId }: { ordemId: string }) {
  const { userId, email } = useWorkspace();
  const [rows, setRows] = useState<Historico[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await supabase!
        .from("historico_os")
        .select("*")
        .eq("ordem_id", ordemId)
        .order("criado_em", { ascending: false });
      if (alive) {
        if (r.error) setError(message(r.error));
        else setRows(r.data);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ordemId]);
  return (
    <section className="panel">
      <h2>Histórico da ordem</h2>
      <ErrorBox error={error} />
      {loading ? (
        <p>Carregando histórico…</p>
      ) : !rows.length ? (
        <Empty title="Nenhum evento registrado" />
      ) : (
        <ol className="history-list">
          {rows.map((row) => (
            <li key={row.id}>
              <time>{stamp(row.criado_em)}</time>
              <strong>{row.evento}</strong>
              <p>{statuses[row.detalhes as Status] || row.detalhes}</p>
              <small>
                {row.usuario_id === userId ? email : row.autor} ·{" "}
                {row.publico ? "Visível ao cliente" : "Registro interno"}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
