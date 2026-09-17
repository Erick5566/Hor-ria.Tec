import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const webhookSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");
  if (
    !webhookSecret ||
    request.headers.get("x-horaria-webhook-secret") !== webhookSecret
  )
    return json({ error: "unauthorized" }, 401);

  const apiToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN"),
    phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!apiToken || !phoneId)
    return json({ error: "whatsapp_not_configured" }, 503);
  const body = await request.json();
  const id = body.id ?? body.record?.id;
  if (!id) return json({ error: "notification_id_required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
  if (!serviceKey) return json({ error: "supabase_secret_missing" }, 503);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: notification, error: claimError } = await admin
    .from("notificacoes")
    .update({ status: "processando", atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pendente")
    .select("*")
    .maybeSingle();
  if (claimError) return json({ error: claimError.message }, 500);
  if (!notification) return json({ ok: true, skipped: true });

  const template =
    notification.evento === "pronto_retirada"
      ? Deno.env.get("WHATSAPP_TEMPLATE_READY")
      : Deno.env.get("WHATSAPP_TEMPLATE_QUOTE");
  if (!template) {
    await admin
      .from("notificacoes")
      .update({
        status: "pendente",
        ultimo_erro: "Template oficial não configurado",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);
    return json({ error: "template_not_configured" }, 503);
  }
  const baseUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "").replace(/\/$/, "");
  const link = `${baseUrl}/acompanhar/${notification.payload.token}`;
  const parameters =
    notification.evento === "pronto_retirada"
      ? [notification.payload.cliente, notification.payload.equipamento, link]
      : [
          notification.payload.cliente,
          String(notification.payload.numero),
          Number(notification.payload.total).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          }),
          link,
        ];
  try {
    const response = await fetch(
      `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0"}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: notification.destinatario,
          type: "template",
          template: {
            name: template,
            language: {
              code: Deno.env.get("WHATSAPP_LANGUAGE_CODE") ?? "pt_BR",
            },
            components: [
              {
                type: "body",
                parameters: parameters.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    await admin
      .from("notificacoes")
      .update({
        status: "enviada",
        tentativas: notification.tentativas + 1,
        enviado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        ultimo_erro: null,
      })
      .eq("id", id);
    return json({ ok: true, providerMessageId: result.messages?.[0]?.id });
  } catch (error) {
    await admin
      .from("notificacoes")
      .update({
        status: "falhou",
        tentativas: notification.tentativas + 1,
        ultimo_erro: String(error).slice(0, 2000),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);
    return json({ error: "delivery_failed" }, 502);
  }
});
