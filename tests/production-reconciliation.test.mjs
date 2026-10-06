import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database} from './helpers.mjs';

test('production reconciliation: repairs live RLS/FK drift without granting client access',async()=>{
  const db=await database();
  try {
    await db.exec('alter table private.platform_expenses disable row level security; alter table private.platform_expenses drop constraint platform_expenses_created_by_fkey');
    const sql=await readFile('supabase/migrations/20261006004520_reconcile_production_platform_expenses.sql','utf8');
    await db.exec(sql);
    await db.exec(sql);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.platform_expenses'::regclass")).rows[0].relrowsecurity,true);
    assert.equal((await db.query("select convalidated from pg_constraint where conrelid='private.platform_expenses'::regclass and contype='f'")).rows[0].convalidated,true);
    for(const role of ['anon','authenticated'])for(const operation of ['SELECT','INSERT','UPDATE','DELETE'])
      assert.equal((await db.query(`select has_table_privilege('${role}','private.platform_expenses','${operation}') as allowed`)).rows[0].allowed,false);
    assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='private' and tablename='platform_expenses'")).rows[0].n,0);
  } finally {await db.close();}
});
