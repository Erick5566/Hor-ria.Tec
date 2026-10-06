import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
test("correções: RLS, grants e SECURITY DEFINER fechados no schema private", async () => {
  const db = await database();
  try {
    const tables = (
      await db.query(
        "select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_crud,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') auth_crud from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('admin_payment_confirmation_operations','os_photo_corrections')",
      )
    ).rows;
    assert.equal(tables.length, 2);
    for (const table of tables) {
      assert.equal(table.relrowsecurity, true);
      assert.equal(table.anon_crud, false);
      assert.equal(table.auth_crud, false);
    }
    const functions = (
      await db.query(
        "select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_payment_operation','admin_complete_payment_operation','prepare_os_photo_correction','apply_os_photo_correction','cancel_os_photo_correction','pending_os_photo_cleanup','complete_os_photo_cleanup')",
      )
    ).rows;
    assert.equal(functions.length, 7);
    for (const fn of functions) {
      assert.equal(fn.prosecdef, true);
      assert.deepEqual(fn.proconfig, ['search_path=""']);
      assert.equal(fn.anon_execute, false);
    }
    const indexes = (
      await db.query(
        "select indexdef from pg_indexes where schemaname='private' and indexname in ('admin_payment_one_unresolved','photo_one_pending_correction')",
      )
    ).rows;
    assert.equal(indexes.length, 2);
    for (const index of indexes) assert.match(index.indexdef, /UNIQUE.*WHERE/);
  } finally {
    await db.close();
  }
});
test("fotos corrigidas: carregamento real da galeria solicita URLs assinadas, TTL 3600 e caminho novo", async () => {
  const ast = ts.createSourceFile(
    "photos.tsx",
    readFileSync("components/photos.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let action;
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText(ast) === "load" &&
      ts.isCallExpression(n.initializer)
    )
      action = "this.load = " + n.initializer.arguments[0].getText(ast);
    ts.forEachChild(n, visit);
  };
  visit(ast);
  assert.ok(action);
  const row = {
    id: "photo",
    caminho: "tenant/order/equipe/new.jpg",
    categoria: "Entrada",
    descricao: "Ângulo: Frente",
  };
  let visible;
  const ctx = {
    ordemId: "order",
    setPhotos: (rows) => {
      visible = rows;
    },
    setError: (e) => {
      throw Error(e);
    },
    message: (e) => e.message,
    supabase: {
      from: (table) => {
        assert.equal(table, "fotos_os");
        return {
          select: () => ({
            eq: (column, value) => {
              assert.equal(column, "ordem_id");
              assert.equal(value, "order");
              return { order: async () => ({ data: [row], error: null }) };
            },
          }),
        };
      },
      storage: {
        from: (bucket) => {
          assert.equal(bucket, "os-fotos");
          return {
            createSignedUrls: async (paths, ttl) => {
              assert.deepEqual(Array.from(paths), [row.caminho]);
              assert.equal(ttl, 3600);
              return {
                data: [
                  {
                    path: row.caminho,
                    signedUrl:
                      "https://storage.invalid/object/sign/os-fotos/" +
                      row.caminho,
                  },
                ],
                error: null,
              };
            },
          };
        },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(
    ts.transpileModule(action, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    ctx,
  );
  await ctx.load();
  assert.equal(visible[0].caminho, row.caminho);
  assert.ok(visible[0].signed.includes("/object/sign/"));
  assert.ok(!visible[0].signed.includes("/object/public/"));
});
