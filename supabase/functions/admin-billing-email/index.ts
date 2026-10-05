import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const money = (value: unknown) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const dateTime = (value: unknown) => {
  if (!value) return "Não informado";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia",
  }).format(date);
};


const display = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "Não informado";
};

const accountLocation = (p: Record<string, unknown>) => {
  const city = String(p.city ?? "").trim();
  const state = String(p.state ?? "").trim();
  if (city && state) return city + "/" + state;
  return city || state || "Não informado";
};

const accountText = (p: Record<string, unknown>) =>
  "Dados da conta" +
  "\nEmpresa: " + display(p.companyName) +
  "\nResponsável: " + display(p.ownerName) +
  "\nE-mail: " + display(p.ownerEmail) +
  "\nWhatsApp: " + display(p.companyWhatsapp || p.ownerPhone) +
  "\nCidade/UF: " + accountLocation(p) +
  "\nPlano: " + display(p.planName) +
  "\nStatus: " + display(p.status);

const accountHtml = (p: Record<string, unknown>, labelColor = "#61718b") =>
  '<h2 style="font-size:16px;margin:20px 0 8px">Dados da conta</h2>' +
  '<table style="width:100%;border-collapse:collapse">' +
  '<tr><td style="padding:6px 0;color:' + labelColor + '">Empresa</td><td style="padding:6px 0;text-align:right"><strong>' + escapeHtml(display(p.companyName)) + '</strong></td></tr>' +
  '<tr><td style="padding:6px 0;color:' + labelColor + '">Responsável</td><td style="padding:6px 0;text-align:right">' + escapeHtml(display(p.ownerName)) + '</td></tr>' +
  '<tr><td style="padding:6px 0;color:' + labelColor + '">E-mail</td><td style="padding:6px 0;text-align:right">' + escapeHtml(display(p.ownerEmail)) + '</td></tr>' +
  '<tr><td style="padding:6px 0;color:' + labelColor + '">WhatsApp</td><td style="padding:6px 0;text-align:right">' + escapeHtml(display(p.companyWhatsapp || p.ownerPhone)) + '</td></tr>' +
  '<tr><td style="padding:6px 0;color:' + labelColor + '">Cidade/UF</td><td style="padding:6px 0;text-align:right">' + escapeHtml(accountLocation(p)) + '</td></tr>' +
  '<tr><td style="padding:6px 0;color:' + labelColor + '">Plano</td><td style="padding:6px 0;text-align:right">' + escapeHtml(display(p.planName)) + '</td></tr>' +
  '<tr><td style="padding:6px 0;color:' + labelColor + '">Status</td><td style="padding:6px 0;text-align:right"><strong>' + escapeHtml(display(p.status)) + '</strong></td></tr>' +
  '</table>';

function paymentContent(p: Record<string, unknown>) {
  const company = escapeHtml(p.companyName || "Empresa");
  const amount = money(p.amount);
  const paidAt = dateTime(p.paidAt);
  const nextBilling = dateTime(p.nextBillingDate);
  const provider = escapeHtml(p.provider || "manual");
  const adminUrl = escapeHtml(p.adminUrl || "https://horaria.site/admin");
  const kind =
    p.paymentKind === "initial"
      ? "Pagamento inicial"
      : p.paymentKind === "monthly"
        ? "Mensalidade"
        : "Pagamento";

  return {
    text:
      "Pagamento confirmado na Horária\n\n" +
      accountText(p) +
      "\n\nDados da cobrança" +
      "\nValor: " +
      amount +
      "\nTipo: " +
      kind +
      "\nConfirmado em: " +
      paidAt +
      "\nPróxima cobrança: " +
      nextBilling +
      "\nOrigem: " +
      String(p.provider || "manual") +
      "\n\nAbrir administração: " +
      String(p.adminUrl || "https://horaria.site/admin"),
    html:
      '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10233f">' +
      '<div style="background:#0b2340;color:white;padding:22px 24px;border-radius:14px 14px 0 0">' +
      '<div style="font-size:13px;opacity:.8">HORÁRIA • COBRANÇA</div>' +
      '<h1 style="font-size:22px;margin:8px 0 0">Pagamento confirmado ✓</h1></div>' +
      '<div style="border:1px solid #dfe7f1;border-top:0;padding:24px;border-radius:0 0 14px 14px">' +
      "<p>O pagamento de <strong>" +
      company +
      "</strong> foi confirmado.</p>" +
      accountHtml(p) +
      '<h2 style="font-size:16px;margin:20px 0 8px">Dados da cobrança</h2>' +
      '<table style="width:100%;border-collapse:collapse">' +
      '<tr><td style="padding:8px 0;color:#61718b">Valor</td><td style="padding:8px 0;text-align:right"><strong>' +
      escapeHtml(amount) +
      "</strong></td></tr>" +
      '<tr><td style="padding:8px 0;color:#61718b">Tipo</td><td style="padding:8px 0;text-align:right">' +
      escapeHtml(kind) +
      "</td></tr>" +
      '<tr><td style="padding:8px 0;color:#61718b">Confirmado em</td><td style="padding:8px 0;text-align:right">' +
      escapeHtml(paidAt) +
      "</td></tr>" +
      '<tr><td style="padding:8px 0;color:#61718b">Próxima cobrança</td><td style="padding:8px 0;text-align:right">' +
      escapeHtml(nextBilling) +
      "</td></tr>" +
      '<tr><td style="padding:8px 0;color:#61718b">Origem</td><td style="padding:8px 0;text-align:right">' +
      provider +
      "</td></tr></table>" +
      '<p style="margin:24px 0 0"><a href="' +
      adminUrl +
      '" style="display:inline-block;background:#1463ff;color:white;text-decoration:none;padding:12px 16px;border-radius:9px;font-weight:700">Abrir Super Admin</a></p>' +
      "</div></div>",
  };
}

