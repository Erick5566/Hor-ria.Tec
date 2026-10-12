import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";

const route = ts.transpileModule(readFileSync("app/api/ai/chat/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const owner = "f8000000-0000-4000-8000-000000000001";
const company = "f8000000-0000-4000-8000-000000000002";

function createHarness({ authenticated = true, flag = false, paid = false, balance = false, origin = "https://example.test", mark = true, settle = true, providerFails = false } = {}) {
  const rpcCalls = [];
  const paidCalls = [];
  const mockContext = authenticated
    ? {
      user: { id: owner },
      context: {
        globalMaintenance: false,
        company: {
          id: company, name: "Assistência de teste", slug: "test-company",
          status: "ACTIVE", maintenance: false, featureFlags: { aiEnabled: flag },
        },
      },
    }
    : null;
  const exports = {};
  vm.runInNewContext(route, {
    exports,
    Request, Response, URL, process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.test",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-do-not-send",
        HORARIA_OPENAI_API_KEY: paid ? "isolated-test-key" : "",
        HORARIA_AI_PAID_ENABLED: paid ? "true" : "false",
      },
    },
    require: (id) => {
      switch (id) {
        case "next/server": return { NextResponse: { json: (v, o) => Response.json(v, o) } };
        case "@/lib/server-auth": return { getServerAccess: async () => mockContext };
        case "@/lib/horaria-ai-core": return {
          freeSupportReply: (v) => "Resposta gratuita: " + v,
          safeHistory: () => [],
        };
        case "@/lib/horaria-ai-provider": return {
          createPaidAiReply: async (...args) => { paidCalls.push(args); if(providerFails) throw new Error("timeout"); return "Resposta simulada"; },
        };
        case "@supabase/supabase-js": return {
          createClient: () => ({
            rpc: async (name) => {
              rpcCalls.push(name);
              if (name === "ai_reserve_message")
                return balance ? { data: "request-test", error: null } : { data: null, error: { message: "Sem saldo" } };
              if (name === "ai_mark_provider_started") return { data: mark, error: null };
              if (name === "ai_finalize_message") return { data: settle, error: settle ? null : {message:"Fail"} };
              throw new Error("Unexpected RPC");
            },
          }),
        };
        default: throw new Error("Unexpected require " + id);
      }
    },
  });
  const send = (mode = "support", message = "Dúvida de teste") => exports.POST(new Request("https://example.test/api/ai/chat", {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ mode, message }),
  }));
  return { send, rpcCalls, paidCalls };
}

test("Chat Horária: não atende sessão anônima nem aceita origem externa", async () => {
  assert.equal((await createHarness({ authenticated: false }).send()).status, 401);
  assert.equal((await createHarness({ origin: "https://attacker.test" }).send()).status, 403);
});

test("Chat Horária: suporte gratuito não consulta carteira nem provedor pago", async () => {
  const h = createHarness();
  const response = await h.send();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.origin, "knowledge-base");
  assert.equal(data.paid, false);
  assert.deepEqual(h.rpcCalls, []);
  assert.deepEqual(h.paidCalls, []);
});

test("Chat Horária: sem licença, sem ativação ou sem créditos não chama IA externa", async () => {
  const cases = [
    { flag: false, paid: false, balance: false, status: 403 },
    { flag: true, paid: false, balance: false, status: 503 },
    { flag: true, paid: true, balance: false, status: 402 },
  ];
  for (const c of cases) {
    const h = createHarness(c);
    const result = await h.send("company");
    assert.equal(result.status, c.status);
    assert.equal(h.paidCalls.length, 0);
  }
});

test("Chat Horária: com créditos, reserva antes de chamar OpenAI e liquida depois", async () => {
  const h = createHarness({ flag: true, paid: true, balance: true });
  const r = await h.send("company");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).reply, "Resposta simulada");
  assert.deepEqual(h.rpcCalls, ["ai_reserve_message", "ai_mark_provider_started", "ai_finalize_message"]);
  assert.equal(h.paidCalls.length, 1);
});

test("Chat Horária: falha de marcação não abre API e devolve reserva", async () => {
  const h = createHarness({ flag:true, paid:true, balance:true, mark:false });
  assert.equal((await h.send("company")).status,503);
  assert.equal(h.paidCalls.length,0);
  assert.deepEqual(h.rpcCalls,["ai_reserve_message","ai_mark_provider_started","ai_finalize_message"]);
});

test("Chat Horária: erro de liquidação após resposta não reembolsa resposta gerada", async () => {
  const h = createHarness({ flag:true, paid:true, balance:true, settle:false });
  assert.equal((await h.send("company")).status,503);
  assert.equal(h.paidCalls.length,1);
  assert.deepEqual(h.rpcCalls,["ai_reserve_message","ai_mark_provider_started","ai_finalize_message"]);
});

test("Chat Horária: timeout externo mantém crédito reservado para conciliação", async () => {
  const h=createHarness({flag:true,paid:true,balance:true,providerFails:true});
  const r=await h.send("company");
  assert.equal(r.status,503);
  assert.equal((await r.json()).code,"AI_RECONCILIATION_REQUIRED");
  assert.equal(h.paidCalls.length,1);
  assert.deepEqual(h.rpcCalls,["ai_reserve_message","ai_mark_provider_started"]);
});
