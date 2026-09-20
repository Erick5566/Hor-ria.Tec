import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { sessionCookie } from "@/lib/server-auth";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    accessToken?: string;
  } | null;
  if (!body?.accessToken)
    return NextResponse.json({ error: "Sessão inválida" }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json(
      { error: "Configuração ausente" },
      { status: 500 },
    );
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await client.auth.getUser(body.accessToken);
  if (result.error || !result.data.user)
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  let maxAge = 3600;
  try {
    const payload = JSON.parse(
      Buffer.from(body.accessToken.split(".")[1], "base64url").toString(),
    ) as { exp?: number };
    if (payload.exp)
      maxAge = Math.max(60, payload.exp - Math.floor(Date.now() / 1000));
  } catch {}
  (await cookies()).set(sessionCookie, body.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      new URL(request.url).protocol === "https:",
    priority: "high",
    path: "/",
    maxAge,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });

  (await cookies()).set(sessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      new URL(request.url).protocol === "https:",
    priority: "high",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
