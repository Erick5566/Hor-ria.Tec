"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "./workspace";
import {
  Cliente,
  Equipamento,
  useRows,
  categories,
  conditions,
} from "@/lib/assistencia";
import { supabase, message } from "@/lib/supabase";
import { Heading, ErrorBox } from "./ui";
import { PhotoPicker } from "./photos";
import { PendingPhoto, uploadPhotos } from "@/lib/photos";
import DeviceFields from "./device-fields";
export default function OrderForm() {
  const { empresa } = useWorkspace(),
    router = useRouter();
  const clients = useRows<Cliente>("clientes"),
    equipment = useRows<Equipamento>("equipamentos");
  const [step, setStep] = useState(1),
    [photos, setPhotos] = useState<PendingPhoto[]>([]),
    [createdId, setCreatedId] = useState<string | null>(null),
    [customer, setCustomer] = useState<Record<string, string>>({
      id: "",
      nome: "",
      whatsapp: "",
      email: "",
      documento: "",
    }),
    [device, setDevice] = useState<Record<string, string>>({
      id: "",
      categoria: "Celular",
      tipo_personalizado: "",
      marca: "",
      modelo: "",
      cor: "",
      numero_serie: "",
      imei: "",
      senha: "",
      acessorios: "",
    }),
    [state, setState] = useState<string[]>([]),
    [details, setDetails] = useState({
      problema: "",
      observacoes_estado: "",
      tecnico: "",
      previsao: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const field = (
    name: string,
    label: string,
    required = false,
    type = "text",
  ) => (
    <label key={name}>
      {label}
      <input
        type={type}
        autoComplete={type === "password" ? "new-password" : "off"}
        required={required}
        maxLength={name === "senha" ? 200 : 120}
        value={device[name] || ""}
        onChange={(e) => setDevice({ ...device, [name]: e.target.value })}
      />
    </label>
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step < 4) {
      if (step === 3 && empresa.fotos_obrigatorias && !photos.length) {
        setError("Adicione pelo menos uma foto para continuar.");
        return;
      }
      setError("");
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      let orderId = createdId;
      if (!orderId) {
        const { data, error } = await supabase!.rpc("criar_ordem", {
          p_empresa: empresa.id,
          p_cliente: customer,
          p_equipamento: device,
          p_ordem: {
            problema: form.get("problema"),
            estado: state,
            observacoes_estado: form.get("observacoes_estado"),
            tecnico: form.get("tecnico"),
            previsao: form.get("previsao"),
          },
        });
        if (error) throw error;
        orderId = String(data);
        setCreatedId(orderId);
      }
      await uploadPhotos(empresa.id, orderId, photos);
      const confirmation = await supabase!.rpc("confirmar_entrada", {
        p_ordem: orderId,
      });
      if (confirmation.error) throw confirmation.error;
      router.push(`/painel/ordens/${orderId}`);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="module">
      <Heading
        title="Nova ordem de serviço"
        subtitle="Documente a entrada do equipamento e inicie o atendimento."
      />
      <div className="step-navigation">
        {["Cliente", "Equipamento", "Fotos", "Estado e problema"].map(
          (s, i) => (
            <span className={step === i + 1 ? "active" : ""} key={s}>
              {i + 1}. {s}
            </span>
          ),
        )}
      </div>
      <ErrorBox error={error || clients.error || equipment.error} />
      {createdId && (
        <p className="notice">
          A ordem foi criada. Conclua o envio das fotos ou{" "}
          <a href={`/painel/ordens/${createdId}`}>abra a ordem</a> para
          continuar depois.
        </p>
      )}
      <form className="panel" autoComplete="off" onSubmit={submit}>
        {step === 1 && (
          <>
            <h2>Quem trouxe o equipamento?</h2>
            <label>
              Selecionar cliente
              <select
                value={customer.id}
                onChange={(e) => {
                  setCustomer({ ...customer, id: e.target.value });
                  setDevice({ ...device, id: "" });
                }}
              >
                <option value="">+ Cadastrar novo cliente</option>
                {clients.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {c.whatsapp}
                  </option>
                ))}
              </select>
            </label>
            {!customer.id && (
              <div className="form-grid">
                {[
                  ["nome", "Nome", true],
                  ["whatsapp", "WhatsApp", true],
                  ["email", "E-mail", false],
                  ["documento", "CPF/CNPJ (opcional)", false],
                ].map(([name, label, required]) => (
                  <label key={String(name)}>
                    {label}
                    <input
                      required={Boolean(required)}
                      type={
                        name === "email"
                          ? "email"
                          : name === "whatsapp"
                            ? "tel"
                            : "text"
                      }
                      minLength={name === "nome" ? 2 : undefined}
                      maxLength={120}
                      value={customer[String(name)]}
                      onChange={(e) =>
                        setCustomer({
                          ...customer,
                          [String(name)]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h2>Identifique o equipamento</h2>
            {customer.id && (
              <label>
                Equipamento existente
                <select
                  value={device.id}
                  onChange={(e) => setDevice({ ...device, id: e.target.value })}
                >
                  <option value="">+ Novo equipamento</option>
                  {equipment.data
                    .filter((d) => d.cliente_id === customer.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.marca} {d.modelo} ·{" "}
                        {d.numero_serie ||
                          d.imei ||
                          (d.categoria === "Outro"
                            ? d.tipo_personalizado || "Outro"
                            : d.categoria)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {!device.id && (
              <>
                <DeviceFields value={device} onChange={setDevice} />
                <div className="form-grid">
                  {field("numero_serie", "Número de série")}
                  {field("imei", "IMEI")}
                  {field("acessorios", "Acessórios entregues")}
                </div>
              </>
            )}
            {field("senha", "Senha do aparelho (opcional)", false, "password")}
            <p className="hint">
              A senha é restrita à assistência e não aparece na consulta do
              cliente.
            </p>
          </>
        )}
        <div hidden={step !== 3}>
          <PhotoPicker value={photos} onChange={setPhotos} />
        </div>
        {step === 4 && (
          <>
            <h2>Condições de entrada</h2>
            <div className="checklist">
              {conditions.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={state.includes(c)}
                    onChange={(e) =>
                      setState(
                        e.target.checked
                          ? [...state, c]
                          : state.filter((s) => s !== c),
                      )
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
            <label>
              Observações sobre o estado do equipamento
              <textarea
                name="observacoes_estado"
                rows={3}
                maxLength={3000}
                value={details.observacoes_estado}
                onChange={(e) =>
                  setDetails({ ...details, observacoes_estado: e.target.value })
                }
              />
            </label>
            <label>
              Problema relatado pelo cliente
              <textarea
                name="problema"
                value={details.problema}
                onChange={(e) =>
                  setDetails({ ...details, problema: e.target.value })
                }
                rows={5}
                required
                minLength={3}
                maxLength={5000}
                placeholder="Cliente informa que o aparelho parou de carregar após queda."
              />
            </label>
            <div className="form-grid">
              <label>
                Técnico responsável
                <input
                  name="tecnico"
                  maxLength={120}
                  value={details.tecnico}
                  onChange={(e) =>
                    setDetails({ ...details, tecnico: e.target.value })
                  }
                />
              </label>
              <label>
                Previsão (opcional)
                <input
                  name="previsao"
                  type="date"
                  value={details.previsao}
                  onChange={(e) =>
                    setDetails({ ...details, previsao: e.target.value })
                  }
                />
              </label>
            </div>
          </>
        )}
        <div className="form-actions">
          {step > 1 && (
            <button
              type="button"
              className="outline"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              ← Voltar
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Salvando…"
              : step === 4
                ? "Gerar ordem de serviço"
                : "Continuar →"}
          </button>
        </div>
      </form>
    </section>
  );
}
