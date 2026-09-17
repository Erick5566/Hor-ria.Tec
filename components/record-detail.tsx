"use client";
import AppliedParts from "./applied-parts";
import { PhotosPanel } from "./photos";
import Link from "next/link";
import { useState } from "react";
import {
  useRows,
  Cliente,
  Equipamento,
  Ordem,
  Orcamento,
  Historico,
  money,
  stamp,
  Venda,
} from "@/lib/assistencia";
import { Heading, ErrorBox, Badge, Empty } from "./ui";
export default function RecordDetail({
  id,
  kind,
}: {
  id: string;
  kind: "clientes" | "equipamentos";
}) {
  const cs = useRows<Cliente>("clientes"),
    es = useRows<Equipamento>("equipamentos"),
    os = useRows<Ordem>("ordens_servico"),
    qs = useRows<Orcamento>("orcamentos"),
    hs = useRows<Historico>("historico_os");
  const sales = useRows<Venda>("vendas");
  const [tab, setTab] = useState("Dados");
  const client =
      kind === "clientes"
        ? cs.data.find((c) => c.id === id)
        : cs.data.find(
            (c) => c.id === es.data.find((e) => e.id === id)?.cliente_id,
          ),
    device = es.data.find((e) => e.id === id);
  const orders = os.data.filter((o) =>
    kind === "clientes" ? o.cliente_id === id : o.equipamento_id === id,
  );
  const quotes = qs.data.filter((q) => orders.some((o) => o.id === q.ordem_id));
  const history = hs.data.filter((h) =>
    orders.some((o) => o.id === h.ordem_id),
  );
  return (
    <section className="module">
      <Link href={`/painel/${kind}`} className="subtle">
        ← {kind === "clientes" ? "Clientes" : "Equipamentos"}
      </Link>
      <Heading
        title={
          kind === "clientes"
            ? client?.nome || "Cliente"
            : device
              ? `${device.marca} ${device.modelo}`
              : "Equipamento"
        }
        subtitle={
          kind === "equipamentos"
            ? `Cliente: ${client?.nome || "—"}`
            : undefined
        }
      />
      <ErrorBox
        error={
          cs.error ||
          es.error ||
          os.error ||
          qs.error ||
          hs.error ||
          sales.error
        }
      />
      <div className="tabs">
        {[
          "Dados",
          "Equipamentos",
          "Ordens",
          "Orçamentos",
          "Compras",
          "Histórico",
          "Fotos",
        ]
          .filter((t) => kind === "clientes" || t !== "Equipamentos")
          .filter((t) => kind === "clientes" || t !== "Compras")
          .map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
      </div>
      <section className="panel">
        {tab === "Fotos" &&
          orders.map((o) => (
            <section key={o.id}>
              <h3>OS #{o.numero}</h3>
              <PhotosPanel readOnly ordemId={o.id} empresaId={o.empresa_id} />
            </section>
          ))}
        {tab === "Dados" && (
          <dl className="definition-grid">
            {(kind === "clientes"
              ? [
                  ["Nome", client?.nome],
                  ["WhatsApp", client?.whatsapp],
                  ["E-mail", client?.email],
                  ["CPF/CNPJ", client?.documento],
                  ["Telefone", client?.telefone],
                  ["Endereço", client?.endereco],
                  ["Observações", client?.observacoes],
                ]
              : [
                  [
                    "Categoria",
                    device?.categoria === "Outro"
                      ? device.tipo_personalizado || "Outro"
                      : device?.categoria,
                  ],
                  ["Série", device?.numero_serie],
                  ["IMEI", device?.imei],
                  ["Cor", device?.cor],
                  ["Acessórios", device?.acessorios],
                ]
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "Não informado"}</dd>
              </div>
            ))}
          </dl>
        )}
        {tab === "Equipamentos" &&
          es.data
            .filter((e) => e.cliente_id === id)
            .map((e) => (
              <Link
                className="list-line"
                key={e.id}
                href={`/painel/equipamentos/${e.id}`}
              >
                <strong>
                  {e.marca} {e.modelo}
                </strong>
                <span>
                  {e.categoria === "Outro"
                    ? e.tipo_personalizado || "Outro"
                    : e.categoria}{" "}
                  →
                </span>
              </Link>
            ))}
        {tab === "Ordens" &&
          orders.map((o) => (
            <Link
              className="list-line"
              key={o.id}
              href={`/painel/ordens/${o.id}`}
            >
              <div>
                <strong>OS #{o.numero}</strong>
                <p>{o.problema}</p>
                <small>{stamp(o.criado_em)}</small>
              </div>
              <Badge status={o.status} />
            </Link>
          ))}
        {tab === "Orçamentos" &&
          quotes.map((q) => (
            <Link
              className="list-line"
              key={q.id}
              href={`/painel/ordens/${q.ordem_id}`}
            >
              <div>
                <strong>
                  Versão {q.versao} · {q.status}
                </strong>
                <p>
                  {[...q.servicos, ...q.pecas].map((i) => i.nome).join(", ")}
                </p>
              </div>
              <strong>{money(q.total)}</strong>
            </Link>
          ))}
        {tab === "Compras" &&
          sales.data
            .filter((sale) => sale.cliente_id === id)
            .map((sale) => (
              <div className="list-line" key={sale.id}>
                <div>
                  <strong>Venda #{sale.numero}</strong>
                  <small>{stamp(sale.vendido_em)}</small>
                </div>
                <strong>{money(sale.total)}</strong>
              </div>
            ))}
        {tab === "Histórico" && (
          <ol className="timeline">
            {history
              .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
              .map((h) => (
                <li key={h.id}>
                  <strong>{h.evento}</strong>
                  <p>{h.detalhes}</p>
                  <small>
                    {stamp(h.criado_em)} · {h.autor}
                  </small>
                </li>
              ))}
          </ol>
        )}
        {["Ordens", "Histórico", "Orçamentos"].includes(tab) &&
          !orders.length && <Empty title="Sem atendimentos anteriores." />}
      </section>
      {kind === "equipamentos" && (
        <AppliedParts readOnly orderIds={orders.map((o) => o.id)} />
      )}
    </section>
  );
}
