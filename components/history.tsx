"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, message } from "@/lib/supabase";
import { type Historico, stamp, statuses, type Status } from "@/lib/assistencia";
import { useWorkspace } from "./workspace";
import { ErrorBox, Empty } from "./ui";

const PAGE_SIZE = 50;

export default function History({ ordemId }: { ordemId: string }) {
  const { userId, email } = useWorkspace();
  const [rows, setRows] = useState<Historico[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await supabase!
          .from("historico_os")
          .select("*")
          .eq("ordem_id", ordemId)
          .order("criado_em", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (result.error) throw result.error;
        const next = (result.data || []) as Historico[];
        setRows((current) => (append ? [...current, ...next] : next));
        setHasMore(next.length === PAGE_SIZE);
        setError("");
      } catch (caught) {
        setError(message(caught as Error));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [ordemId],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <section className="panel">
      <h2>Histórico da ordem</h2>
      <ErrorBox error={error} />

      {loading ? (
        <p>Carregando histórico…</p>
      ) : !rows.length ? (
        <Empty title="Nenhum evento registrado" />
      ) : (
        <>
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

          {hasMore && (
            <button
              className="outline"
              disabled={loadingMore}
              onClick={() => void load(rows.length, true)}
            >
              {loadingMore ? "Carregando…" : "Carregar mais eventos"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
