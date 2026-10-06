import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("orders: workspace fallback reloads data without F5 and cleans up on navigation", async () => {
  const events = new EventTarget(),
    timers = new Map(),
    effects = [],
    cleanups = [];
  let nextTimer = 0,
    rpcCalls = 0,
    removed = 0;
  const fakeWindow = {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    setTimeout: (fn) => {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const channel = { on: () => channel, subscribe: () => channel };
  const mocks = {
    react: {
      useState: (value) => [
        typeof value === "function" ? value() : value,
        () => {},
      ],
      useEffect: (fn) => effects.push(fn),
      useCallback: (fn) => fn,
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "next/link": { __esModule: true, default: () => null },
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "@/lib/assistencia": { money: () => "", stamp: () => "", statuses: {} },
    "@/lib/supabase": {
      message: (e) => e.message,
      supabase: {
        rpc: async () => {
          rpcCalls++;
          return { data: null, error: null };
        },
        channel: () => channel,
        removeChannel: async () => {
          removed++;
        },
      },
    },
    "@/components/ui": {},
    "@/components/workspace": {
      useWorkspace: () => ({
        empresa: { id: "tenant-a" },
        access: { company: { role: "OWNER" } },
      }),
    },
  };
  function load(path) {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(readFileSync(path, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        exports,
        window: fakeWindow,
        Event,
        CustomEvent,
        URLSearchParams,
        console,
        require: (name) =>
          mocks[name] ||
          (name === "@/lib/data-change"
            ? load("lib/data-change.ts")
            : (() => {
                throw Error(name);
              })()),
      },
    );
    return exports;
  }
  load("components/orders-list.tsx").default();
  effects.forEach((fn) => {
    const cleanup = fn();
    if (cleanup) cleanups.push(cleanup);
  });
  await Promise.resolve();
  timers.clear();
  const baseline = rpcCalls;
  events.dispatchEvent(new Event("horaria:data-change"));
  [...timers.values()].forEach((fn) => fn());
  timers.clear();
  await Promise.resolve();
  assert.equal(
    rpcCalls,
    baseline + 1,
    "a missed Realtime event must be recovered by the workspace sync event",
  );
  cleanups.forEach((fn) => fn());
  events.dispatchEvent(new Event("horaria:data-change"));
  assert.equal(timers.size, 0);
  assert.equal(removed, 1);
});
