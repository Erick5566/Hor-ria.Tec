import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(await readFile("lib/csv.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports },
);
const { csvCell } = exports;

test("CSV: imported client text cannot execute formulas, including whitespace prefixes", () => {
  for (const value of [
    "=1+1",
    "+SUM(1;2)",
    "-1+1",
    "@SUM(A1)",
    " =1+1",
    "\t=1+1",
    "\r=1+1",
    "\n+1",
    "\tplain",
  ]) {
    assert.equal(csvCell(value), "\"'" + value + '"');
  }
});
test("CSV: separators, quotes, null and accents remain a single quoted cell", () => {
  assert.equal(csvCell('Reparo; "câmera"'), '"Reparo; ""câmera"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(49), '"49"');
});
