import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function harness(load = async () => ({ status: "pronto" })) {
  let now = 0,
    id = 0,
    calls = 0;
  const timers = new Map(),
    listeners = new Map(),
    received = [],
    warnings = [],
    signals = [];
  const surface = {
    visibilityState: "visible",
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
  };
  const navigator = { onLine: true };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("lib/tracking-refresh.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      AbortController,
      Date: { now: () => now },
      document: surface,
      window: surface,
      navigator,
      setTimeout(fn, delay) {
        timers.set(++id, { fn, at: now + delay });
        return id;
      },
      clearTimeout(key) {
        timers.delete(key);
      },
    },
  );
  const stop = exports.watchTracking(
    async (signal) => {
      calls++;
      signals.push(signal);
      return load(signal);
    },
    (data) => received.push(data),
    (message) => warnings.push(message),
  );
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return {
    stop,
    received,
    warnings,
    signals,
    surface,
    navigator,
    listeners,
    calls: () => calls,
    event: (name) => listeners.get(name)?.(),
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers]
          .filter(([, v]) => v.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

test("acompanhamento: atualiza sem F5 e respeita limite de consultas por dez minutos", async () => {
  const h = harness();
  await h.advance(74999);
  assert.equal(h.calls(), 0);
  await h.advance(1);
  assert.equal(h.received[0].status, "pronto");
  await h.advance(525000);
  assert.equal(h.calls(), 8);
  h.stop();
});
test("acompanhamento: aba oculta e offline pausam; retorno consulta sem disparos duplicados", async () => {
  const h = harness();
  h.surface.visibilityState = "hidden";
  h.event("visibilitychange");
  await h.advance(150000);
  assert.equal(h.calls(), 0);
  h.surface.visibilityState = "visible";
  h.event("visibilitychange");
  h.event("focus");
  await h.advance(0);
  assert.equal(h.calls(), 1);
  for (let i = 0; i < 20; i++) h.event("focus");
  await h.advance(1000);
  assert.equal(h.calls(), 1);
  h.navigator.onLine = false;
  await h.advance(150000);
  assert.equal(h.calls(), 1);
  h.navigator.onLine = true;
  h.event("online");
  await h.advance(0);
  assert.equal(h.calls(), 2);
  h.stop();
});
test("acompanhamento: falha preserva dados e tenta novamente com intervalo maior", async () => {
  let attempt = 0;
  const h = harness(async () => {
    if (++attempt === 2) throw new Error("offline");
    return { status: attempt === 1 ? "reparo" : "pronto" };
  });
  await h.advance(150000);
  assert.equal(h.received.length, 1);
  assert.match(h.warnings.at(-1), /últimos dados/);
  await h.advance(149999);
  assert.equal(h.calls(), 2);
  await h.advance(1);
  assert.equal(h.received.at(-1).status, "pronto");
  assert.equal(h.warnings.at(-1), "");
  h.stop();
});
test("acompanhamento: consultas lentas não se sobrepõem e resultado tardio após saída é ignorado", async () => {
  let resolve;
  const h = harness(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await h.advance(75000);
  h.event("focus");
  await h.advance(5000);
  assert.equal(h.calls(), 1);
  h.stop();
  assert.equal(h.signals[0].aborted, true);
  assert.equal(h.listeners.size, 0);
  resolve({ status: "antigo" });
  await h.advance(600000);
  assert.equal(h.received.length, 0);
  assert.equal(h.calls(), 1);
});
test("acompanhamento: timeout libera consulta e permite recuperação", async () => {
  const h = harness(
    (signal) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("timeout"))),
      ),
  );
  await h.advance(95000);
  assert.equal(h.signals[0].aborted, true);
  assert.match(h.warnings.at(-1), /tentaremos/);
  await h.advance(150000);
  assert.equal(h.calls(), 2);
  h.stop();
});
