import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
function chart() {
  let selected = null;
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("components/financial-chart.tsx", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Intl,
      Date,
      require: (name) =>
        name === "react"
          ? {
              ...React,
              useId: () => "chart-test",
              useState: () => [
                selected,
                (value) => {
                  selected = value;
                },
              ],
            }
          : name === "@/lib/assistencia"
            ? { money }
            : require(name),
    },
  );
  return exports.FinancialChart;
}
const data = [
  { key: "2026-10-01", revenue: 100, expense: 40 },
  { key: "2026-10-02", revenue: 0, expense: 75 },
  { key: "2026-10-03", revenue: 200, expense: 50 },
];
function find(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  return React.Children.toArray(node.props.children)
    .map((child) => find(child, predicate))
    .find(Boolean);
}
test("finance chart: date selection exposes exact amounts and survives period changes", () => {
  const Chart = chart();
  let tree = Chart({ data });
  const slider = find(tree, (node) => node.type === "input");
  slider.props.onChange({ target: { value: "1" } });
  tree = Chart({ data });
  const picker = find(tree, (node) => node.type === "input");
  assert.match(picker.props["aria-valuetext"], /02\/10/);
  assert.ok(picker.props["aria-valuetext"].includes(money(75)));
  const values = find(tree, (node) => node.type === "dl");
  assert.ok(renderToStaticMarkup(values).includes(money(-75)));
  tree = Chart({ data: [data[0]] });
  assert.equal(find(tree, (node) => node.type === "input").props.value, 0);
  assert.doesNotMatch(renderToStaticMarkup(tree), /NaN|Infinity/);
});
test("finance chart: pointer extremes stay in range and table preserves each day", () => {
  const Chart = chart();
  for (const [clientX, expected] of [
    [-20, 0],
    [1000, 2],
  ]) {
    const svg = find(Chart({ data }), (node) => node.type === "svg");
    svg.props.onPointerDown({
      clientX,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 660 }) },
    });
    assert.equal(
      find(Chart({ data }), (node) => node.type === "input").props.value,
      expected,
    );
  }
  const html = renderToStaticMarkup(Chart({ data, variant: "bar" }));
  for (const value of data) assert.ok(html.includes(money(value.revenue)));
  assert.equal((html.match(/<rect /g) || []).length, 6);
});
test("finance chart: loading and empty periods do not show fabricated chart values", () => {
  const Chart = chart();
  const loading = renderToStaticMarkup(Chart({ data, loading: true }));
  assert.match(loading, /Carregando/);
  assert.doesNotMatch(loading, /<svg|<input/);
  const empty = renderToStaticMarkup(Chart({ data: [] }));
  assert.match(empty, /Nenhuma movimentação/);
  assert.doesNotMatch(empty, /<svg|<input/);
});
