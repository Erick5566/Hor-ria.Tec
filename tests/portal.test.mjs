import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";
test("portal: solicitação, consulta restrita, fotos privadas e isolamento", async () => {
  const db = await database();
  try {
    const a = "10000000-0000-0000-0000-000000000001",
      b = "10000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${a}'),('${b}');set request.jwt.claim.sub='${a}';set role authenticated`,
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Assistência Teste','teste','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    await db.exec(`reset role;set request.jwt.claim.sub='';set role anon`);
    const result = (
      await db.query(
        `select solicitar_reparo('teste',$1,$2,'Tela quebrada') r`,
        [
          { nome: "Cliente Teste", whatsapp: "11999999999" },
          { categoria: "Celular", modelo: "Teste" },
        ],
      )
    ).rows[0].r;
    assert.ok(result.codigo);
    assert.equal(result.empresa_id, eid);
    const path = `${eid}/${result.id}/${result.upload_token}/foto.jpg`;
    await db.query(
      `insert into storage.objects(bucket_id,name) values('os-fotos',$1)`,
      [path],
    );
    await db.query(`select registrar_foto($1,'Entrada','Frente')`, [path]);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        `insert into storage.objects(bucket_id,name) values('os-fotos',$1)`,
        [`${eid}/${result.id}/invalid/foto.jpg`],
      ),
    );
    await assert.rejects(db.query("select * from ordens_servico"));
    await db.exec(
      `reset role;set request.jwt.claim.sub='${a}';set role authenticated`,
    );
    await db.query(
      `insert into diagnosticos(ordem_id,empresa_id,observacoes) values($1,$2,'SEGREDO INTERNO')`,
      [result.id, eid],
    );
    await db.query(
      `insert into equipamento_segredos(ordem_id,empresa_id,senha) values($1,$2,'SENHA PRIVADA')`,
      [result.id, eid],
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
    await db.query(`update storage.objects set name='alterado' where name=$1`, [
      path,
    ]);
    assert.equal(
      (await db.query("select name from storage.objects")).rows[0].name,
      path,
    );
    await assert.rejects(
      db.query(`delete from fotos_os where ordem_id=$1`, [result.id]),
    );
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal((await db.query("select * from fotos_os")).rows.length, 0);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await db.exec(`reset role;set request.jwt.claim.sub='';set role anon`);
    assert.equal(
      (
        await db.query(`select consultar_reparo($1,'11888888888') r`, [
          result.codigo,
        ])
      ).rows[0].r,
      null,
    );
    const view = (
      await db.query(`select consultar_reparo($1,'11999999999') r`, [
        result.codigo,
      ])
    ).rows[0].r;
    assert.equal(view.equipamento.modelo, "Teste");
    assert.ok(!JSON.stringify(view).includes("SEGREDO"));
    assert.ok(!JSON.stringify(view).includes("SENHA"));
    assert.equal(view.cliente_id, undefined);
    assert.equal(view.fotos, undefined);
  } finally {
    await db.close();
  }
});
