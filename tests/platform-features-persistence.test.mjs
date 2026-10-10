import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './helpers.mjs';

test('global modules: MFA admin saves new flags and the owner receives them in access_context',async()=>{
 const db=await database();
 try {
  const admin='71000000-0000-4000-8000-000000000001';
  const owner='71000000-0000-4000-8000-000000000002';
  await db.exec(`insert into auth.users values('${admin}'),('${owner}');update perfis set platform_role='SUPER_ADMIN' where usuario_id='${admin}';set request.jwt.claim.sub='${owner}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`);
  await db.query(`select configurar_empresa('Teste recursos','teste-recursos','{}',false,'[{"nome":"Diagnóstico","duracao":30}]')`);
  const changes={featureFlags:{ordersEnabled:false,customersEnabled:false,invoicesEnabled:false,financialEnabled:true,appointmentsEnabled:true,stockEnabled:true,aiEnabled:false,whatsappEnabled:false}};
  await assert.rejects(db.query('select admin_update_platform($1::jsonb)',[JSON.stringify(changes)]),/administrativo negado/);
  await db.exec(`reset role;set request.jwt.claim.sub='${admin}';set role authenticated`);
  await assert.rejects(db.query('select admin_update_platform($1::jsonb)',[JSON.stringify(changes)]),/duas etapas/);
  await db.exec(`set request.jwt.claims='{"aal":"aal2"}'`);
  await db.query('select admin_update_platform($1::jsonb,$2)',[JSON.stringify(changes),'Teste local de recursos globais']);
  const overview=(await db.query('select admin_platform_overview() as data')).rows[0].data;
  assert.equal(overview.featureFlags.ordersEnabled,false);
  await db.exec(`reset role;set request.jwt.claim.sub='${owner}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`);
  const context=(await db.query('select access_context() as data')).rows[0].data;
  assert.equal(context.company.featureFlags.ordersEnabled,false);
  assert.equal(context.company.featureFlags.customersEnabled,false);
  assert.equal(context.company.featureFlags.invoicesEnabled,false);
  assert.equal(context.company.featureFlags.financialEnabled,true);
 } finally {await db.close();}
});
