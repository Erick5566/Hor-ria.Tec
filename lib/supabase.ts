import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url!, key!) : null;
// Reservas públicas usam sempre o papel anon, mesmo com um dono logado no navegador.
export const publicDb = configured
  ? createClient(url!, key!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "horaria-public",
      },
    })
  : null;
export async function syncServerSession(session: Session | null) {
  const response = await fetch("/api/auth/session", {
    method: session ? "POST" : "DELETE",
    headers: session ? { "Content-Type": "application/json" } : undefined,
    body: session
      ? JSON.stringify({ accessToken: session.access_token })
      : undefined,
  });
  if (!response.ok) throw new Error("Não foi possível validar a sessão.");
}
export type Servico = {
  id: string;
  nome: string;
  duracao: number;
  empresa_id?: string;
  categoria?: string;
  preco?: number;
  descricao?: string | null;
  garantia_dias?: number;
  ativo?: boolean;
};
export type Empresa = {
  fotos_obrigatorias?: boolean;
  telefone?: string;
  endereco?: string;
  descricao_publica?: string;
  id: string;
  nome: string;
  slug: string;
  horario: Record<string, [string, string]>;
  solicitar_endereco: boolean;
  servicos?: Servico[];
  status?: string;
  manutencao_ativa?: boolean;
  feature_flags?: Record<string, boolean>;
  documento?: string;
  whatsapp?: string;
  email_publico?: string;
  instagram?: string;
  site?: string;
  logo_url?: string;
  cep?: string;
  numero_endereco?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cor_primaria?: string;
  cor_secundaria?: string;
  cor_botao?: string;
  tema_publico?: "claro" | "escuro";
  google_avaliacao_url?: string;
  slogan?: string;
  google_maps_url?: string;
  google_business_url?: string;
  prazo_resposta_horas?: number;
};
export type Agendamento = {
  id: string;
  empresa_id: string;
  servico_id: string | null;
  nome_cliente: string;
  telefone: string;
  endereco: string | null;
  descricao: string | null;
  inicio: string;
  fim: string;
  status: "aguardando" | "em_atendimento" | "concluido";
  bloqueio: boolean;
};
export function message(error: { message: string; code?: string }) {
  if (error.code === "23505")
    return error.message.includes("clientes")
      ? "Já existe um cliente com este WhatsApp. Selecione o cadastro existente."
      : "Já existe um cadastro com estes dados. Confira o endereço da página ou o registro selecionado.";
  if (error.code === "23514")
    return "Confira os campos e os horários informados.";
  if (error.code === "23503")
    return "O vínculo informado é inválido. Selecione registros desta assistência.";
  return error.code === "23P01"
    ? "Este horário acabou de ser ocupado. Escolha outro."
    : error.message;
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function time(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function dateLabel(value: string) {
  return new Date(value + "T12:00:00-03:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
export function shift(value: string, days: number) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
