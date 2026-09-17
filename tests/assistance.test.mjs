import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("assistência: esquema aditivo, isolamento e vínculos de tenant", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;alter default privileges in schema public grant execute on functions to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  if (!(await db.query("select to_regclass('public.clientes') as t")).rows[0].t)
    await db.exec(await readFile("work/assistencia_core.sql", "utf8"));
  const a = "10000000-0000-0000-0000-000000000001",
    b = "10000000-0000-0000-0000-000000000002";
  await db.exec(`insert into auth.users values('${a}'),('${b}')`);
  const ea = (
      await db.query(
        "insert into empresas(dono_id,nome,slug) values($1,'Empresa A','a') returning id",
        [a],
      )
    ).rows[0].id,
    eb = (
      await db.query(
        "insert into empresas(dono_id,nome,slug) values($1,'Empresa B','b') returning id",
        [b],
      )
    ).rows[0].id;
  await db.query(
    "insert into empresa_membros(empresa_id,usuario_id,role) values($1,$2,'OWNER'),($3,$4,'OWNER')",
    [ea, a, eb, b],
  );
  const role = async (uid) =>
    db.exec(
      `reset role;set request.jwt.claim.sub='${uid}';set role authenticated`,
    );
  await role(a);
  const c = (
    await db.query(
      "insert into clientes(empresa_id,nome,whatsapp) values($1,'Cliente A','11999999999') returning id",
      [ea],
    )
  ).rows[0].id;
  const e = (
    await db.query(
      "insert into equipamentos(empresa_id,cliente_id,categoria,modelo) values($1,$2,'Celular','Teste') returning id",
      [ea, c],
    )
  ).rows[0].id;
  const o = (
    await db.query(
      "insert into ordens_servico(empresa_id,cliente_id,equipamento_id,problema) values($1,$2,$3,'Não carrega') returning id",
      [ea, c, e],
    )
  ).rows[0].id;
  assert.equal((await db.query("select * from historico_os")).rows.length, 1);
  await assert.rejects(
    db.query("update ordens_servico set empresa_id=$1 where id=$2", [eb, o]),
  );
  await role(b);
  assert.equal((await db.query("select * from ordens_servico")).rows.length, 0);
  assert.equal((await db.query("select * from clientes")).rows.length, 0);
  await assert.rejects(
    db.query(
      "insert into equipamentos(empresa_id,cliente_id,categoria,modelo) values($1,$2,'Celular','Invasão')",
      [eb, c],
    ),
  );
  await assert.rejects(
    db.query(
      "insert into ordens_servico(empresa_id,cliente_id,equipamento_id,problema) values($1,$2,$3,'Invasão')",
      [eb, c, e],
    ),
  );
  await db.exec("reset role;set role anon");
  for (const t of [
    "clientes",
    "equipamentos",
    "ordens_servico",
    "equipamento_segredos",
    "fotos_os",
    "historico_os",
    "orcamentos",
    "financeiro",
  ])
    await assert.rejects(db.query(`select * from ${t}`));
  await db.close();
});
