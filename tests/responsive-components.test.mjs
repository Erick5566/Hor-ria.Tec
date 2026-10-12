import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(file, react = React) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => (name === "react" ? react : require(name)),
  });
  return exports.default;
}

test("responsive table associates every value with its dynamic heading, including fragments", () => {
  const Table = load("components/responsive-table.tsx");
  const cell = React.createElement("td", null, "Cliente completo");
  const html = renderToStaticMarkup(
    React.createElement(
      Table,
      null,
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          null,
          ["Cliente", "Telefone", "Ações"].map((label) =>
            React.createElement("th", { key: label }, label),
          ),
        ),
      ),
      React.createElement(
        "tbody",
        null,
        React.createElement(
          "tr",
          null,
          cell,
          React.createElement(
            React.Fragment,
            null,
            React.createElement("td", null, "+55 (85) 99999-9999"),
            React.createElement("td", null, "Abrir"),
          ),
        ),
      ),
    ),
  );
  for (const label of ["Cliente", "Telefone", "Ações"])
    assert.ok(html.includes(`data-label="${label}"`));
  assert.equal((html.match(/role="cell"/g) || []).length, 3);
  assert.match(html, /role="table"/);
  assert.equal(
    cell.props["data-label"],
    undefined,
    "the input element must remain unchanged",
  );
});

test("responsive table preserves spanning empty states and interactive controls", () => {
  const Table = load("components/responsive-table.tsx");
  const action = () => {};
  const button = React.createElement("button", { onClick: action }, "Editar");
  const result = Table({
    children: [
      React.createElement(
        "thead",
        { key: "head" },
        React.createElement(
          "tr",
          null,
          React.createElement("th", null, "Ações"),
        ),
      ),
      React.createElement(
        "tbody",
        { key: "body" },
        React.createElement(
          "tr",
          null,
          React.createElement("td", { colSpan: 3 }, button),
        ),
      ),
    ],
  });
  const html = renderToStaticMarkup(result);
  assert.match(html, /colSpan="3"/i);
  assert.doesNotMatch(html, /data-label=/);
  function find(node) {
    if (!React.isValidElement(node)) return null;
    if (node.type === "button") return node;
    return React.Children.toArray(node.props.children).map(find).find(Boolean);
  }
  assert.equal(find(result).props.onClick, action);
});

test("admin hamburger opens, closes with Escape and closes after selecting a destination", () => {
  let state = false;
  const Menu = load("components/admin-navigation.tsx", {
    ...React,
    useState: () => [
      state,
      (value) => {
        state = typeof value === "function" ? value(state) : value;
      },
    ],
  });
  const render = () =>
    Menu({
      children: React.createElement("a", { href: "/admin" }, "Empresas"),
    });
  let tree = render();
  assert.equal(tree.props.children[0].props["aria-expanded"], false);
  tree.props.children[0].props.onClick();
  tree = render();
  assert.equal(tree.props.children[0].props["aria-expanded"], true);
  tree.props.onKeyDown({ key: "Escape" });
  assert.equal(state, false);
  tree.props.children[0].props.onClick();
  tree = render();
  tree.props.children[1].props.onClick({ target: { closest: () => ({}) } });
  assert.equal(state, false);
});

test("notifications can close independently of the covered bell and restore focus", () => {
  let stateIndex = 0;
  const changes = [];
  let focused = false;
  const exports = {};
  const react = {
    ...React,
    useState: (initial) => {
      const index = stateIndex++;
      const value =
        index === 12
          ? true
          : typeof initial === "function"
            ? initial()
            : initial;
      return [value, (next) => changes.push({ index, next })];
    },
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
  };
  const mocks = {
    react,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { __esModule: true, default: () => null },
    "next/image": { __esModule: true, default: () => null },
    "next/dynamic": { __esModule: true, default: () => () => null },
    "next/navigation": { usePathname: () => "/painel", useRouter: () => ({}) },
    "@/lib/supabase": { configured: true, supabase: null },
    "@/lib/platform-features": { panelPathEnabled: () => true },
    "./panel-feature-gate": { FeatureUnavailable: () => null },
    "./interactive-tutorial": { __esModule: true, default: () => null },
    "./brand": { Brand: () => null },
    "./horaria-icon": { HorariaIcon: () => null },
  };
  vm.runInNewContext(
    ts.transpileModule(readFileSync("components/workspace.tsx", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (!Object.hasOwn(mocks, name))
          throw new Error(`Unexpected dependency: ${name}`);
        return mocks[name];
      },
    },
  );
  const tree = exports.default({
    children: null,
    initialAccess: {
      company: { role: "OWNER", featureFlags: { appointmentsEnabled: true } },
    },
    initialEmpresa: { id: "fixture", nome: "Assistência" },
    initialUserId: "fixture",
    initialEmail: "teste@example.invalid",
  });
  function find(node) {
    if (!React.isValidElement(node)) return null;
    if (node.props["aria-label"] === "Fechar notificações") return node;
    return React.Children.toArray(node.props.children).map(find).find(Boolean);
  }
  const close = find(tree);
  assert.ok(
    close,
    "a touch-accessible close control must be available inside the popover",
  );
  assert.equal(close.props.type, "button");
  close.props.onClick({
    currentTarget: {
      closest: () => ({
        querySelector: () => ({
          focus: () => {
            focused = true;
          },
        }),
      }),
    },
  });
  assert.ok(
    changes.some((change) => change.index === 12 && change.next === false),
  );
  assert.equal(focused, true);
});
