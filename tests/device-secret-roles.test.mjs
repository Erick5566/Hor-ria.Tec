import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("senha do aparelho: atendente registra, mas somente equipe técnica lê e altera", async () => {
  const db = await database();
  try {
    const owner = "76000000-0000-0000-0000-000000000001";
    const technician = "76000000-0000-0000-0000-000000000002";
    const attendant = "76000000-0000-0000-0000-000000000003";

    await db.exec(
      `insert into auth.users values
        ('${owner}'),('${technician}'),('${attendant}')`,
    );

    await db.query(
      `update perfis set nome='Técnico',email='tecnico-segredo@horaria.test' where usuario_id=$1`,
      [technician],
    );
    await db.query(
      `update perfis set nome='Atendente',email='atendente-segredo@horaria.test' where usuario_id=$1`,
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
          'Segredo Equipe',
          'segredo-equipe',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,$2,'Técnico','tecnico-segredo@horaria.test','TECHNICIAN'
      )`,
      [owner, technician],
    );
    await db.query(
      `select link_team_member(
        $1,$2,'Atendente','atendente-segredo@horaria.test','ATTENDANT'
      )`,
      [owner, attendant],
    );

    await asUser(attendant);
    const order = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Senha", whatsapp: "11933333333" },
        {
          categoria: "Celular",
          modelo: "Modelo senha",
          senha: "2580",
        },
        { problema: "Não liga" },
      ])
    ).rows[0].id;

    const attendantRead = await db.query(
      "select senha from equipamento_segredos where ordem_id=$1",
      [order],
    );
    assert.equal(attendantRead.rows.length, 0);

    const attendantUpdate = await db.query(
      "update equipamento_segredos set senha='0000' where ordem_id=$1 returning ordem_id",
      [order],
    );
    assert.equal(attendantUpdate.rows.length, 0);

    await asUser(technician);
    const technicianRead = await db.query(
      "select senha from equipamento_segredos where ordem_id=$1",
      [order],
    );
    assert.equal(technicianRead.rows[0].senha, "2580");

    const technicianUpdate = await db.query(
      "update equipamento_segredos set senha='3690' where ordem_id=$1 returning ordem_id",
      [order],
    );
    assert.equal(technicianUpdate.rows.length, 1);

    await asUser(owner);
    const ownerRead = await db.query(
      "select senha from equipamento_segredos where ordem_id=$1",
      [order],
    );
    assert.equal(ownerRead.rows[0].senha, "3690");
  } finally {
    await db.close();
  }
});
