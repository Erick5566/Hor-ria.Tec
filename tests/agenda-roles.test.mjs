import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("agenda: administrador pode bloquear horário e atendente não", async () => {
  const db = await database();
  try {
    const owner = "75000000-0000-0000-0000-000000000001";
    const admin = "75000000-0000-0000-0000-000000000002";
    const attendant = "75000000-0000-0000-0000-000000000003";

    await db.exec(
      `insert into auth.users values
        ('${owner}'),('${admin}'),('${attendant}')`,
    );

    await db.query(
      `update perfis set nome='Administrador',email='admin-agenda@horaria.test' where usuario_id=$1`,
      [admin],
    );
    await db.query(
      `update perfis set nome='Atendente',email='atendente-agenda@horaria.test' where usuario_id=$1`,
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
          'Agenda Equipe',
          'agenda-equipe',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,$2,'Administrador','admin-agenda@horaria.test','ADMIN'
      )`,
      [owner, admin],
    );
    await db.query(
      `select link_team_member(
        $1,$2,'Atendente','atendente-agenda@horaria.test','ATTENDANT'
      )`,
      [owner, attendant],
    );

    await asUser(admin);
    const block = (
      await db.query(
        `insert into agendamentos(
          empresa_id,bloqueio,inicio,fim,descricao
        ) values(
          $1,true,now()+interval '1 day',now()+interval '1 day 1 hour','Almoço'
        ) returning id`,
        [company],
      )
    ).rows[0].id;
    assert.ok(block);

    await asUser(attendant);
    await assert.rejects(
      db.query(
        `insert into agendamentos(
          empresa_id,bloqueio,inicio,fim,descricao
        ) values(
          $1,true,now()+interval '2 days',now()+interval '2 days 1 hour','Tentativa'
        )`,
        [company],
      ),
      /Bloqueio não autorizado/,
    );

    const attendantDelete = await db.query(
      "delete from agendamentos where id=$1 returning id",
      [block],
    );
    assert.equal(attendantDelete.rows.length, 0);

    await asUser(admin);
    const adminDelete = await db.query(
      "delete from agendamentos where id=$1 returning id",
      [block],
    );
    assert.equal(adminDelete.rows.length, 1);
  } finally {
    await db.close();
  }
});
