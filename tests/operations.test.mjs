import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";
test("operação: estoque atômico, fotos obrigatórias e aprovação antes do reparo", async () => {
  const db = await database();
  try {
    const uid = "10000000-0000-0000-0000-000000000001";
    await db.exec(
      `insert into auth.users values('${uid}');set request.jwt.claim.sub='${uid}';set role authenticated`,
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Teste','teste','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    const oid = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        eid,
        { nome: "Teste", whatsapp: "11999999999" },
        { categoria: "Notebook", modelo: "Teste" },
        { problema: "Não liga" },
      ])
    ).rows[0].id;
    await db.query("update empresas set fotos_obrigatorias=true where id=$1", [
      eid,
    ]);
    await assert.rejects(db.query("select confirmar_entrada($1)", [oid]));
    const path = `${eid}/${oid}/equipe/foto.jpg`;
    await db.query(
      `insert into storage.objects(bucket_id,name) values('os-fotos',$1)`,
      [path],
    );
    const fid = (
      await db.query(`select registrar_foto($1,'Entrada',null) id`, [path])
    ).rows[0].id;
    assert.equal(
      (await db.query(`select registrar_foto($1,'Entrada',null) id`, [path]))
        .rows[0].id,
      fid,
    );
    await db.query("select confirmar_entrada($1)", [oid]);
    const pid = (
      await db.query(
        `insert into pecas(empresa_id,nome,quantidade) values($1,'Tela',2) returning id`,
        [eid],
      )
    ).rows[0].id;
    await db.query("select aplicar_peca($1,$2,1)", [oid, pid]);
    assert.equal(
      (await db.query("select quantidade from pecas where id=$1", [pid]))
        .rows[0].quantidade,
      1,
    );
    await assert.rejects(db.query("select aplicar_peca($1,$2,2)", [oid, pid]));
    assert.equal(
      (await db.query("select quantidade from pecas where id=$1", [pid]))
        .rows[0].quantidade,
      1,
    );
    assert.equal(
      (
        await db.query("select * from movimentos_estoque where ordem_id=$1", [
          oid,
        ])
      ).rows.length,
      1,
    );
    const qid = (
      await db.query(
        `select salvar_orcamento($1,'[]','[]',100,0,current_date+7) id`,
        [oid],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(`update ordens_servico set status='em_reparo' where id=$1`, [
        oid,
      ]),
    );
    await db.query(`select responder_orcamento($1,'aprovado')`, [qid]);
    await db.query(`update ordens_servico set status='em_reparo' where id=$1`, [
      oid,
    ]);
    assert.equal(
      (await db.query("select status from ordens_servico where id=$1", [oid]))
        .rows[0].status,
      "em_reparo",
    );
  } finally {
    await db.close();
  }
});
