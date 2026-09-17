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
  return {
    token,
    user: user.data.user,
    context: context.data as AccessContext,
    client,
  };
}
