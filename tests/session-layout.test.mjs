import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);

test("admin layout mounts one global session keeper", async () => {
  let keepers = 0;
  const mocks = {
    "@/components/session-keeper": {
      __esModule: true,
      default: () => {
        keepers++;
        return null;
      },
    },
    "@/lib/server-auth": {
      getServerAccess: async () => ({
        context: { isSuperAdmin: true, company: null },
        aal: "aal2",
        user: { email: "test@example.invalid" },
      }),
    },
    "next/navigation": {
      redirect: () => {
        throw Error("Unexpected redirect");
      },
    },
    "next/link": {
      __esModule: true,
      default: ({ children, ...props }) =>
        React.createElement("a", props, children),
    },
    "@/components/brand": { Brand: () => null },
    "@/components/admin-header": { __esModule: true, default: () => null },
    "@/components/sign-out-button": { __esModule: true, default: () => null },
  };
  const load = (path) => {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(readFileSync(path, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      {
        exports,
        process: { env: {} },
        URL,
        require: (name) =>
          name.endsWith(".css") ? {} : mocks[name] || require(name),
      },
    );
    return exports.default;
  };
  const admin = await load("app/admin/layout.tsx")({ children: "Audit" });
  const root = load("app/layout.tsx")({ children: admin });
  renderToStaticMarkup(root);
  assert.equal(
    keepers,
    1,
    "duplicated keepers repeat auth listeners, session POSTs and router.refresh",
  );
});
