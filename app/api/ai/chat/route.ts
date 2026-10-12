import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerAccess } from "@/lib/server-auth";
import { freeSupportReply, safeHistory } from "@/lib/horaria-ai-core";
import { createPaidAiReply } from "@/lib/horaria-ai-provider";

export const runtime = "nodejs";

function json(payload: object, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Origem inválida" }, 403);
  if (Number(request.headers.get("content-length") || 0) > 14000)
    return json({ error: "Mensagem muito longa" }, 413);

  const access = await getServerAccess();
  if (!access?.user?.id || !access.context.company)
    return json({ error: "Entre na Horária para conversar." }, 401);
  if (access.context.globalMaintenance ||
      access.context.company.maintenance ||
      ["SUSPENDED", "CANCELED", "PENDING_DELETION"].includes(access.context.company.status))
    return json({ error: "Assistência indisponível no momento." }, 403);

  let body: Record<string, unknown> | null;
  try {
    const raw = await request.text();
    if (raw.length > 14000) return json({ error: "Mensagem muito longa" }, 413);
    const value: unknown = JSON.parse(raw);
    body = value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch {
    return json({ error: "Formato inválido" }, 400);
  }

  if (!body || typeof body.message !== "string" ||
      body.message.trim().length < 2 || body.message.length > 900 ||
      !["support", "company"].includes(String(body.mode)))
    return json({ error: "Mensagem ou modalidade inválida" }, 400);

  const message = body.message.trim();
  const history = safeHistory(body.history);
  const company = access.context.company;

  if (body.mode === "support") {
    // Suporte gratuito no MVP: respostas locais verificadas e SEM chamadas pagas.
    return json({
      reply: freeSupportReply(message),
      origin: "knowledge-base",
      paid: false,
    });
  }

  // O assistente da assistência só funciona quando a empresa contratou e
  // recebeu créditos pré-pagos. Ativar "Pro" sozinho não realiza cobrança.
  if (!company.featureFlags.aiEnabled)
    return json({ error: "Assistente IA não está habilitado para esta assistência.", code: "AI_DISABLED" }, 403);
  if (!process.env.HORARIA_OPENAI_API_KEY ||
      process.env.HORARIA_AI_PAID_ENABLED !== "true")
    return json({ error: "Atendimento com IA ainda não foi ativado. Nenhuma cobrança foi feita.", code: "AI_OFF" }, 503);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url)
    return json({ error: "Créditos de IA indisponíveis. Nenhuma chamada paga foi feita.", code: "WALLET_OFF" }, 503);

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const reserved = await service.rpc("ai_reserve_message", {
    p_empresa: company.id,
    p_actor: access.user.id,
    p_channel: "web",
  });
  if (reserved.error || typeof reserved.data !== "string") {
    // Falha fechado: sem reserva confirmada, jamais chamar a OpenAI.
    return json({
      error: "Sem créditos pré-pagos disponíveis ou acesso ao serviço. Nenhuma chamada paga foi realizada.",
      code: "CREDIT_REQUIRED",
    }, 402);
  }

  let started = false;
  try {
    const marked = await service.rpc("ai_mark_provider_started", {
      p_reservation: reserved.data,
      p_empresa: company.id,
      p_actor: access.user.id,
    });
    started = !marked.error && marked.data === true;
  } catch { started = false; }
  if (!started) {
    try {
      await service.rpc("ai_finalize_message", {
        p_reservation: reserved.data,
        p_success: false,
      });
    } catch { /* Exige conciliação manual. */ }
    return json({ error: "Não foi possível confirmar a reserva. Nenhuma chamada paga foi realizada.", code: "RESERVATION_ERROR" }, 503);
  }

  try {
    const reply = await createPaidAiReply({
      audience: "company-customer",
      prompt: message,
      history,
      company: {
        name: company.name,
        website: company.slug ? "https://horaria.site/" + company.slug : undefined,
      },
    });
    const settled = await service.rpc("ai_finalize_message", {
      p_reservation: reserved.data,
      p_success: true,
    });
    if (settled.error || settled.data !== true) {
      // Reserva permanece pendente e demanda conciliação.
      return json({ error: "Resposta indisponível. Contate o suporte para conferir seus créditos.", code: "SETTLEMENT_ERROR" }, 503);
    }
    return json({ reply, origin: "openai-prepaid", paid: true });
  } catch {
    return json({ error: "Não recebemos uma resposta confirmada. O crédito está reservado para conferência, pois o provedor pode ter cobrado a chamada. Solicite suporte antes de tentar novamente.", code: "AI_RECONCILIATION_REQUIRED" }, 503);
  }
  // Após ai_mark_provider_started, erros e timeouts são ambíguos:
  // não fazemos reembolso automático de chamadas que possam ter custo no provedor.
}
