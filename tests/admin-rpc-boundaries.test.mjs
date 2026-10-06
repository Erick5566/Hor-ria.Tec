import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("security: every public admin RPC rejects ordinary users and admin without MFA", async () => {
  const db = await database();
  try {
    const user = "10000000-0000-4000-8000-000000000201";
    await db.exec(
      `insert into auth.users values('${user}');set request.jwt.claim.sub='${user}';set request.jwt.claims='{"aal":"aal1"}'`,
    );
    const functions = (
      await db.query(`select p.proname,oidvectortypes(p.proargtypes) as types
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'admin\\_%' escape '\\' order by p.proname`)
    ).rows;
    assert.ok(functions.length >= 14);
    const call = (f) =>
      `select public.${f.proname}(${
        f.types
          ? f.types
              .split(",")
              .map((type) => `null::${type.trim()}`)
              .join(",")
          : ""
      })`;
    await db.exec("set role authenticated");
    for (const f of functions)
      await assert.rejects(
        db.query(call(f)),
        /Acesso administrativo negado|permission denied/,
        f.proname,
      );
    await db.exec(
      `reset role;update perfis set platform_role='SUPER_ADMIN' where usuario_id='${user}';set role authenticated`,
    );
    for (const f of functions)
      await assert.rejects(
        db.query(call(f)),
        /Verificação em duas etapas necessária|permission denied/,
        f.proname,
      );
    await db.exec("reset role;set role anon");
    for (const f of functions)
      await assert.rejects(db.query(call(f)), /permission denied/, f.proname);
  } finally {
    await db.close();
  }
});

test("security: deny-by-grants tables expose no CRUD to anon or authenticated", async () => {
  const db = await database();
  try {
    for (const table of [
      "public.admin_email_notifications",
      "public.admin_audit_logs",
      "public.configuracoes_plataforma",
      "public.pagamentos",
      "public.eventos_webhook",
      "public.booking_rate_limits",
      "public.public_action_rate_limits",
      "private.upload_tickets",
      "private.platform_expenses",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const row = (
          await db.query(
            "select has_table_privilege($1,$2,'SELECT') s,has_table_privilege($1,$2,'INSERT') i,has_table_privilege($1,$2,'UPDATE') u,has_table_privilege($1,$2,'DELETE') d",
            [role, table],
          )
        ).rows[0];
        assert.deepEqual(
          Object.values(row),
          [false, false, false, false],
          `${role} ${table}`,
        );
      }
    }
  } finally {
    await db.close();
  }
});
