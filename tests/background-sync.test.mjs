import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

for (const path of [
  "components/workspace.tsx",
  "components/admin-companies-dashboard.tsx",
])
  test(`${path}: background polling is quiet and focus resumes synchronization`, () => {
    const ast = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let effect;
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(ast) === "useEffect" &&
        node.arguments[0]?.getText(ast).includes("const safetySync")
      )
        effect = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.ok(effect);
    const windowEvents = new EventTarget(),
      documentEvents = new EventTarget(),
      timers = new Map(),
      intervals = new Map();
    let seq = 0,
      refreshes = 0,
      removed = 0;
    const window = {
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
      dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
      setTimeout: (fn) => {
        timers.set(++seq, fn);
        return seq;
      },
      clearTimeout: (id) => timers.delete(id),
      setInterval: (fn) => {
        intervals.set(++seq, fn);
        return seq;
      },
      clearInterval: (id) => intervals.delete(id),
    };
    const document = {
      visibilityState: "hidden",
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener:
        documentEvents.removeEventListener.bind(documentEvents),
    };
    const channel = { on: () => channel, subscribe: () => channel };
    const ctx = {
      window,
      document,
      navigator: { onLine: true },
      CustomEvent,
      empresa: { id: "tenant-a" },
      userId: "user",
      supabase: {
        channel: () => channel,
        removeChannel: () => {
          removed++;
        },
      },
      router: { refresh: () => {} },
      refresh: () => {
        refreshes++;
      },
      refreshAdminData: () => {
        refreshes++;
      },
    };
    vm.createContext(ctx);
    vm.runInContext(
      ts.transpileModule("const mount = " + effect, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.None,
        },
      }).outputText + "\nthis.mount=mount;",
      ctx,
    );
    const stop = ctx.mount();
    [...intervals.values()].forEach((fn) => fn());
    assert.equal(refreshes, 0);
    assert.equal(timers.size, 0, "hidden tab must not schedule requests");
    document.visibilityState = "visible";
    windowEvents.dispatchEvent(new Event("focus"));
    [...timers.values()].forEach((fn) => fn());
    timers.clear();
    assert.equal(refreshes, 1);
    stop();
    assert.equal(intervals.size, 0);
    assert.equal(removed, 1);
    windowEvents.dispatchEvent(new Event("focus"));
    assert.equal(timers.size, 0);
  });
