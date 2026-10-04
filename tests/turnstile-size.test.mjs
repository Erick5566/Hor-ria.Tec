import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

test("public booking uses compact Turnstile without losing token lifecycle", async () => {
  const source = readFileSync("components/turnstile.tsx", "utf8");
  const portal = readFileSync("components/public-portal.tsx", "utf8");
  assert.match(portal, /<Turnstile\s+siteKey=\{turnstileSiteKey\}\s+onToken=\{setTurnstileToken\}\s+size="compact"/);
  const rendered = [];
  const cleanups = [];
  const removed = [];
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    console,
    window: { turnstile: {
      render: (_container, options) => { rendered.push(options); return "widget"; },
      remove: (id) => removed.push(id),
    } },
    require: (name) => name === "react" ? {
      useRef: () => ({ current: {} }),
      useEffect: (fn) => cleanups.push(fn()),
    } : { jsx: React.createElement, jsxs: React.createElement },
  });
  const tokens = [];
  exports.default({ siteKey: "public-test-key", onToken: (t) => tokens.push(t), size: "compact" });
  await Promise.resolve();
  assert.equal(rendered[0].size, "compact");
  rendered[0].callback("test-token");
  rendered[0]["expired-callback"]();
  assert.deepEqual(tokens, ["test-token", ""]);
  cleanups[0]();
  assert.deepEqual(removed, ["widget"]);
  exports.default({ siteKey: "public-test-key", onToken: () => {} });
  await Promise.resolve();
  assert.equal(rendered[1].size, "normal");
});

