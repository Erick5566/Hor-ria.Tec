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

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value || "");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return json({ ok: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("authorization") || "";

  if (!supabaseUrl || !anonKey || !serviceKey || !authHeader)
    return json({ ok: false, error: "Sessão inválida." }, 401);

  let body: { name?: string; email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Dados do convite inválidos." }, 400);
  }

  const name = String(body.name || "").trim();
  const email = cleanEmail(body.email);
  const role = String(body.role || "").trim().toUpperCase();

  if (name.length < 2 || name.length > 100)
    return json({ ok: false, error: "Informe o nome do funcionário." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    return json({ ok: false, error: "Informe um e-mail válido." }, 400);
  if (!["ADMIN", "TECHNICIAN", "ATTENDANT"].includes(role))
    return json({ ok: false, error: "Selecione uma função válida." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const current = await userClient.auth.getUser();
  if (current.error || !current.data.user)
    return json({ ok: false, error: "Sua sessão expirou. Entre novamente." }, 401);

  const access = await userClient.rpc("access_context");
  if (access.error)
    return json({ ok: false, error: "Não foi possível validar seu acesso." }, 403);

  const context = access.data as {
    globalMaintenance?: boolean;
    company?: {
      id?: string;
      role?: string;
      status?: string;
      maintenance?: boolean;
    } | null;
  } | null;

  const company = context?.company;
  if (
    !company?.id ||
    !["OWNER", "ADMIN"].includes(company.role || "") ||
    context?.globalMaintenance ||
    company.maintenance ||
    !["TRIAL", "ACTIVE", "PAST_DUE"].includes(company.status || "")
  ) {
    return json(
      { ok: false, error: "Sem permissão para adicionar membros à equipe." },
      403,
    );
  }

  if (company.role === "ADMIN" && role === "ADMIN")
    return json(
      { ok: false, error: "Somente o proprietário pode adicionar administradores." },
      403,
    );

  if (cleanEmail(current.data.user.email) === email)
    return json(
      { ok: false, error: "Use outro e-mail. Sua conta já faz parte da equipe." },
      400,
    );

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const lookup = await admin.rpc("find_auth_user_by_email", { p_email: email });
  if (lookup.error)
    return json(
      { ok: false, error: "Não foi possível verificar o e-mail informado." },
      500,
    );

  let targetUserId = (lookup.data as string | null) || "";
  let invited = false;

  if (!targetUserId) {
    const config = await admin
      .from("configuracoes_plataforma")
      .select("public_app_url")
      .eq("id", true)
      .maybeSingle();

    const publicAppUrl =
      typeof config.data?.public_app_url === "string" &&
      /^https:\/\//i.test(config.data.public_app_url)
        ? config.data.public_app_url.replace(/\/$/, "")
        : "https://horaria.site";

    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: publicAppUrl,
      data: {
        responsible_name: name,
        team_invite: true,
      },
    });

    if (invite.error || !invite.data.user) {
      const retryLookup = await admin.rpc("find_auth_user_by_email", {
        p_email: email,
      });
      const duplicateLike = /already|registered|exists|existente/i.test(
        invite.error?.message || "",
      );

      if (retryLookup.error) {
        return json(
          {
            ok: false,
            error:
              "Não foi possível enviar o convite agora. Tente novamente em alguns instantes.",
          },
          400,
        );
      }

      if (duplicateLike && retryLookup.data) {
        targetUserId = retryLookup.data as string;
      } else {
        if (retryLookup.data) {
          await admin.auth.admin.deleteUser(retryLookup.data as string).catch(
            () => undefined,
          );
        }
        return json(
          {
            ok: false,
            error:
              "Não foi possível enviar o convite agora. Tente novamente em alguns instantes.",
          },
          400,
        );
      }
    } else {
      targetUserId = invite.data.user.id;
      invited = true;
    }
  }

  const linked = await admin.rpc("link_team_member", {
    p_actor: current.data.user.id,
    p_target: targetUserId,
    p_name: name,
    p_email: email,
    p_role: role,
  });

  if (linked.error) {
    if (invited && targetUserId) {
      await admin.auth.admin.deleteUser(targetUserId).catch(() => undefined);
    }
    const raw = linked.error.message || "";
    const allowed = [
      "outra assistência",
      "já faz parte da equipe",
      "Sem permissão",
      "Somente o proprietário",
      "proprietário já pertence",
      "Membro inválido",
      "Função inválida",
    ].find((fragment) => raw.includes(fragment));

    return json(
      {
        ok: false,
        error: allowed
          ? raw
          : "Não foi possível vincular este usuário à equipe.",
      },
      400,
    );
  }

  return json({
    ok: true,
    mode: invited ? "invited" : "linked",
    member: linked.data,
  });
});
