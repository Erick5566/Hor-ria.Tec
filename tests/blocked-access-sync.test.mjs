import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function mount({
  status = "SUSPENDED",
  maintenance = false,
  superAdmin = false,
  session = {},
  rpcError = null,
  syncError = false,
  pending,
} = {}) {
  const state = {
    status,
    maintenance,
    rpcError,
    calls: 0,
    syncs: 0,
    routes: [],
    refreshes: 0,
  };
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const intervals = new Map();
  const document = {
    visibilityState: "visible",
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener:
      documentEvents.removeEventListener.bind(documentEvents),
  };
  const navigator = { onLine: true };
  let cleanup;
  const mocks = {
    react: {
      useEffect: (effect) => {
        cleanup = effect();
      },
    },
    "next/navigation": {
      useRouter: () => ({
        replace: (path) => state.routes.push(path),
        refresh: () => state.refreshes++,
      }),
    },
    "@/lib/supabase": {
      supabase: {
        auth: { getSession: async () => ({ data: { session }, error: null }) },
        rpc: async () => {
          state.calls++;
          if (pending) await pending;
          return {
            error: state.rpcError,
            data: {
              authenticated: true,
              isSuperAdmin: superAdmin,
              globalMaintenance: state.maintenance,
              company: { status: state.status, maintenance: false },
            },
          };
        },
      },
      syncServerSession: async () => {
        state.syncs++;
        if (syncError) throw new Error("Offline");
      },
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync("components/blocked-access-sync.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require: (name) => mocks[name],
      document,
      navigator,
      window: {
        setInterval: (fn) => {
          intervals.set(1, fn);
          return 1;
        },
        clearInterval: (id) => intervals.delete(id),
        addEventListener: windowEvents.addEventListener.bind(windowEvents),
        removeEventListener:
          windowEvents.removeEventListener.bind(windowEvents),
      },
    },
  );
  exports.default();
  return {
    state,
    document,
    navigator,
    intervals,
    stop: () => cleanup(),
    focus: () => windowEvents.dispatchEvent(new Event("focus")),
    tick: () => [...intervals.values()].forEach((fn) => fn()),
  };
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("blocked access: paid/reactivated account returns to the panel without F5", async () => {
  const h = mount();
  await settle();
  assert.equal(h.state.routes.length, 0);
  h.state.status = "ACTIVE";
  h.tick();
  await settle();
  assert.deepEqual(h.state.routes, ["/painel"]);
  assert.equal(h.state.syncs, 1);
  assert.equal(h.state.refreshes, 1);
  h.tick();
  await settle();
  assert.equal(h.state.calls, 2, "navigation must not be repeated");
  h.stop();
});

test("blocked access: administrative blocks, maintenance and failed validation never release access", async () => {
  for (const options of [
    { status: "SUSPENDED" },
    { status: "CANCELED" },
    { status: "PENDING_DELETION" },
    { status: "ACTIVE", maintenance: true },
    { status: "ACTIVE", rpcError: new Error("Unauthorized") },
    { status: "ACTIVE", session: null },
    { status: "ACTIVE", syncError: true },
  ]) {
    const h = mount(options);
    await settle();
    assert.equal(h.state.routes.length, 0);
    h.stop();
  }
});

test("blocked access: hidden/offline tabs pause checks and focus resumes them", async () => {
  const h = mount();
  await settle();
  h.document.visibilityState = "hidden";
  h.tick();
  h.focus();
  await settle();
  assert.equal(h.state.calls, 1);
  h.document.visibilityState = "visible";
  h.navigator.onLine = false;
  h.tick();
  await settle();
  assert.equal(h.state.calls, 1);
  h.navigator.onLine = true;
  h.focus();
  await settle();
  assert.equal(h.state.calls, 2);
  h.stop();
});

test("blocked access: concurrent checks are serialized and late replies after unmount are ignored", async () => {
  let resolve;
  const h = mount({
    status: "ACTIVE",
    pending: new Promise((r) => {
      resolve = r;
    }),
  });
  await settle();
  h.tick();
  h.focus();
  await settle();
  assert.equal(h.state.calls, 1);
  h.stop();
  resolve();
  await settle();
  assert.equal(h.state.syncs, 0);
  assert.equal(h.state.routes.length, 0);
  assert.equal(h.intervals.size, 0);
  h.focus();
  await settle();
  assert.equal(h.state.calls, 1);
});

test("blocked access: Super Admin resumes through the existing admin/MFA guard", async () => {
  const h = mount({ superAdmin: true });
  await settle();
  assert.deepEqual(h.state.routes, ["/admin"]);
  h.stop();
});
