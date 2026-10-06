import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function functionSource(path, name) {
  const ast = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let source;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      source = node.getText(ast).replace(/^export /, "");
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(source);
  return source;
}

test("platform expense uses the São Paulo date after UTC midnight", async () => {
  const instant = "2026-10-06T01:30:00Z";
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [instant]));
    }
    static now() {
      return new Date(instant).getTime();
    }
  }
  let captured;
  const ctx = {
    Date: Clock,
    Intl,
    expenseAmount: "80",
    expenseDescription: "Audit",
    expenseCategory: "outros",
    expenseRecurring: false,
    supabase: {
      rpc: async (_name, args) => {
        captured = args;
        return { data: {}, error: null };
      },
    },
    setExpenseBusy: () => {},
    setError: () => {},
    setNotice: () => {},
    setExpenseDescription: () => {},
    setExpenseAmount: () => {},
    setExpenseRecurring: () => {},
    refreshAdminData: async () => {},
    message: (e) => e.message,
  };
  vm.createContext(ctx);
  const code =
    functionSource("lib/supabase.ts", "today") +
    "\n" +
    functionSource(
      "components/admin-companies-dashboard.tsx",
      "addPlatformExpense",
    );
  vm.runInContext(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText,
    ctx,
  );
  await ctx.addPlatformExpense();
  assert.equal(captured.p_incurred_on, "2026-10-05");
});
