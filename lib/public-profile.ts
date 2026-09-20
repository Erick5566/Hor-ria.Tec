import { createClient } from "@supabase/supabase-js";

export type PublicSeoProfile = {
  nome: string;
  descricao?: string | null;
  slogan?: string | null;
  logo?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  google_maps?: string | null;
  google_business?: string | null;
  google_avaliacao?: string | null;
  horario?: Record<string, [string, string]>;
  pagina?: {
    headline?: string | null;
    subheadline?: string | null;
  } | null;
};

export async function getPublicProfile(
  slug: string,
): Promise<PublicSeoProfile | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.rpc("perfil_assistencia", {
    p_slug: slug,
  });
  if (error || !data) return null;
  return data as PublicSeoProfile;
}

export function publicDescription(profile: PublicSeoProfile) {
  return (
    profile.pagina?.subheadline ||
    profile.descricao ||
    `Agende serviços e acompanhe seu atendimento com ${profile.nome}.`
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
