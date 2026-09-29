import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("cadastros: cliente e equipamento podem ser criados e editados, exclusão direta é protegida", async () => {
  const db = await database();
  try {
    const owner = "10000000-0000-0000-0000-000000000001";
    const outsider = "10000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${owner}'),('${outsider}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Teste','lifecycle','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    const cid = (
      await db.query(
        `insert into clientes(empresa_id,nome,whatsapp) values($1,'Cliente teste','11000000000') returning id`,
        [eid],
      )
    ).rows[0].id;
    const equipment = (
      await db.query(
        `insert into equipamentos(empresa_id,cliente_id,categoria,modelo) values($1,$2,'Notebook','Inicial') returning id`,
        [eid, cid],
      )
    ).rows[0].id;
    await db.query(
      `update clientes set nome='Cliente editado',email='teste@example.invalid' where id=$1`,
      [cid],
    );
    await db.query(
      `update equipamentos set modelo='Editado',marca='Teste' where id=$1`,
      [equipment],
    );
    assert.equal(
      (await db.query("select nome from clientes where id=$1", [cid])).rows[0]
        .nome,
      "Cliente editado",
    );
    assert.equal(
      (
        await db.query("select modelo from equipamentos where id=$1", [
          equipment,
        ])
      ).rows[0].modelo,
      "Editado",
    );
    await assert.rejects(
      db.query("delete from equipamentos where id=$1", [equipment]),
    );
    await assert.rejects(db.query("delete from clientes where id=$1", [cid]));
    await db.exec(`set request.jwt.claim.sub='${outsider}'`);
    assert.equal(
      (
        await db.query("update clientes set nome=$1 where id=$2 returning id", [
          "Intruso",
          cid,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update equipamentos set modelo=$1 where id=$2 returning id",
          ["Intruso", equipment],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select id from clientes where id=$1", [cid])).rows
        .length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    assert.equal(
      (await db.query("select nome from clientes where id=$1", [cid])).rows[0]
        .nome,
      "Cliente editado",
    );
    assert.equal(
      (
        await db.query("select modelo from equipamentos where id=$1", [
          equipment,
        ])
      ).rows[0].modelo,
      "Editado",
    );
  } finally {
    await db.close();
  }
});
