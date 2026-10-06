import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

test("manual PIX: uncertain transport retry reuses the same confirmation ID", async () => {
  const source = readFileSync(
    "components/admin-companies-dashboard.tsx",
    "utf8",
  );
  const ast = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let action;
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "confirmManualPayment"
    )
      action = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(action);
  const ids = [];
  const detail = { id: "company-a", subscription: { id: "subscription-a" } };
  const ctx = {
    detail,
    paymentBusy: false,
    selectedCompanyRef: { current: "company-a" },
    paymentLockRef: { current: false },
    paymentConfirmationRef: { current: new Map() },
    window: { confirm: () => true },
    crypto: webcrypto,
    supabase: {
      rpc: async (name, args) => {
        if (name === "admin_payment_operation") return { data: { confirmationId: "20000000-0000-4000-8000-000000000091", status: "pending" }, error: null };
        if (name === "admin_complete_payment_operation") return { data: null, error: null };
        if (name === "admin_confirm_manual_payment") {
          ids.push(args.p_confirmation_id);
          if (ids.length === 1) throw Error("Response lost after commit");
          return {
            data: { amount: 44.99, nextBillingDate: "2026-11-01" },
            error: null,
          };
        }
        return { data: detail, error: null };
      },
    },
    setPaymentBusy: () => {},
    setDetailError: () => {},
    setNotice: () => {},
    setDetail: () => {},
    refreshAdminData: async () => {},
    money: String,
    message: (e) => e.message,
  };
  vm.createContext(ctx);
  vm.runInContext(
    ts.transpileModule(action, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText,
    ctx,
  );
  await Promise.all([ctx.confirmManualPayment(), ctx.confirmManualPayment()]);
  assert.equal(ids.length, 1, "concurrent clicks dispatch only one confirmation");
  await ctx.confirmManualPayment();
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
});
