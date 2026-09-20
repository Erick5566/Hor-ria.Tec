import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

const textEncoder = new TextEncoder();

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function verifyTurnstile(secret: string, token: string, ip: string) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip !== "unknown") body.set("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey)
    return json({ ok: false, error: "service_unavailable" }, 503);

  let body: {
    slug?: string;
    cliente?: Record<string, unknown>;
    equipamento?: Record<string, unknown>;
    problema?: string;
    servico?: string | null;
    inicio?: string | null;
    endereco?: string | null;
    website?: string | null;
    turnstileToken?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Payload inválido." }, 400);
  }

  if (body.website)
    return json(
      { ok: false, error: "Não foi possível concluir a solicitação." },
      400,
    );

  const slug = String(body.slug || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return json({ ok: false, error: "Página inválida." }, 400);

  const ip = clientIp(request);
  const ipHash = await hmacHex(serviceKey, ip);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rate = await admin.rpc("consume_public_booking_rate_limit", {
    p_ip_hash: ipHash,
    p_slug: slug,
  });
  if (rate.error)
    return json(
      { ok: false, error: "Não foi possível validar a solicitação." },
      503,
    );
  if (rate.data !== true)
    return json(
      {
        ok: false,
        error:
          "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
      },
      429,
    );

  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (turnstileSecret) {
    const token = String(body.turnstileToken || "");
    if (!token || !(await verifyTurnstile(turnstileSecret, token, ip)))
      return json(
        { ok: false, error: "Não foi possível validar que você é uma pessoa." },
        403,
      );
  }

  const result = await admin.rpc("solicitar_reparo", {
    p_slug: slug,
    p_cliente: body.cliente ?? {},
    p_equipamento: body.equipamento ?? {},
    p_problema: String(body.problema ?? ""),
    p_servico: body.servico || null,
    p_inicio: body.inicio || null,
    p_endereco: body.endereco || null,
  });

  if (result.error) {
    const message = result.error.message || "";
    const safe =
      message.includes("Limite de solicitações") ||
      message.includes("Muitas solicitações") ||
      message.includes("Informe") ||
      message.includes("Selecione") ||
      message.includes("horário") ||
      message.includes("Horário") ||
      message.includes("Endereço") ||
      message.includes("problema") ||
      message.includes("equipamento") ||
      message.includes("agenda")
        ? message
        : "Não foi possível concluir a solicitação.";
    return json({ ok: false, error: safe }, 400);
  }

  return json({ ok: true, receipt: result.data });
});
