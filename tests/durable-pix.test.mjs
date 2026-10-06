import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { database } from "./helpers.mjs";

const admin = "91000000-0000-4000-8000-000000000001",
  other = "91000000-0000-4000-8000-000000000002";
function frontend(rpc) {
  const ast = ts.createSourceFile(
    "admin.tsx",
    readFileSync("components/admin-companies-dashboard.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let action;
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "confirmManualPayment")
      action = n.getText(ast);
    ts.forEachChild(n, visit);
  };
  visit(ast);
  const ctx = {
    detail: { id: null, subscription: { id: "s" } },
    paymentBusy: false,
    paymentLockRef: { current: false },
    paymentConfirmationRef: { current: new Map() },
    selectedCompanyRef: { current: null },
    window: { confirm: () => true },
    supabase: { rpc },
    setPaymentBusy: () => {},
    setDetailError: (e) => {
      ctx.error = e;
    },
    setNotice: () => {},
    setDetail: () => {},
    refreshAdminData: async () => {},
    money: String,
    message: (e) => e.message,
  };
  vm.createContext(ctx);
  vm.runInContext(
    ts.transpileModule(action, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    ctx,
  );
  return ctx;
}

test("PIX durável: RPC real + handler sobrevivem às fronteiras de transporte e sessão", async (t) => {
  const db = await database();
  try {
    await db.exec(
      `insert into auth.users values('${admin}'),('${other}');update perfis set platform_role='SUPER_ADMIN' where usuario_id='${admin}';set request.jwt.claim.sub='${admin}';set request.jwt.claims='{"aal":"aal2"}';set role authenticated;`,
    );
    const create = async (slug) =>
      (
        await db.query(
          'select configurar_empresa($1,$1,\'{}\',false,\'[{"nome":"Reparo","duracao":30}]\') id',
          [slug],
        )
      ).rows[0].id;
    const company = await create("durable-pix-a");
    await db.exec(
      `reset role;set request.jwt.claim.sub='${other}';set role authenticated;`,
    );
    const companyB = await create("durable-pix-b");
    await db.exec(
      `reset role;set request.jwt.claim.sub='${admin}';set role authenticated;`,
    );
    const begin = async (previous = null, target = company) =>
      (
        await db.query("select admin_payment_operation($1,$2) r", [
          target,
          previous,
        ])
      ).rows[0].r;
    const confirm = async (id, target = company) =>
      (
        await db.query(
          "select admin_confirm_manual_payment($1,$2,'TESTE ISOLADO') r",
          [target, id],
        )
      ).rows[0].r;
    const complete = async (id, target = company) =>
      db.query("select admin_complete_payment_operation($1,$2)", [target, id]);
    const count = async () => {
      await db.exec("reset role");
      try {
        return Number(
          (
            await db.query(
              "select count(*) n from pagamentos where empresa_id=$1",
              [company],
            )
          ).rows[0].n,
        );
      } finally {
        await db.exec("set role authenticated");
      }
    };
    let fail = "before",
      ids = [];
    const rpc = async (name, args) => {
      if (name === "admin_payment_operation")
        return {
          data: await begin(args.p_previous_confirmation_id, args.p_empresa),
          error: null,
        };
      if (name === "admin_company_detail")
        return {
          data: { id: company, subscription: { id: "s" } },
          error: null,
        };
      if (name === "admin_complete_payment_operation") {
        if (fail === "complete-before") {
          fail = "";
          throw Error("completion failed before commit");
        }
        await complete(args.p_confirmation_id, args.p_empresa);
        if (fail === "complete-after") {
          fail = "";
          throw Error("completion response lost after commit");
        }
        return { data: null, error: null };
      }
      ids.push(args.p_confirmation_id);
      if (fail === "before") {
        fail = "";
        throw Error("HTTP failure before commit");
      }
      const payment = await confirm(args.p_confirmation_id, args.p_empresa);
      if (fail === "after") {
        fail = "";
        throw Error("Response lost after commit");
      }
      return { data: payment, error: null };
    };
    let ctx = frontend(rpc);
    ctx.detail.id = company;
    ctx.selectedCompanyRef.current = company;
    await t.test(
      "falha antes do commit conserva operação; cliques simultâneos enviam uma confirmação",
      async () => {
        await Promise.all([
          ctx.confirmManualPayment(),
          ctx.confirmManualPayment(),
        ]);
        assert.equal(ids.length, 1);
        assert.equal(await count(), 0);
      },
    );
    const x = ids[0];
    await t.test(
      "retry na mesma montagem usa X; perda após commit cria apenas um pagamento",
      async () => {
        fail = "after";
        await ctx.confirmManualPayment();
        assert.equal(ids[1], x);
        assert.equal(await count(), 1);
      },
    );
    await t.test(
      "reload/desmontagem recupera X do backend, sem cache",
      async () => {
        ctx = frontend(rpc);
        ctx.detail.id = company;
        fail = "after";
        await ctx.confirmManualPayment();
        assert.equal(ids.at(-1), x);
        assert.equal(await count(), 1);
      },
    );
    await t.test(
      "logout/login, nova aba e nova sessão recuperam X",
      async () => {
        await db.exec(
          "reset role;set request.jwt.claim.sub='';set request.jwt.claims='{}';",
        );
        await db.exec(
          `set request.jwt.claim.sub='${admin}';set request.jwt.claims='{"aal":"aal2"}';set role authenticated;`,
        );
        ctx = frontend(rpc);
        ctx.detail.id = company;
        fail = "complete-before";
        await ctx.confirmManualPayment();
        assert.equal(ids.at(-1), x);
        assert.equal(await count(), 1);
      },
    );
    await t.test("falha ao marcar completed mantém X", async () => {
      assert.equal((await begin()).confirmationId, x);
      assert.equal((await begin()).status, "pending");
    });
    await t.test(
      "resposta de completed perdida também é reconciliada sem novo pagamento",
      async () => {
        fail = "complete-after";
        await ctx.confirmManualPayment();
        const attempts = ids.length;
        ctx = frontend(rpc);
        ctx.detail.id = company;
        await ctx.confirmManualPayment();
        assert.equal(ids.length, attempts);
        assert.equal(await count(), 1);
        assert.equal((await begin()).confirmationId, x);
      },
    );
    await t.test(
      "refresh depois do sucesso recupera completed X e não cria mensalidade",
      async () => {
        const fresh = frontend(rpc);
        fresh.detail.id = company;
        await fresh.confirmManualPayment();
        assert.equal(await count(), 1);
        assert.equal((await begin()).status, "completed");
      },
    );
    let y;
    await t.test(
      "novo pagamento legítimo após confirmação explícita gera Y distinto de X",
      async () => {
        await ctx.confirmManualPayment();
        y = ids.at(-1);
        assert.notEqual(y, x);
        assert.equal(await count(), 2);
        assert.equal((await begin()).confirmationId, y);
      },
    );
    await t.test(
      "requisições concorrentes recuperam uma operação pendente",
      async () => {
        const ops = await Promise.all([
          begin(null, companyB),
          begin(null, companyB),
          begin(null, companyB),
        ]);
        assert.equal(new Set(ops.map((o) => o.confirmationId)).size, 1);
      },
    );
    await t.test(
      "operação e confirmação de conclusão isoladas por empresa",
      async () => {
        assert.notEqual((await begin(null, companyB)).confirmationId, y);
        await assert.rejects(complete(y, companyB), /não reconciliado/);
        await assert.rejects(confirm(y, companyB), /outra empresa/);
      },
    );
    await t.test(
      "usuário comum bloqueado e tabela sem CRUD direto",
      async () => {
        await db.exec(
          `reset role;set request.jwt.claim.sub='${other}';set role authenticated;`,
        );
        await assert.rejects(begin(), /administrativo negado/);
        await assert.rejects(complete(x), /administrativo negado/);
        await assert.rejects(
          db.query(
            "select * from private.admin_payment_confirmation_operations",
          ),
          /permission denied/,
        );
      },
    );
    await t.test("Super Admin sem aal2 bloqueado", async () => {
      await db.exec(
        `reset role;set request.jwt.claim.sub='${admin}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated;`,
      );
      await assert.rejects(begin(), /duas etapas/);
      await assert.rejects(complete(x), /duas etapas/);
    });
    await t.test("Super Admin aal2 permitido; anon sem EXECUTE", async () => {
      await db.exec(
        'reset role;set request.jwt.claims=\'{"aal":"aal2"}\';set role authenticated;',
      );
      assert.equal((await begin()).confirmationId, y);
      await db.exec("reset role;set role anon");
      await assert.rejects(begin(), /permission denied/);
    });
  } finally {
    await db.close();
  }
});
