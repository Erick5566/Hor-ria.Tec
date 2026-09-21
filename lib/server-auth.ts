import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { AccessContext } from "./access";

export const sessionCookie = "horaria_access";

function serverClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function getServerAccess() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;
  const client = serverClient(token);
  if (!client) return null;
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) return null;
  const context = await client.rpc("access_context");
  if (context.error || !context.data) return null;

  // O token já foi validado acima por auth.getUser(token).
  // No SSR não existe uma sessão persistida dentro deste cliente Supabase,
  // então getAuthenticatorAssuranceLevel() pode enxergar aal1 mesmo quando
  // o JWT recebido após o TOTP já está em aal2. Isso causava o redirecionamento
  // /admin -> /seguranca/mfa -> /admin em loop.
  let aal: "aal1" | "aal2" = "aal1";
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    ) as { aal?: string };
    if (payload.aal === "aal2") aal = "aal2";
  } catch {}

  return {
    token,
    user: user.data.user,
    context: context.data as AccessContext,
    aal,
    client,
  };
}
