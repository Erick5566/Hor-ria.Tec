import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("estoque: técnico pode aplicar peça e atendente não acessa custos nem baixa estoque", async () => {
  const db = await database();
  try {
    const owner = "73000000-0000-0000-0000-000000000001";
    const technician = "73000000-0000-0000-0000-000000000002";
    const attendant = "73000000-0000-0000-0000-000000000003";

    await db.exec(
      `insert into auth.users values
        ('${owner}'),('${technician}'),('${attendant}')`,
    );

    const asUser = (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`,
      );

    await asUser(owner);
    const company = (
      await db.query(
        `select configurar_empresa(
          'Equipe Estoque',
          'equipe-estoque',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const item = (
      await db.query(
        `insert into pecas(
          empresa_id,nome,tipo,categoria,quantidade,custo,preco
        ) values($1,'Tela teste','Peça','Telas',5,100,200) returning id`,
        [company],
      )
    ).rows[0].id;

    const orderId = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Estoque", whatsapp: "11999999999" },
        { categoria: "Celular", modelo: "Teste" },
        { problema: "Tela quebrada" },
      ])
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,$2,'Técnico','tecnico-estoque@horaria.test','TECHNICIAN'
      )`,
      [owner, technician],
    );
    await db.query(
      `select link_team_member(
        $1,$2,'Atendente','atendente-estoque@horaria.test','ATTENDANT'
      )`,
      [owner, attendant],
    );

    await asUser(technician);
    const options = (
      await db.query("select applied_parts_options($1) value", [orderId])
    ).rows[0].value;
    assert.equal(options.stock.length, 1);
    assert.equal(Number(options.stock[0].custo), 100);

    await db.query(
      `select registrar_peca_aplicada_valores(
        $1,'Tela teste',1,$2,100,200,50
      )`,
      [orderId, item],
    );

    assert.equal(
      (
        await db.query("select quantidade from pecas where id=$1", [item])
      ).rows[0].quantidade,
      4,
    );

    await asUser(attendant);
    await assert.rejects(
      db.query("select applied_parts_options($1)", [orderId]),
      /Sem permissão/,
    );
    await assert.rejects(
      db.query(
        `select registrar_peca_aplicada_valores(
          $1,'Tela indevida',1,$2,100,200,0
        )`,
        [orderId, item],
      ),
      /Ordem não autorizada/,
    );

    await asUser(owner);
    assert.equal(
      (
        await db.query("select quantidade from pecas where id=$1", [item])
      ).rows[0].quantidade,
      4,
    );
  } finally {
    await db.close();
  }
});
