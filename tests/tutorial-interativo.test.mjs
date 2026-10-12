import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { database } from "./helpers.mjs";

const userId = (n) => `94000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("tutorial: only newly registered accounts are automatically eligible", async () => {
  const db = await database();
  try {
    const first = userId(1), second = userId(2);
    await db.exec(`insert into auth.users(id) values ('${first}'),('${second}')`);
    const rows = await db.query("select usuario_id,status,passo from public.tutorial_progresso order by usuario_id");
    assert.equal(rows.rows.length, 2);
    assert.deepEqual(rows.rows.map(x=>x.status), ["pending","pending"]);
    await db.exec(`set request.jwt.claim.sub='${first}';set role authenticated`);
    const initial = (await db.query("select consultar_tutorial() value")).rows[0].value;
    assert.equal(initial.automatico, true);
    assert.equal(initial.status, "pending");
    await db.query("select atualizar_tutorial('active',7)");
    assert.equal((await db.query("select consultar_tutorial() value")).rows[0].value.passo,7);
    await db.exec(`reset role;set request.jwt.claim.sub='${second}';set role authenticated`);
    assert.equal((await db.query("select consultar_tutorial() value")).rows[0].value.passo,0);
    await assert.rejects(db.query("select atualizar_tutorial('active',501)"),/inválido/);
    await assert.rejects(db.query("select atualizar_tutorial('random',1)"),/inválido/);
    await db.query("select atualizar_tutorial('done',9)");
    assert.equal((await db.query("select consultar_tutorial() value")).rows[0].value.status,"done");
    await db.exec("reset role");
    await db.query("delete from public.tutorial_progresso where usuario_id=$1",[first]);
    await db.exec(`set request.jwt.claim.sub='${first}';set role authenticated`);
    const legacy = (await db.query("select consultar_tutorial() value")).rows[0].value;
    assert.equal(legacy.automatico,false);
    assert.equal(legacy.status,"none");
    await db.query("select atualizar_tutorial('active',0)");
    assert.equal((await db.query("select consultar_tutorial() value")).rows[0].value.status,"active");
  } finally { await db.close(); }
});

test("tutorial: never grants anonymous access or direct authenticated write to progress", async () => {
  const db = await database();
  try {
    const rules = await db.query(`select
      has_function_privilege('anon','public.consultar_tutorial()','EXECUTE') as anon_read,
      has_function_privilege('anon','public.atualizar_tutorial(text,integer)','EXECUTE') as anon_write,
      has_table_privilege('authenticated','public.tutorial_progresso','UPDATE') as direct_update,
      (select relrowsecurity from pg_class where oid='public.tutorial_progresso'::regclass) as rls_enabled`);
    assert.deepEqual(rules.rows[0],{anon_read:false,anon_write:false,direct_update:false,rls_enabled:true});
  } finally { await db.close(); }
});

function loadSteps() {
  const exports = {};
  const require = createRequire(import.meta.url);
  vm.runInNewContext(
    ts.transpileModule(readFileSync("lib/tutorial-steps.ts","utf8"),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText,
    {exports, require:(path)=>path==="@/lib/platform-features"?{panelPathEnabled:()=>true}:require(path)},
  );
  return exports.buildTutorialSteps;
}
test("tutorial: operational users do not receive financial, inventory or team steps", () => {
  const build = loadSteps();
  const routes = new Set(["/painel","/painel/clientes","/painel/ordens/nova","/painel/equipe","/painel/financeiro","/painel/estoque"]);
  const flags = {stockEnabled:true,financialEnabled:true,appointmentsEnabled:true};
  const operational = Array.from(build({company:{role:"TECHNICIAN",featureFlags:flags}},routes));
  const keys=operational.map(x=>x.key);
  assert.ok(keys.includes("/painel/ordens/nova:problem"));
  assert.ok(keys.includes("/painel/clientes:name"));
  assert.ok(!keys.some(k=>/financeiro|estoque|equipe/.test(k)));
  const owner = Array.from(build({company:{role:"OWNER",featureFlags:flags}},routes));
  assert.ok(owner.some(x=>x.key==="/painel/financeiro:explain"));
  assert.ok(owner.some(x=>x.key==="/painel/equipe:invite"));
  assert.ok(owner.some(x=>x.key==="/painel/estoque:open"));
  assert.equal(owner.at(0).kind,"welcome");
  assert.equal(owner.at(-1).kind,"finish");
});
