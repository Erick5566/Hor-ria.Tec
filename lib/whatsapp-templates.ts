export const WHATSAPP_TEMPLATES = {
  orcamento: {
    title: "Orçamento disponível",
    description: "Use quando o orçamento estiver disponível para análise do cliente.",
    defaultText:
      "Olá, {nome_cliente}! 👋 O orçamento do seu {aparelho} já está pronto. Acesse o link para visualizar os detalhes e aprovar: {link_orcamento}",
  },
  pronto_retirada: {
    title: "Aparelho pronto para retirada",
    description: "Use quando a ordem for marcada como pronta para retirada.",
    defaultText:
      "Olá, {nome_cliente}! ✅ Seu {aparelho} já está finalizado e pronto para retirada. Você pode vir buscá-lo quando quiser! Acompanhe por aqui: {link_acompanhamento}",
  },
} as const;

export type WhatsappTemplateType = keyof typeof WHATSAPP_TEMPLATES;
export const WHATSAPP_VARIABLES = [
  "nome_cliente",
  "aparelho",
  "link_orcamento",
  "link_acompanhamento",
  "nome_loja",
] as const;
export type WhatsappVariable = (typeof WHATSAPP_VARIABLES)[number];

export type WhatsappMessageContext = {
  nome_cliente?: string | null;
  aparelho?: string | null;
  link_orcamento?: string | null;
  link_acompanhamento?: string | null;
  nome_loja?: string | null;
};

export const MAX_WHATSAPP_TEMPLATE_LENGTH = 1600;
const FALLBACKS: Record<WhatsappVariable, string> = {
  nome_cliente: "cliente",
  aparelho: "aparelho",
  link_orcamento: "link indisponível",
  link_acompanhamento: "link indisponível",
  nome_loja: "assistência técnica",
};

export function validateWhatsappTemplate(text: string): string {
  if (!text.trim()) return "A mensagem não pode ficar vazia.";
  if (text.length > MAX_WHATSAPP_TEMPLATE_LENGTH)
    return "A mensagem deve ter no máximo 1.600 caracteres.";
  const leftovers = text.replace(/\{(nome_cliente|aparelho|link_orcamento|link_acompanhamento|nome_loja)\}/g, "");
  if (/\{[^{}]*\}/.test(leftovers))
    return "Existem variáveis não reconhecidas. Use os botões abaixo do editor.";
  return "";
}

export function renderWhatsappTemplate(
  text: string,
  context: WhatsappMessageContext,
): string {
  return text.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
    if (!WHATSAPP_VARIABLES.includes(key as WhatsappVariable))
      return "informação indisponível";
    const variable = key as WhatsappVariable;
    return String(context[variable] || "").trim() || FALLBACKS[variable];
  });
}

export function whatsappTrackingUrl(token?: string | null): string | null {
  if (!token || !/^[a-f0-9-]{36}$/i.test(token)) return null;
  return "https://horaria.site/acompanhar/" + encodeURIComponent(token);
}

export function whatsappMessageContext(options: {
  clientName?: string | null;
  deviceModel?: string | null;
  trackingToken?: string | null;
  storeName?: string | null;
}): WhatsappMessageContext {
  const tracking = whatsappTrackingUrl(options.trackingToken);
  return {
    nome_cliente: options.clientName,
    aparelho: options.deviceModel,
    nome_loja: options.storeName,
    link_orcamento: tracking,
    link_acompanhamento: tracking,
  };
}

// O produto atende a assistências brasileiras; não gere links com telefones incompletos.
export function whatsappPhone(phone?: string | null): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  const local = digits.startsWith("55") && [12, 13].includes(digits.length)
    ? digits.slice(2)
    : digits;
  if (![10, 11].includes(local.length) || local.startsWith("0"))
    return null;
  return "55" + local;
}

export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = whatsappPhone(phone);
  if (!normalized) return null;
  return "https://wa.me/" + normalized + "?text=" + encodeURIComponent(message);
}
