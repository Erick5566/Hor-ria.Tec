import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

async function harness(options = {}) {
  const row = {
    id: "10000000-0000-4000-8000-000000000191",
    dispatch_token: "20000000-0000-4000-8000-000000000191",
    unique_key: "billing:payment:audit:approved",
    status: "pending",
    attempts: 0,
    requires_review: false,
    recipient: "test@example.invalid",
    subject: "Audit",
    event_type: "payment_approved",
    payload: {
      companyName: '<img src=x onerror="alert(1)">',
      ownerName: "A&B",
      ownerEmail: "audit@example.invalid",
      city: "<script>x</script>",
      state: "BA",
      status: "ACTIVE",
      amount: 44.99,
    },
    ...options.row,
  };
  const env = {
    SUPABASE_URL: "https://isolated.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "isolated-key",
    RESEND_API_KEY: "isolated-resend",
    ...options.env,
  };
  const sends = [],
    filters = [],
    updates = [];
  let handler;
  const source = (
    await readFile("supabase/functions/admin-billing-email/index.ts", "utf8")
  ).replace(/^import .*;\r?\n/gm, "");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  vm.runInNewContext(code, {
    Request,
    Response,
    AbortSignal,
    crypto: webcrypto,
    console,
    Deno: {
      env: { get: (k) => env[k] },
      serve: (fn) => {
        handler = fn;
      },
    },
    createClient: () => ({
      rpc: async () => ({
        data: {
          resendApiKey: null,
          from: "Horária <notificacoes@horaria.site>",
        },
        error: null,
      }),
      from: () => {
        let patch,
          conditions = [];
        const apply = () => {
          if (
            !conditions.every(([key, value, inside]) =>
              inside ? value.includes(row[key]) : row[key] === value,
            )
          )
            return { data: null, error: null };
          if (options.failSentWrite && patch.status === "sent")
            return {
              data: null,
              error: { message: "isolated DB write failure" },
            };
          if (options.failFailedWrite && patch.status === "failed")
            return { data: null, error: { message: "isolated DB write failure" } };
          Object.assign(row, patch);
          updates.push(patch);
          return { data: { ...row }, error: null };
        };
        const query = {
          update: (value) => {
            patch = value;
            return query;
          },
          eq: (key, value) => {
            conditions.push([key, value, false]);
            filters.push([key, value]);
            return query;
          },
          in: (key, value) => {
            conditions.push([key, value, true]);
            return query;
          },
          select: () => query,
          maybeSingle: async () => apply(),
          then: (resolve, reject) =>
            Promise.resolve(apply()).then(resolve, reject),
        };
        return query;
      },
    }),
    fetch: async (url, init) => {
      sends.push({ url, init, body: JSON.parse(init.body) });
      if (options.throwNetwork) throw new Error("isolated timeout");
      return Response.json(
        options.providerStatus
          ? { message: "isolated provider rejection" }
          : { id: "mock-email" },
        { status: options.providerStatus || 200 },
      );
    },
  });
  const send = (body = { id: row.id, dispatchToken: row.dispatch_token }) =>
    handler(
      new Request("https://isolated.invalid", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  return { row, env, sends, filters, updates, send };
}

test("admin email: uncertain failure persistence returns 503", async () => {
  const h = await harness({throwNetwork:true,failFailedWrite:true});
  assert.equal((await h.send()).status,503);
  assert.equal(h.row.status,"processing");
});

test("admin email: uncertain review persistence returns 503", async () => {
  const h = await harness({failFailedWrite:true,row:{attempts:1}});
  assert.equal((await h.send()).status,503);
  assert.equal(h.sends.length,0);
});

test("admin email: invalid payload/token cannot access the database or send", async () => {
  const h = await harness();
  for (const payload of ["{", "null", "[]", "{}"])
    assert.ok([400, 401].includes((await h.send(payload)).status));
  assert.equal(h.sends.length, 0);
  assert.equal(h.updates.length, 0);
  assert.equal(
    (
      await h.send({
        id: h.row.id,
        dispatchToken: "30000000-0000-4000-8000-000000000191",
      })
    ).status,
    200,
  );
  assert.equal(h.sends.length, 0);
});
test("admin email: official sender, escaped account fields, deterministic key and timeout", async () => {
  const h = await harness();
  assert.equal((await h.send()).status, 200);
  assert.equal(h.sends[0].body.from, "Horária <notificacoes@horaria.site>");
  assert.ok(h.sends[0].init.signal);
  assert.equal(h.sends[0].init.headers["Idempotency-Key"], h.row.unique_key);
  assert.doesNotMatch(h.sends[0].body.html, /<script>|<img src=x/);
  assert.match(h.sends[0].body.html, /&lt;script&gt;|&lt;img/);
  assert.match(h.sends[0].body.html, /A&amp;B/);
  assert.equal(h.row.status, "sent");
});
test("admin email: two concurrent dispatches produce one send", async () => {
  const h = await harness();
  const responses = await Promise.all([h.send(), h.send()]);
  assert.equal(h.sends.length, 1);
  assert.ok(responses.every((r) => r.status === 200));
});
test("admin email: missing credentials retain the event for recovery", async () => {
  const h = await harness({ env: { RESEND_API_KEY: "" } });
  assert.equal((await h.send()).status, 503);
  assert.equal(h.row.status, "pending");
  assert.equal(h.sends.length, 0);
});
test("admin email: provider/network failure retains one event for retry", async () => {
  for (const options of [{ providerStatus: 503 }, { throwNetwork: true }]) {
    const h = await harness(options);
    assert.equal((await h.send()).status, 502);
    assert.equal(h.row.status, "failed");
    assert.equal(h.row.attempts, 1);
  }
});
test("admin email: successful delivery is not reported as persisted when DB finalization fails", async () => {
  const h = await harness({ failSentWrite: true });
  assert.equal((await h.send()).status, 503);
  assert.equal(h.row.status, "processing");
  assert.equal(h.sends.length, 1);
});
test("admin email: quarantined or expired idempotency-window events never auto-send", async () => {
  for (const row of [
    { requires_review: true },
    { delivery_started_at: "2000-01-01T00:00:00Z" },
  ]) {
    const h = await harness({ row });
    await h.send();
    assert.equal(h.sends.length, 0);
  }
});
