import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const validToken = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);

  let token: string;
  try {
    const body = await request.json();
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    return respond({ ok: false, error: "invalid_json" }, 400);
  }
  if (!validToken.test(token))
    return respond({ ok: false, error: "Convite inválido." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
  const authorization = request.headers.get("authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization.startsWith("Bearer "))
    return respond({ ok: false, error: "Serviço de e-mail indisponível." }, 503);

  const user = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const session = await user.auth.getUser();
  if (session.error || !session.data.user)
    return respond({ ok: false, error: "Faça login novamente para enviar o convite." }, 401);

  // A RPC verifica a associação real e impede qualquer leitura de convite de outra empresa.
  const lookup = await user.rpc("team_invitation_email_context", { p_token: token });
  if (lookup.error || !lookup.data)
    return respond({ ok: false, error: "Convite não disponível ou sem permissão." }, 403);

  const invitation = lookup.data as {
    email: string; name: string; role: string; companyName: string; expiresAt: string;
  };
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const claimed = await admin.rpc("claim_team_invitation_email_send", { p_token: token });
  if (claimed.error)
    return respond({ ok: false, error: "Não foi possível reservar o envio. Tente novamente." }, 503);
  if (claimed.data !== true)
    return respond({ ok: false, error: "Convite indisponível ou limite de reenvios atingido. Aguarde 45 segundos." }, 429);

  async function finish(ok: boolean, providerId?: string, error?: string) {
    await admin.rpc("finish_team_invitation_email_send", {
      p_token: token, p_ok: ok,
      p_provider_id: providerId || null,
      p_error: error || null,
    });
  }

  try {
    let resendKey = Deno.env.get("RESEND_API_KEY") || "";
    let from = Deno.env.get("ADMIN_EMAIL_FROM") || "Horária <notificacoes@horaria.site>";
    if (!resendKey || !Deno.env.get("ADMIN_EMAIL_FROM")) {
      const saved = await admin.rpc("admin_email_provider_credentials");
      if (!saved.error && saved.data) {
        resendKey = resendKey || String(saved.data.resendApiKey || "");
        from = Deno.env.get("ADMIN_EMAIL_FROM") || String(saved.data.from || from);
      }
    }
    if (!resendKey) {
      await finish(false, undefined, "Provedor de envio não configurado");
      return respond({ ok: false, error: "Envio automático de convite não configurado. Compartilhe o link manualmente." }, 503);
    }

    const roleNames: Record<string, string> = {
      ADMIN: "administrador", TECHNICIAN: "técnico", ATTENDANT: "atendente",
    };
    const role = roleNames[invitation.role] || "membro";
    const link = "https://horaria.site/convite?token=" + encodeURIComponent(token);
    const subject = "Convite para a equipe — " + invitation.companyName;
    const greeting = "Olá, " + invitation.name + "!";
    const text = [
      greeting, "",
      "Você foi convidado(a) para integrar a equipe de " + invitation.companyName +
        " na Horária como " + role + ".", "",
      "Para aceitar o convite, entre ou crie sua conta usando este mesmo e-mail:",
      link, "",
      "O convite é individual e expira em 48 horas após sua criação.",
      "Se você não esperava esta mensagem, pode ignorá-la.",
      "",
      "Equipe Horária",
    ].join("\n");

    const html = `<div style="font-family:Arial,sans-serif;color:#132b4c;max-width:580px;margin:auto;line-height:1.6">
      <h2 style="color:#12305b">Convite para a equipe</h2>
      <p>${escapeHtml(greeting)}</p>
      <p>Você foi convidado(a) para integrar a equipe de <strong>${escapeHtml(invitation.companyName)}</strong>
      na Horária como <strong>${escapeHtml(role)}</strong>.</p>
      <p>Use este mesmo e-mail para criar sua conta ou entrar.</p>
      <p><a style="background:#1269d3;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block"
      href="${link}">Aceitar convite</a></p>
      <p style="font-size:13px;color:#67778d">Convite individual, válido por 48 horas após a criação.
      Se você não o solicitou, ignore esta mensagem.</p>
      <p>Equipe Horária</p></div>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + resendKey, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [invitation.email],
        subject,
        text,
        html,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.id !== "string") {
      await finish(false, undefined, "Resposta recusada pelo provedor: " + response.status);
      return respond({ ok: false, error: "O provedor não aceitou o e-mail. Copie ou compartilhe o convite manualmente." }, 502);
    }
    await finish(true, result.id);
    return respond({ ok: true, status: "aceito_pelo_provedor" });
  } catch {
    await finish(false, undefined, "Falha de transporte");
    return respond({ ok: false, error: "Não foi possível enviar o e-mail. Compartilhe o convite manualmente." }, 503);
  }
});
