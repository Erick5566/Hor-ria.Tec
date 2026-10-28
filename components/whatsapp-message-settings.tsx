"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace";
import { message, supabase } from "@/lib/supabase";
import {
  MAX_WHATSAPP_TEMPLATE_LENGTH,
  WHATSAPP_TEMPLATES,
  WHATSAPP_VARIABLES,
  renderWhatsappTemplate,
  validateWhatsappTemplate,
  type WhatsappTemplateType,
  type WhatsappVariable,
} from "@/lib/whatsapp-templates";

const types = Object.keys(WHATSAPP_TEMPLATES) as WhatsappTemplateType[];
const defaults = () => Object.fromEntries(
  types.map((type) => [type, WHATSAPP_TEMPLATES[type].defaultText]),
) as Record<WhatsappTemplateType, string>;

export default function WhatsappMessageSettings() {
  const { empresa, access } = useWorkspace();
  const canManage = ["OWNER", "ADMIN"].includes(access.company?.role || "");
  const [texts, setTexts] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<WhatsappTemplateType | null>(null);
  const [errors, setErrors] = useState<Partial<Record<WhatsappTemplateType, string>>>({});
  const [notices, setNotices] = useState<Partial<Record<WhatsappTemplateType, string>>>({});
  const editors = useRef<Partial<Record<WhatsappTemplateType, HTMLTextAreaElement | null>>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrors({});
    setNotices({});
    setTexts(defaults());
    if (!supabase || !empresa.id) {
      setLoading(false);
      return;
    }

    void supabase
      .from("mensagens_whatsapp_templates")
      .select("tipo,conteudo")
      .eq("empresa_id", empresa.id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setErrors({ orcamento: "Não foi possível carregar as mensagens: " + message(error) });
        } else {
          const initial = defaults();
          for (const row of data || []) {
            if (row.tipo in initial)
              initial[row.tipo as WhatsappTemplateType] = row.conteudo;
          }
          setTexts(initial);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [empresa.id]);

  function update(type: WhatsappTemplateType, value: string) {
    setTexts((current) => ({ ...current, [type]: value }));
    setNotices((current) => ({ ...current, [type]: "" }));
    setErrors((current) => ({ ...current, [type]: "" }));
  }

  function insert(type: WhatsappTemplateType, variable: WhatsappVariable) {
    const textarea = editors.current[type];
    const text = texts[type];
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const token = "{" + variable + "}";
    update(type, text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save(type: WhatsappTemplateType) {
    const conteudo = texts[type].trim();
    const invalid = validateWhatsappTemplate(conteudo);
    if (invalid) {
      setErrors((current) => ({ ...current, [type]: invalid }));
      return;
    }
    if (!canManage || !supabase) return;
    setSaving(type);
    setNotices((current) => ({ ...current, [type]: "" }));
    setErrors((current) => ({ ...current, [type]: "" }));
    try {
      const result = await supabase
        .from("mensagens_whatsapp_templates")
        .upsert({
          empresa_id: empresa.id,
          tipo: type,
          conteudo,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "empresa_id,tipo" });
      if (result.error) throw result.error;
      setTexts((current) => ({ ...current, [type]: conteudo }));
      setNotices((current) => ({ ...current, [type]: "Mensagem salva para esta assistência." }));
    } catch (error) {
      setErrors((current) => ({ ...current, [type]: message(error as Error) }));
    } finally {
      setSaving(null);
    }
  }

  if (!canManage) return null;

  return (
    <section className="panel wa-template-settings" aria-labelledby="wa-template-title">
      <div className="wa-template-heading">
        <div>
          <h2 id="wa-template-title">Mensagens de WhatsApp</h2>
          <p className="hint">
            Personalize os textos desta assistência. As variáveis serão preenchidas com os dados de cada cliente.
          </p>
        </div>
      </div>
      <p className="hint">
        O botão de WhatsApp abre a conversa com o texto preenchido; você revisa e confirma o envio.
        O envio automático pelo canal oficial mantém as regras de autorização e disponibilidade do plano.
      </p>
      {types.map((type) => {
        const definition = WHATSAPP_TEMPLATES[type];
        const preview = renderWhatsappTemplate(texts[type], {
          nome_cliente: "Ana Silva",
          aparelho: "Samsung Galaxy A32",
          nome_loja: empresa.nome,
          link_orcamento: "https://horaria.site/acompanhar/[codigo]",
          link_acompanhamento: "https://horaria.site/acompanhar/[codigo]",
        });
        return (
          <div className="wa-template-card" key={type}>
            <div>
              <h3>{definition.title}</h3>
              <p className="hint">{definition.description}</p>
            </div>
            <label htmlFor={"wa-template-" + type}>Texto da mensagem</label>
            <textarea
              id={"wa-template-" + type}
              ref={(node) => { editors.current[type] = node; }}
              rows={5}
              maxLength={MAX_WHATSAPP_TEMPLATE_LENGTH}
              value={texts[type]}
              disabled={loading || saving !== null}
              onChange={(event) => update(type, event.target.value)}
            />
            <div className="wa-template-toolbar">
              <span className="hint">Inserir variável:</span>
              <div className="wa-template-variables">
                {WHATSAPP_VARIABLES.map((variable) => (
                  <button type="button" className="outline" key={variable}
                    disabled={loading || saving !== null}
                    onClick={() => insert(type, variable)}>
                    {"{" + variable + "}"}
                  </button>
                ))}
              </div>
              <span className="hint wa-template-counter">
                {texts[type].length}/{MAX_WHATSAPP_TEMPLATE_LENGTH}
              </span>
            </div>
            <div className="wa-template-preview">
              <strong>Prévia da mensagem (dados de exemplo)</strong>
              <p>{preview}</p>
            </div>
            {errors[type] && <p role="alert" className="error">{errors[type]}</p>}
            {notices[type] && <p role="status" className="saved">{notices[type]}</p>}
            <div className="wa-template-actions">
              <button type="button" className="outline"
                disabled={loading || saving !== null}
                onClick={() => update(type, definition.defaultText)}>
                Restaurar mensagem padrão
              </button>
              <button type="button" className="primary"
                disabled={loading || saving !== null}
                onClick={() => void save(type)}>
                {saving === type ? "Salvando…" : "Salvar mensagem"}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