function graceContent(p: Record<string, unknown>) {
  const company = escapeHtml(p.companyName || "Empresa");
  const amount = money(p.amountDue);
  const dueAt = dateTime(p.dueAt);
  const graceEndsAt = dateTime(p.graceEndsAt);
  const adminUrl = escapeHtml(p.adminUrl || "https://horaria.site/admin");

  return {
    text:
      "Assinatura entrou nas 24h de tolerância\n\n" +
      accountText(p) +
      "\n\nDados da cobrança" +
      "\nValor em aberto: " +
      amount +
      "\nVenceu em: " +
      dueAt +
      "\nLimite da tolerância: " +
      graceEndsAt +
      "\n\nAbrir administração: " +
      String(p.adminUrl || "https://horaria.site/admin"),
    html:
      '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10233f">' +
      '<div style="background:#0b2340;color:white;padding:22px 24px;border-radius:14px 14px 0 0">' +
      '<div style="font-size:13px;opacity:.8">HORÁRIA • COBRANÇA</div>' +
      '<h1 style="font-size:22px;margin:8px 0 0">Conta nas 24h de tolerância</h1></div>' +
      '<div style="border:1px solid #f0d6a4;border-top:0;background:#fffaf1;padding:24px;border-radius:0 0 14px 14px">' +
      "<p><strong>" +
      company +
      "</strong> entrou no prazo de tolerância antes do bloqueio.</p>" +
      accountHtml(p, "#725b31") +
      '<h2 style="font-size:16px;margin:20px 0 8px">Dados da cobrança</h2>' +
      '<table style="width:100%;border-collapse:collapse">' +
      '<tr><td style="padding:8px 0;color:#725b31">Valor em aberto</td><td style="padding:8px 0;text-align:right"><strong>' +
      escapeHtml(amount) +
      "</strong></td></tr>" +
      '<tr><td style="padding:8px 0;color:#725b31">Vencimento</td><td style="padding:8px 0;text-align:right">' +
      escapeHtml(dueAt) +
      "</td></tr>" +
      '<tr><td style="padding:8px 0;color:#725b31">Fim das 24h</td><td style="padding:8px 0;text-align:right"><strong>' +
      escapeHtml(graceEndsAt) +
      "</strong></td></tr></table>" +
      '<p style="margin:24px 0 0"><a href="' +
      adminUrl +
      '" style="display:inline-block;background:#1463ff;color:white;text-decoration:none;padding:12px 16px;border-radius:9px;font-weight:700">Ver empresa no Super Admin</a></p>' +
      "</div></div>",
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);

  let body: { id?: unknown; dispatchToken?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return json({ error: "invalid_payload" }, 400);
    body = parsed as { id?: unknown; dispatchToken?: unknown };
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const dispatchToken =
    typeof body.dispatchToken === "string" ? body.dispatchToken.trim() : "";

  if (!uuidPattern.test(id) || !uuidPattern.test(dispatchToken))
    return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;

  if (!supabaseUrl || !serviceKey)
    return json({ error: "supabase_secret_missing" }, 503);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: notification, error: claimError } = await admin
    .from("admin_email_notifications")
    .update({
      status: "processing",
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("dispatch_token", dispatchToken)
    .in("status", ["pending", "failed"])
    .select("*")
    .maybeSingle();

  if (claimError) return json({ error: claimError.message }, 500);
  if (!notification) return json({ ok: true, skipped: true });

  let resendKey = Deno.env.get("RESEND_API_KEY") || "";
  let from =
    Deno.env.get("ADMIN_EMAIL_FROM") ?? "Horária <onboarding@resend.dev>";

  if (!resendKey) {
    const { data: providerCredentials } = await admin.rpc(
      "admin_email_provider_credentials",
    );
    resendKey = String(providerCredentials?.resendApiKey || "");
    from = String(providerCredentials?.from || from);
  }

  if (!resendKey) {
    await admin
      .from("admin_email_notifications")
      .update({
        status: "pending",
        attempts: notification.attempts + 1,
        last_error: "RESEND_API_KEY não configurada",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return json({ error: "email_provider_not_configured" }, 503);
  }

  const email =
    notification.event_type === "payment_approved"
      ? paymentContent(notification.payload || {})
      : graceContent(notification.payload || {});

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: "Bearer " + resendKey,
        "content-type": "application/json",
        "Idempotency-Key": String(notification.unique_key).slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [notification.recipient],
        subject: notification.subject,
        text: email.text,
        html: email.html,
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));

    await admin
      .from("admin_email_notifications")
      .update({
        status: "sent",
        attempts: notification.attempts + 1,
        sent_at: new Date().toISOString(),
        provider_message_id: result.id ?? null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return json({ ok: true, providerMessageId: result.id ?? null });
  } catch (error) {
    await admin
      .from("admin_email_notifications")
      .update({
        status: "failed",
        attempts: notification.attempts + 1,
        last_error: String(error).slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return json({ error: "delivery_failed" }, 502);
  }
});
