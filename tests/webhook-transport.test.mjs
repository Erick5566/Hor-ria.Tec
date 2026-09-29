import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { createHmac, timingSafeEqual } from "node:crypto";

// Execute the production handlers with isolated credentials and transports.
// No network calls or production database writes are possible in these tests.
async function loadHandler(path, globals) {
  const source = (await readFile(path, "utf8"))
    .replace(/^import .*;\n/gm, "")
    .replace("export async function POST", "async function POST");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  const context = vm.createContext({ Request, Response, Buffer, ...globals });
  vm.runInContext(javascript, context);
  return context;
}
async function billingHarness() {
  const calls = [];
  const env = {
    HORARIA_BILLING_PROVIDER: "test",
    HORARIA_BILLING_WEBHOOK_SECRET: "test-secret",
    SUPABASE_SERVICE_ROLE_KEY: "isolated-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://isolated.invalid",
  };
  const result = { data: true, error: null };
  const ctx = await loadHandler(
    "app/api/webhooks/billing/[provider]/route.ts",
    {
      process: { env },
      createHmac,
      timingSafeEqual,
      NextResponse: { json: (body, options) => Response.json(body, options) },
      createClient: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return result;
        },
      }),
    },
  );
  const send = (raw, signed = true, provider = "test") =>
    ctx.POST(
      new Request("https://isolated.invalid", {
        method: "POST",
        body: raw,
        headers: {
          "x-horaria-signature": signed
            ? `sha256=${createHmac("sha256", env.HORARIA_BILLING_WEBHOOK_SECRET).update(raw).digest("hex")}`
            : "invalid",
        },
      }),
      { params: Promise.resolve({ provider }) },
    );
  return { send, calls, env, result };
}
async function whatsappHarness({
  notification = {
    evento: "pronto_retirada",
    destinatario: "5511000000000",
    tentativas: 0,
    payload: {
      cliente: "Teste",
      equipamento: "Notebook",
      token: "test-token",
      numero: 1001,
      total: 120,
    },
  },
  transportStatus = 200,
} = {}) {
  const updates = [],
    sends = [],
    filters = [];
  const env = {
    NOTIFICATION_WEBHOOK_SECRET: "test-secret",
    WHATSAPP_ACCESS_TOKEN: "isolated-token",
    WHATSAPP_PHONE_NUMBER_ID: "test-phone",
    SUPABASE_URL: "https://isolated.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "isolated-key",
    WHATSAPP_TEMPLATE_READY: "ready",
    WHATSAPP_TEMPLATE_QUOTE: "quote",
    PUBLIC_APP_URL: "https://isolated.invalid/",
  };
  let handler;
  await loadHandler("supabase/functions/whatsapp-notifications/index.ts", {
    Deno: {
      env: { get: (key) => env[key] },
      serve: (fn) => {
        handler = fn;
      },
    },
    createClient: () => ({
      from: (table) => {
        assert.equal(table, "notificacoes");
        const builder = {
          update: (value) => {
            updates.push(value);
            return builder;
          },
          eq: (key, value) => {
            filters.push([key, value]);
            return builder;
          },
          select: () => builder,
          maybeSingle: async () => ({ data: notification, error: null }),
        };
        return builder;
      },
    }),
    fetch: async (url, options) => {
      sends.push({ url, body: JSON.parse(options.body) });
      return Response.json(
        transportStatus === 200
          ? { messages: [{ id: "mock-message" }] }
          : { error: { message: "Rejected in simulation" } },
        { status: transportStatus },
      );
    },
  });
  const send = (
    raw = '{"id":"test-notification"}',
    secret = "test-secret",
    method = "POST",
  ) =>
    handler(
      new Request("https://isolated.invalid", {
        method,
        ...(method === "POST" ? { body: raw } : {}),
        headers: { "x-horaria-webhook-secret": secret },
      }),
    );
  return { send, env, updates, sends, filters };
}

