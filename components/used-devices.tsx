"use client";
import { useMemo, useState } from "react";
import {
  categories,
  Cliente,
  conditions,
  money,
  saveRow,
  Seminovo,
  stamp,
  useRows,
} from "@/lib/assistencia";
import { message, supabase } from "@/lib/supabase";
import { Empty, ErrorBox, MetricCard, MetricGrid } from "./ui";
import { useWorkspace } from "./workspace";

const statusLabels: Record<Seminovo["status"], string> = {
  em_avaliacao: "Em avaliação",
  em_manutencao: "Em manutenção",
  pronto_venda: "Pronto para venda",
  reservado: "Reservado",
  vendido: "Vendido",
  descartado: "Descartado",
};

export default function UsedDevices() {
  const { empresa } = useWorkspace();
  const devices = useRows<Seminovo>("seminovos");
  const customers = useRows<Cliente>("clientes");
  const [open, setOpen] = useState(false);
  const [selling, setSelling] = useState<Seminovo | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(
    () =>
      devices.data.filter((device) =>
        [device.marca, device.modelo, device.imei, device.numero_serie]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [devices.data, query],
  );
  const investment = devices.data
    .filter((item) => item.status !== "vendido")
    .reduce(
      (sum, item) =>
        sum + Number(item.valor_compra) + Number(item.custos_reparo),
      0,
    );

  return (
    <>
      <ErrorBox error={error || devices.error || customers.error} />
      <MetricGrid columns={3}>
        <MetricCard
          label="Em avaliação"
          value={devices.data.filter((x) => x.status === "em_avaliacao").length}
          note="Aguardando análise"
          icon="⌘"
          tone="warning"
        />
        <MetricCard
          label="Prontos para venda"
          value={devices.data.filter((x) => x.status === "pronto_venda").length}
          note="Disponíveis para comercialização"
          icon="✓"
          tone="success"
        />
        <MetricCard
          label="Capital em aparelhos"
          value={money(investment)}
          note="Compra e custos de reparo"
          icon="▥"
          tone="purple"
        />
      </MetricGrid>
      <div className="toolbar">
        <input
          aria-label="Buscar seminovo"
          placeholder="Buscar por modelo, IMEI ou série"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setOpen(true)}>
          + Registrar entrada
        </button>
      </div>
      {open && (
        <section className="panel editor-panel">
          <div className="panel-head">
            <div>
              <h2>Entrada de aparelho usado</h2>
              <p>
                Registre a procedência, avaliação e custos sem misturar com o
                estoque de peças.
              </p>
            </div>
            <button onClick={() => setOpen(false)}>Fechar</button>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(event.currentTarget);
              try {
                await saveRow("seminovos", {
                  empresa_id: empresa.id,
                  vendedor_id: f.get("vendedor") || null,
                  categoria: f.get("categoria"),
                  marca: f.get("marca"),
                  modelo: f.get("modelo"),
                  cor: f.get("cor") || null,
                  imei: f.get("imei") || null,
                  numero_serie: f.get("numero_serie") || null,
                  estado: f.get("estado") || null,
                  checklist: f.getAll("checklist"),
                  documentacao: f.get("documentacao") || null,
                  observacoes: f.get("observacoes") || null,
                  foto_urls: String(f.get("foto_url") || "")
                    .split(/\s+/)
                    .filter(Boolean),
                  status: f.get("status"),
                  valor_estimado: Number(f.get("valor_estimado")),
                  valor_compra: Number(f.get("valor_compra")),
                  custos_reparo: Number(f.get("custos_reparo")),
                  preco_venda: Number(f.get("preco_venda")),
                  na_vitrine: f.get("na_vitrine") === "on",
                });
                await devices.reload();
                setOpen(false);
              } catch (e) {
                setError(message(e as Error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Vendedor / origem
                <select name="vendedor">
                  <option value="">Não informado</option>
                  {customers.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} · {c.whatsapp}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Categoria
                <select name="categoria" required>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Marca
                <input name="marca" required maxLength={80} />
              </label>
              <label>
                Modelo
                <input name="modelo" required maxLength={120} />
              </label>
              <label>
                Cor
                <input name="cor" maxLength={60} />
              </label>
              <label>
                IMEI
                <input name="imei" maxLength={40} />
              </label>
              <label>
                Número de série
                <input name="numero_serie" maxLength={80} />
              </label>
              <label>
                Estado geral
                <input
                  name="estado"
                  maxLength={300}
                  placeholder="Bom, tela com marcas…"
                />
              </label>
              <label>
                Status
                <select name="status">
                  <option value="em_avaliacao">Em avaliação</option>
                  <option value="em_manutencao">Em manutenção</option>
                  <option value="pronto_venda">Pronto para venda</option>
                </select>
              </label>
              <label>
                Valor estimado
                <input
                  name="valor_estimado"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
              <label>
                Valor pago
                <input
                  name="valor_compra"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
              <label>
                Custos de reparo
                <input
                  name="custos_reparo"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
              <label>
                Preço de venda
                <input
                  name="preco_venda"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
              <label>
                Foto (URL do storage)
                <input name="foto_url" type="url" placeholder="https://…" />
              </label>
            </div>
            <fieldset>
              <legend>Condição na entrada</legend>
              <div className="check-grid">
                {conditions.map((item) => (
                  <label className="check-label" key={item}>
                    <input type="checkbox" name="checklist" value={item} />
                    {item}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Documentação e procedência
              <textarea name="documentacao" maxLength={1000} />
            </label>
            <label>
              Observações
              <textarea name="observacoes" maxLength={1500} />
            </label>
            <label className="check-label">
              <input name="na_vitrine" type="checkbox" />
              Mostrar na vitrine quando estiver pronto para venda
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Registrar aparelho"}
            </button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Aparelhos usados</h2>
        {!filtered.length ? (
          <Empty
            title="Nenhum seminovo registrado"
            text="Registre avaliações, trocas e aparelhos comprados pela assistência."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Aparelho</th>
                  <th>Entrada</th>
                  <th>Status</th>
                  <th>Custo total</th>
                  <th>Preço</th>
                  <th>Vitrine</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <strong>
                        {device.marca} {device.modelo}
                      </strong>
                      <small>
                        {device.imei || device.numero_serie || device.categoria}
                      </small>
                    </td>
                    <td>{stamp(device.adquirido_em)}</td>
                    <td>
                      <span className={`status ${device.status}`}>
                        {statusLabels[device.status]}
                      </span>
                    </td>
                    <td>
                      {money(
                        Number(device.valor_compra) +
                          Number(device.custos_reparo),
                      )}
                    </td>
                    <td>{money(device.preco_venda)}</td>
                    <td>{device.na_vitrine ? "Visível" : "Oculto"}</td>
                    <td>
                      <div className="inline-actions">
                        {device.status !== "vendido" && (
                          <select
                            aria-label={`Status de ${device.modelo}`}
                            value={device.status}
                            onChange={async (e) => {
                              const status = e.target
                                .value as Seminovo["status"];
                              const r = await supabase!
                                .from("seminovos")
                                .update({
                                  status,
                                  na_vitrine:
                                    status === "pronto_venda"
                                      ? device.na_vitrine
                                      : false,
                                })
                                .eq("id", device.id);
                              if (r.error) setError(message(r.error));
                              else await devices.reload();
                            }}
                          >
                            <option value="em_avaliacao">Em avaliação</option>
                            <option value="em_manutencao">Em manutenção</option>
                            <option value="pronto_venda">
                              Pronto para venda
                            </option>
                            <option value="reservado">Reservado</option>
                            <option value="descartado">Descartado</option>
                          </select>
                        )}
                        {["pronto_venda", "reservado"].includes(
                          device.status,
                        ) && (
                          <button
                            className="primary"
                            onClick={() => setSelling(device)}
                          >
                            Vender
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selling && (
        <div className="modal-backdrop">
          <section className="panel modal">
            <button className="close" onClick={() => setSelling(null)}>
              ×
            </button>
            <h2>
              Vender {selling.marca} {selling.modelo}
            </h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(event.currentTarget);
                const result = await supabase!.rpc("vender_seminovo", {
                  p_seminovo: selling.id,
                  p_comprador: f.get("comprador"),
                  p_valor: Number(f.get("valor")),
                  p_forma: f.get("forma"),
                  p_garantia_dias: Number(f.get("garantia")),
                });
                if (result.error) setError(message(result.error));
                else {
                  setSelling(null);
                  await devices.reload();
                }
                setBusy(false);
              }}
            >
              <label>
                Comprador
                <select name="comprador" required>
                  <option value="">Selecione o cliente</option>
                  {customers.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} · {c.whatsapp}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor da venda
                <input
                  name="valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={selling.preco_venda}
                  required
                />
              </label>
              <label>
                Pagamento
                <select name="forma">
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="credito">Crédito</option>
                  <option value="debito">Débito</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
              <label>
                Garantia (dias)
                <input
                  name="garantia"
                  type="number"
                  min="0"
                  max="730"
                  defaultValue="90"
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Finalizando…" : "Finalizar venda"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
