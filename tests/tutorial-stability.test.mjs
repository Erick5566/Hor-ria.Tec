import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";

const source = readFileSync("components/interactive-tutorial.tsx", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function getHelpers(elements = []) {
  const exports = {};
  const window = {
    innerWidth: 375,
    innerHeight: 812,
    getComputedStyle: (el) => ({ display: el.hidden ? "none" : "block", visibility: "visible" }),
  };
  const document = { querySelectorAll: () => elements };
  vm.runInNewContext(compiled + "\nexports._target = targetElement; exports._sameRect = sameRect;", {
    exports, window, document,
    require: (id) => ({
      react: React,
      "react/jsx-runtime": jsxRuntime,
      "next/navigation": { useRouter: () => ({}), usePathname: () => "/painel" },
      "@/lib/supabase": { supabase: null },
    })[id] ?? (() => { throw new Error("Dependency unexpectedly loaded: " + id); })(),
  });
  return exports;
}

function element(rect, hidden = false) {
  return {
    hidden,
    getBoundingClientRect: () => rect,
    closest: () => null,
  };
}

test("tour finds visible mobile navigation even when offscreen desktop sidebar is first", () => {
  const sidebar = element({ left: -300, right: -90, top: 100, bottom: 145, width: 210, height: 45 });
  const mobile = element({ left: 20, right: 180, top: 700, bottom: 744, width: 160, height: 44 });
  const hidden = element({ left: 30, right: 170, top: 200, bottom: 245, width: 140, height: 45 }, true);
  const { _target } = getHelpers([sidebar, hidden, mobile]);
  assert.equal(_target('[data-tour-href="/painel"]'), mobile);
});

test("tour keeps offscreen fallback so the target can be scrolled into view", () => {
  const sidebar = element({ left: 10, right: 140, top: 1200, bottom: 1245, width: 130, height: 45 });
  const { _target } = getHelpers([sidebar]);
  assert.equal(_target("[data-tour='customer-name']"), sidebar);
});

test("tour measurement does not change an unchanged rectangle", () => {
  const { _sameRect } = getHelpers();
  const rect = { top: 100, left: 25, width: 220, height: 40 };
  assert.equal(_sameRect(rect, { ...rect }), true);
  assert.equal(_sameRect(rect, { ...rect, top: 112 }), false);
  assert.equal(_sameRect(null, null), true);
});

test("tour never includes manager-only pages for technical roles", () => {
  const { buildTutorialSteps } = getHelpers();
  const technicalRoutes = [
    { href: "/painel", label: "Painel" },
    { href: "/painel/ordens", label: "Ordens" },
    { href: "/painel/clientes", label: "Clientes" },
  ];
  const tech = buildTutorialSteps(technicalRoutes);
  assert.equal(tech.some((step) => step.href === "/painel/financeiro"), false);
  assert.equal(tech.some((step) => step.href === "/painel/equipe"), false);
  assert.equal(tech.filter((step) => step.id === "client-add").length, 1);
  assert.equal(tech.filter((step) => step.id === "client-name").length, 1);
  assert.equal(tech[0].kind, "welcome");
  assert.equal(tech.at(-1).kind, "finish");
});

test("tour saves changes sequentially and does not write fictional business records", () => {
  assert.match(source, /writeQueue\.current\s*=\s*writeQueue\.current\.catch/);
  assert.match(source, /setSpot\(current\s*=>\s*sameRect\(current, rect\)/);
  assert.doesNotMatch(source, /\.from\(["'](?:clientes|ordens_servico|pecas)["']\)/);
});
