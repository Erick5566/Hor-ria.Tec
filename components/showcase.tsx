"use client";
import { useState } from "react";
import { money, Peca, Seminovo, useRows } from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import { Empty, ErrorBox } from "./ui";
import { useWorkspace } from "./workspace";

export default function Showcase() {
  const { empresa } = useWorkspace();
  const products = useRows<Peca>("pecas"),
    used = useRows<Seminovo>("seminovos");
  const [error, setError] = useState("");
  async function toggle(
    table: "pecas" | "seminovos",
    id: string,
    visible: boolean,
  ) {
    const result = await supabase!
      .from(table)
      .update({ na_vitrine: visible })
      .eq("id", id);
    if (result.error) setError(message(result.error));
    else await (table === "pecas" ? products.reload() : used.reload());
  }
  return (
    <>
      <ErrorBox error={error || products.error || used.error} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Vitrine pública</h2>
            <p>
              Escolha o que aparece em /{empresa.slug}. Apenas produtos com
              estoque e seminovos prontos ficam públicos.
            </p>
          </div>
          <a
            className="outline"
            href={`/${empresa.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver vitrine ↗
          </a>
        </div>
      </section>
      <div className="split-panels">
        <section className="panel">
          <h2>Produtos</h2>
          {!products.data.length ? (
            <Empty title="Nenhum produto cadastrado" />
          ) : (
            products.data.map((item) => (
              <article className="showcase-row" key={item.id}>
                <div>
                  <strong>{item.nome}</strong>
                  <small>
                    {item.quantidade} em estoque · {money(item.preco)}
                  </small>
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={item.na_vitrine || false}
                    disabled={!item.ativo || item.quantidade < 1}
                    onChange={(e) => toggle("pecas", item.id, e.target.checked)}
                  />
                  Exibir
                </label>
              </article>
            ))
          )}
        </section>
        <section className="panel">
          <h2>Seminovos</h2>
          {!used.data.length ? (
            <Empty title="Nenhum seminovo cadastrado" />
          ) : (
            used.data.map((item) => (
              <article className="showcase-row" key={item.id}>
                <div>
                  <strong>
                    {item.marca} {item.modelo}
                  </strong>
                  <small>
                    {money(item.preco_venda)} ·{" "}
                    {item.status.replaceAll("_", " ")}
                  </small>
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={item.na_vitrine}
                    disabled={item.status !== "pronto_venda"}
                    onChange={(e) =>
                      toggle("seminovos", item.id, e.target.checked)
                    }
                  />
                  Exibir
                </label>
              </article>
            ))
          )}
        </section>
      </div>
    </>
  );
}
