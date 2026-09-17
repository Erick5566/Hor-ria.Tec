import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type BillingEvent = {
  eventId?: string;
  eventType?:
    | "payment.approved"
    | "payment.failed"
    | "payment.past_due"
    | "subscription.created"
    | "subscription.canceled";
  companyId?: string;
  externalSubscriptionId?: string;
  externalPaymentId?: string;
  nextBillingAt?: string;
  amount?: number;
  currency?: string;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const configuredProvider = process.env.HORARIA_BILLING_PROVIDER;
  const secret = process.env.HORARIA_BILLING_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredProvider || provider !== configuredProvider)
    return NextResponse.json(
      { error: "Provedor não configurado" },
      { status: 404 },
    );
  if (!secret || !serviceKey || !url)
    return NextResponse.json(
      { error: "Cobrança ainda não configurada" },
      { status: 503 },
    );
  const raw = await request.text();
  const supplied = request.headers.get("x-horaria-signature") || "";
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const valid =
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid)
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  let event: BillingEvent;
  try {
    event = JSON.parse(raw) as BillingEvent;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const eventId = request.headers.get("x-horaria-event-id") || event.eventId;
  if (
    !eventId ||
    eventId.length > 200 ||
    !event.eventType ||
    !event.companyId ||
    !uuid.test(event.companyId)
  )
    return NextResponse.json({ error: "Evento incompleto" }, { status: 400 });
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await client.rpc("process_billing_event", {
    p_provider: provider,
    p_event_id: eventId,
    p_event_type: event.eventType,
    p_empresa: event.companyId,
    p_external_subscription: event.externalSubscriptionId || null,
    p_external_payment: event.externalPaymentId || null,
    p_next_billing: event.nextBillingAt || null,
    p_amount: event.amount ?? null,
    p_currency: event.currency || "BRL",
    p_payload: event,
  });
  if (result.error)
    return NextResponse.json(
      { error: "Evento não processado" },
      { status: 422 },
    );
  return NextResponse.json({ received: true, processed: result.data });
}