test("cobrança: rejeita JSON malformado, null, lista e evento incompleto sem chamar banco", async () => {
  const h = await billingHarness();
  for (const raw of ["{", "null", "[]", "{}"])
    assert.equal((await h.send(raw)).status, 400, raw);
  assert.equal(h.calls.length, 0);
});
test("cobrança: autentica assinatura e configuração antes de processar", async () => {
  const h = await billingHarness();
  assert.equal((await h.send("{}", false)).status, 401);
  assert.equal((await h.send("{}", true, "unknown")).status, 404);
  delete h.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await h.send("{}")).status, 503);
  assert.equal(h.calls.length, 0);
});
test("cobrança: encaminha evento assinado, duplicado e erro do banco", async () => {
  const h = await billingHarness();
  const raw = JSON.stringify({
    eventId: "test-event",
    eventType: "payment.approved",
    companyId: "10000000-0000-4000-8000-000000000001",
    amount: 99.9,
  });
  assert.equal((await h.send(raw)).status, 200);
  assert.equal(h.calls[0].name, "process_billing_event");
  assert.equal(h.calls[0].args.p_amount, 99.9);
  assert.equal(h.calls[0].args.p_currency, "BRL");
  h.result.data = false;
  assert.equal((await (await h.send(raw)).json()).processed, false);
  h.result.error = { message: "Simulated rejection" };
  assert.equal((await h.send(raw)).status, 422);
});
test("WhatsApp: rejeita JSON inválido e IDs de tipos incorretos sem enviar", async () => {
  const h = await whatsappHarness();
  for (const raw of ["{", "null", "[]", "{}", '{"id":123}', '{"id":{}}'])
    assert.equal((await h.send(raw)).status, 400, raw);
  assert.equal(h.sends.length, 0);
  assert.equal(h.updates.length, 0);
});
test("WhatsApp: autenticação, método e configuração impedem envio", async () => {
  const h = await whatsappHarness();
  assert.equal((await h.send(undefined, "wrong")).status, 401);
  assert.equal((await h.send(undefined, undefined, "GET")).status, 405);
  delete h.env.WHATSAPP_ACCESS_TOKEN;
  assert.equal((await h.send()).status, 503);
  assert.equal(h.sends.length, 0);
});
test("WhatsApp: mensagem pronta e orçamento usam templates e registram sucesso", async () => {
  for (const evento of ["pronto_retirada", "orcamento_enviado"]) {
    const h = await whatsappHarness({
      notification: {
        evento,
        destinatario: "5511000000000",
        tentativas: 2,
        payload: {
          cliente: "Teste",
          equipamento: "Notebook",
          token: "test-token",
          numero: 1001,
          total: 120,
        },
      },
    });
    assert.equal((await h.send()).status, 200);
    assert.equal(h.sends.length, 1);
    assert.equal(
      h.sends[0].body.template.name,
      evento === "pronto_retirada" ? "ready" : "quote",
    );
    const params = h.sends[0].body.template.components[0].parameters;
    assert.equal(
      params.at(-1).text,
      "https://isolated.invalid/acompanhar/test-token",
    );
    assert.equal(params.length, evento === "pronto_retirada" ? 3 : 4);
    assert.ok(
      h.filters.some(
        ([key, value]) => key === "status" && value === "pendente",
      ),
    );
    assert.equal(h.updates.at(-1).status, "enviada");
    assert.equal(h.updates.at(-1).tentativas, 3);
  }
});
test("WhatsApp: evento já processado não envia novamente", async () => {
  const h = await whatsappHarness({ notification: null });
  assert.equal((await (await h.send()).json()).skipped, true);
  assert.equal(h.sends.length, 0);
});
test("WhatsApp: template ausente retorna à fila, falha do provedor registra tentativa", async () => {
  const missing = await whatsappHarness();
  delete missing.env.WHATSAPP_TEMPLATE_READY;
  assert.equal((await missing.send()).status, 503);
  assert.equal(missing.updates.at(-1).status, "pendente");
  assert.equal(missing.sends.length, 0);
  const failed = await whatsappHarness({ transportStatus: 400 });
  assert.equal((await failed.send()).status, 502);
  assert.equal(failed.updates.at(-1).status, "falhou");
  assert.equal(failed.updates.at(-1).tentativas, 1);
});
