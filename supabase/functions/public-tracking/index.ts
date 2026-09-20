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

const encoder = new TextEncoder();

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
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

function phoneDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function safeMessage(message: string) {
  const allowed = [
    "Orçamento não encontrado",
    "Resposta inválida",
    "Explique a alteração desejada",
    "Este orçamento não aceita novas respostas",
    "Orçamento vencido",
  ];
  return allowed.some((item) => message.includes(item))
    ? message
    : "Não foi possível concluir esta ação.";
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
    action?: string;
    token?: string;
    code?: string;
    phone?: string;
    quoteId?: string;
    decision?: string;
    note?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Payload inválido." }, 400);
  }

  const action = String(body.action || "");
  const token = String(body.token || "").trim();
  const code = String(body.code || "").trim().toUpperCase();
  const phone = phoneDigits(body.phone);
  const quoteId = String(body.quoteId || "").trim();
  const decision = String(body.decision || "");
  const note = String(body.note || "").trim();

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isLookupToken = action === "lookup-token";
  const isLookupCode = action === "lookup-code";
  const isRespondToken = action === "respond-token";
  const isRespondCode = action === "respond-code";

  if (!isLookupToken && !isLookupCode && !isRespondToken && !isRespondCode)
    return json({ ok: false, error: "Ação inválida." }, 400);

  if ((isLookupToken || isRespondToken) && !uuid.test(token))
    return json({ ok: false, error: "Link inválido." }, 400);

  if (
    (isLookupCode || isRespondCode) &&
    (!/^[A-F0-9]{16}$/.test(code) || !/^[0-9]{10,15}$/.test(phone))
  )
    return json({ ok: false, error: "Confira o código e o telefone." }, 400);

  if (isRespondToken || isRespondCode) {
    if (!uuid.test(quoteId))
      return json({ ok: false, error: "Orçamento inválido." }, 400);
    if (!["aprovado", "recusado", "alteracao_solicitada"].includes(decision))
      return json({ ok: false, error: "Resposta inválida." }, 400);
    if (note.length > 1000)
      return json({ ok: false, error: "Observação muito longa." }, 400);
    if (decision === "alteracao_solicitada" && note.length < 3)
      return json(
        { ok: false, error: "Explique a alteração desejada." },
        400,
      );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(request);
  const ipHash = await hmacHex(serviceKey, ip);
  const resource = token || `${code}:${phone}`;
  const resourceHash = await hmacHex(
    serviceKey,
    `${resource}:${quoteId || "lookup"}`,
  );
  const rateAction = isRespondToken || isRespondCode ? "respond" : "lookup";

  const rate = await admin.rpc("consume_public_action_rate_limit", {
    p_ip_hash: ipHash,
    p_resource_hash: resourceHash,
    p_action: rateAction,
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

  if (isRespondToken) {
    const response = await admin.rpc("responder_orcamento_link", {
      p_orcamento: quoteId,
      p_decisao: decision,
      p_observacao: note || null,
      p_token: token,
    });
    if (response.error)
      return json(
        { ok: false, error: safeMessage(response.error.message) },
        400,
      );
  }

  if (isRespondCode) {
    const response = await admin.rpc("responder_orcamento", {
      p_orcamento: quoteId,
      p_decisao: decision,
      p_observacao: note || null,
      p_codigo: code,
      p_telefone: phone,
    });
    if (response.error)
      return json(
        { ok: false, error: safeMessage(response.error.message) },
        400,
      );
  }

  const lookup =
    isLookupToken || isRespondToken
      ? await admin.rpc("acompanhar_por_token", { p_token: token })
      : await admin.rpc("consultar_reparo", {
          p_codigo: code,
          p_telefone: phone,
        });

  if (lookup.error)
    return json(
      { ok: false, error: "Não foi possível consultar o atendimento." },
      400,
    );
  if (!lookup.data)
    return json(
      {
        ok: false,
        error:
          isLookupToken || isRespondToken
            ? "Este link de acompanhamento não é válido."
            : "Não encontramos uma ordem com esses dados. Confira o código e o telefone.",
      },
      404,
    );

  return json({ ok: true, data: lookup.data });
});
