import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const token = "85000000-0000-4000-8000-000000000001";
function render(file, search, props = {}) {
  const exports = {};
  const stub = () => null;
  const mocks = {
    "next/navigation": {
      useRouter: () => ({}),
      useSearchParams: () => new URLSearchParams(search),
    },
    "next/link": {
      __esModule: true,
      default: ({ children, ...rest }) =>
        React.createElement("a", rest, children),
    },
    "@/lib/supabase": { configured: true, supabase: null, publicDb: null },
    "@/lib/turnstile-config": { turnstileSiteKey: "test" },
    "@/lib/turnstile-errors": { turnstileErrorMessage: () => "Falha na verificação" },
    "./brand": { Brand: stub, MissingConfig: stub },
    "./turnstile": { __esModule: true, default: stub },
    "@/components/horaria-hero-brand": { __esModule: true, default: stub },
    "@/app/home.module.css": { __esModule: true, default: {} },
  };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: (name) => mocks[name] || require(name),
      URLSearchParams,
      Date,
      console,
    },
  );
  return renderToStaticMarkup(React.createElement(exports.default, props));
}
test("cadastro por convite: conta de funcionário sem criar assistência, com termos e senha", () => {
  const html = render(
    "components/auth-page.tsx",
    `next=${encodeURIComponent("/convite?token=" + token)}`,
    { mode: "signup" },
  );
  assert.ok(!html.includes('name="empresa"'));
  assert.ok(!html.includes('name="slug"'));
  for (const name of ["responsavel", "email", "password", "legal"])
    assert.ok(html.includes(`name="${name}"`));
});
test("cadastro comum mantém formulário de empresa", () => {
  const html = render("components/auth-page.tsx", "", { mode: "signup" });
  assert.ok(html.includes('name="empresa"'));
  assert.ok(html.includes('name="slug"'));
});
test("convite renderizado preserva o token em login/cadastro e rejeita link inválido", () => {
  const html = render("components/team-invitation.tsx", `token=${token}`);
  assert.ok(html.includes(encodeURIComponent("/convite?token=" + token)));
  assert.ok(html.includes("Aceitar convite"));
  const invalid = render("components/team-invitation.tsx", "token=invalido");
  assert.ok(invalid.includes("Link de convite inválido"));
  assert.ok(!invalid.includes("Aceitar convite"));
});
