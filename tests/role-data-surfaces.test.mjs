import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("dados sensíveis: atendente não lê diagnóstico, garantia ou orçamento", async () => {
  const db = await database();
  try {
    const owner = "79000000-0000-0000-0000-000000000001";
    const technician = "79000000-0000-0000-0000-000000000002";
    const attendant = "79000000-0000-0000-0000-000000000003";

    await db.exec(
      `insert into auth.users values
        ('${owner}'),('${technician}'),('${attendant}')`,
    );

    await db.query(
      `update perfis set nome='Técnico',email='tecnico-dados@horaria.test' where usuario_id=$1`,
      [technician],
    );
    await db.query(
      `update perfis set nome='Atendente',email='atendente-dados@horaria.test' where usuario_id=$1`,
      [attendant],
    );

    const asUser = (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`,
      );

    await asUser(owner);
    const company = (
      await db.query(
        `select configurar_empresa(
          'Dados por função',
          'dados-por-funcao',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const order = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Dados", whatsapp: "11966666666" },
        { categoria: "Celular", modelo: "Modelo dados" },
        { problema: "Reinicia sozinho" },
      ])
    ).rows[0].id;

    await db.query(
      `insert into diagnosticos(ordem_id,empresa_id,observacoes)
       values($1,$2,'Diagnóstico interno')`,
      [order, company],
    );

    await db.query(
      `select salvar_garantia(
        $1,'Garantia técnica',current_date,current_date+30,null,null,null,null
      )`,
      [order],
    );

    const quote = (
      await db.query(
        "select salvar_orcamento($1,'[]','[]',120,0,current_date+7) id",
        [order],
      )
    ).rows[0].id;
    await db.query("select enviar_orcamento($1)", [quote]);

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,$2,'Técnico','tecnico-dados@horaria.test','TECHNICIAN'
      )`,
      [owner, technician],
    );
    await db.query(
      `select link_team_member(
        $1,$2,'Atendente','atendente-dados@horaria.test','ATTENDANT'
      )`,
      [owner, attendant],
    );

    await asUser(attendant);
    assert.equal((await db.query("select * from diagnosticos")).rows.length, 0);
    assert.equal((await db.query("select * from garantias")).rows.length, 0);
    assert.equal((await db.query("select * from orcamentos")).rows.length, 0);

    await assert.rejects(
      db.query(
        `insert into diagnosticos(ordem_id,empresa_id,observacoes)
         values($1,$2,'Tentativa')`,
        [order, company],
      ),
    );
    await assert.rejects(
      db.query(
        `select salvar_garantia(
          $1,'Tentativa',current_date,current_date+30,null,null,null,null
        )`,
        [order],
      ),
      /Ordem não autorizada/,
    );

    await asUser(technician);
    assert.equal((await db.query("select * from diagnosticos")).rows.length, 1);
    assert.equal((await db.query("select * from garantias")).rows.length, 1);
    assert.equal((await db.query("select * from orcamentos")).rows.length, 0);

    await asUser(owner);
    assert.equal((await db.query("select * from orcamentos")).rows.length, 1);
  } finally {
    await db.close();
  }
});
