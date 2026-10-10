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
    /^sha256=[0-9a-f]{64}$/.test(supplied) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid)
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  let event: BillingEvent;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    event = parsed as BillingEvent;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  // The idempotency key must be part of the signed body.
  const eventId = event.eventId;
  const headerEventId = request.headers.get("x-horaria-event-id");
  if (
    typeof eventId !== "string" ||
    !eventId.trim() ||
    eventId.length > 200 ||
    (headerEventId !== null && headerEventId !== eventId) ||
    typeof event.eventType !== "string" ||
    !event.eventType ||
    typeof event.companyId !== "string" ||
    !uuid.test(event.companyId)
  )
    return NextResponse.json({ error: "Evento incompleto" }, { status: 400 });
  const allowedEvents = [
    "payment.approved",
    "payment.failed",
    "payment.past_due",
    "subscription.created",
    "subscription.canceled",
  ];
  const invalidOptionalId = [
    event.externalSubscriptionId,
    event.externalPaymentId,
  ].some(
    (value) =>
      value !== undefined &&
      (typeof value !== "string" || !value.trim() || value.length > 200),
  );
  if (
    !allowedEvents.includes(event.eventType) ||
    invalidOptionalId ||
    (event.amount !== undefined &&
      (typeof event.amount !== "number" ||
        !Number.isFinite(event.amount) ||
        event.amount <= 0)) ||
    (event.currency !== undefined && event.currency !== "BRL") ||
    (event.nextBillingAt !== undefined &&
      (typeof event.nextBillingAt !== "string" ||
        !Number.isFinite(Date.parse(event.nextBillingAt)))) ||
    (event.eventType === "payment.approved" &&
      (!event.externalPaymentId || event.amount === undefined))
  )
    return NextResponse.json({ error: "Pagamento inválido" }, { status: 400 });
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
