import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database } from "./helpers.mjs";

test("Super Admin IA: MFA, visão inicial vazia e nenhum dado financeiro criado por leitura",async()=>{
  const db=await database();
  const admin="ab000000-0000-4000-8000-000000000001";
  const normal="ab000000-0000-4000-8000-000000000002";
  const as=async(id,aal="aal1")=>db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"${aal}"}';set role authenticated`
  );
  try{
    await db.exec(`insert into auth.users(id) values ('${admin}'),('${normal}')`);
    await as(normal);
    await assert.rejects(db.query("select admin_ai_overview()"),/admin|permissão|Super/i);
    await as(admin);
    await db.exec("reset role");
    await db.query("update public.perfis set platform_role='SUPER_ADMIN' where usuario_id=$1",[admin]);
    await as(admin);
    await assert.rejects(db.query("select admin_ai_overview()"),/Verificação em duas etapas|MFA/i);
    await as(admin,"aal2");
    const snapshot=(await db.query("select admin_ai_overview() as data")).rows[0].data;
    assert.equal(snapshot.summary.availableUnits,0);
    assert.equal(snapshot.summary.consumedUnits,0);
    assert.equal(snapshot.summary.pendingCount,0);
    assert.equal(snapshot.summary.requiresReview,0);
    assert.equal(snapshot.companies.length,0);
    assert.equal(snapshot.pending.length,0);
    await db.exec("reset role");
    const counts=(await db.query(`select
      (select count(*)::int from private.ai_credit_wallets) wallets,
      (select count(*)::int from private.ai_message_reservations) reservations,
      (select count(*)::int from private.ai_credit_topups) topups`)).rows[0];
    assert.deepEqual([counts.wallets,counts.reservations,counts.topups],[0,0,0]);
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select admin_ai_overview()"),/permission denied/i);
  }finally{await db.close();}
});

test("Super Admin IA: dados agregados multiempresa sem expor conteúdo de conversas",async()=>{
 const db=await database();
 const owner="ab000000-0000-4000-8000-000000000011";
 const secondOwner="ab000000-0000-4000-8000-000000000012";
 const as=async(id=owner,aal="aal2")=>db.exec(
   `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"${aal}"}';set role authenticated`
 );
 try{
  await db.exec(`insert into auth.users(id) values ('${owner}'),('${secondOwner}');`);
  await as();
  const one=(await db.query(
    "select configurar_empresa('Reparos Azul','reparos-azul-ia','{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') as id"
  )).rows[0].id;
  await as(secondOwner);
  const two=(await db.query(
    "select configurar_empresa('Reparos Verde','reparos-verde-ia','{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') as id"
  )).rows[0].id;
  await db.exec("reset role");
  await db.query("update public.perfis set platform_role='SUPER_ADMIN' where usuario_id=$1",[owner]);
  await as(owner);
  await db.query("select admin_add_ai_credits($1,3,'comprovante-azul-001')",[one]);
  await db.query("select admin_add_ai_credits($1,2,'comprovante-verde-002')",[two]);

  await db.exec("reset role;set role service_role");
  const id=(await db.query("select ai_reserve_message($1,$2,'web') as id",[one,owner])).rows[0].id;
  assert.ok(id);
  assert.equal((await db.query("select ai_mark_provider_started($1,$2,$3) as result",[id,one,owner])).rows[0].result,true);
  await as();
  const report=(await db.query("select admin_ai_overview() as data")).rows[0].data;
  assert.equal(report.summary.companiesWithWallet,2);
  assert.equal(report.summary.availableUnits,4);
  assert.equal(report.summary.topUpUnits,5);
  assert.equal(report.summary.pendingCount,1);
  assert.equal(report.summary.requiresReview,0);
  assert.equal(report.companies.length,2);
  assert.equal(report.pending.length,1);
  assert.equal(report.pending[0].companyId,one);
  assert.equal(report.pending[0].reviewState,"PROVIDER_STARTED");
  assert.ok(report.companies.some(c=>c.id===one&&c.pendingCount===1&&c.availableUnits===2));
  assert.ok(report.companies.some(c=>c.id===two&&c.pendingCount===0&&c.availableUnits===2));
  assert.doesNotMatch(JSON.stringify(report),/comprovante-|@|token|api.key|documento/i);

  await db.exec("reset role");
  await db.query("update private.ai_message_reservations set reserved_at=now()-interval '15 minutes' where id=$1",[id]);
  await as();
  const aged=(await db.query("select admin_ai_overview() as data")).rows[0].data;
  assert.equal(aged.summary.requiresReview,1);
  assert.equal(aged.pending[0].reviewState,"PROVIDER_STARTED");
 }finally{await db.close();}
});

test("Painel administrativo da IA é leitura restrita, sem recarga ou saída para a API",()=>{
 const page=readFileSync("app/admin/ia/page.tsx","utf8");
 const ui=readFileSync("components/admin-ai-operations.tsx","utf8");
 const sql=readFileSync("supabase/migrations/20261012163000_admin_ai_readonly_overview.sql","utf8");
 const nav=readFileSync("app/admin/layout.tsx","utf8");
 assert.match(page,/getServerAccess\(\)/);
 assert.match(page,/isSuperAdmin/);
 assert.match(page,/aal!=="aal2"/);
 assert.match(page,/admin_ai_overview/);
 assert.match(sql,/perform private.require_super_admin\(\)/);
 assert.match(sql,/auth.jwt\(\)->>'aal'/);
 assert.match(sql,/revoke all on function public.admin_ai_overview\(\) from public,anon/);
 assert.match(sql,/grant execute on function public.admin_ai_overview\(\) to authenticated/);
 assert.match(sql,/from private.ai_credit_wallets/);
 assert.match(sql,/from private.ai_message_reservations/);
 assert.doesNotMatch(sql,/insert into|update private|delete from|call .*payment/);
 assert.doesNotMatch(ui,/admin_add_ai_credits|ai_finalize_message|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(nav,/href="\/admin\/ia"/);
});
