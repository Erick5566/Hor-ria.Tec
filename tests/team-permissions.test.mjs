import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("equipe: convite, vínculo, funções e reativação respeitam permissões", async () => {
  const db = await database();
  try {
    const ownerA = "71000000-0000-0000-0000-000000000001";
    const ownerB = "71000000-0000-0000-0000-000000000002";
    const tech = "71000000-0000-0000-0000-000000000003";
    const admin = "71000000-0000-0000-0000-000000000004";

    await db.exec(
      `insert into auth.users values
        ('${ownerA}'),('${ownerB}'),('${tech}'),('${admin}')`,
    );

    await db.query(
      `update perfis set nome='Dono A',email='dono-a@horaria.test' where usuario_id=$1`,
      [ownerA],
    );
    await db.query(
      `update perfis set nome='Dono B',email='dono-b@horaria.test' where usuario_id=$1`,
      [ownerB],
    );
    await db.query(
      `update perfis set nome='Técnico Existente',email='tecnico@horaria.test' where usuario_id=$1`,
      [tech],
    );
    await db.query(
      `update perfis set nome='Admin Existente',email='admin@horaria.test' where usuario_id=$1`,
      [admin],
    );

    const asUser = (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`,
      );

    await asUser(ownerA);
    const companyA = (
      await db.query(
        `select configurar_empresa('Equipe A','equipe-a','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
      )
    ).rows[0].id;

    await asUser(ownerB);
    const companyB = (
      await db.query(
        `select configurar_empresa('Equipe B','equipe-b','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
      )
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member($1,$2,'Nome digitado pelo gestor','tecnico@horaria.test','TECHNICIAN')`,
      [ownerA, tech],
    );

    const preserved = (
      await db.query(
        `select nome,email from perfis where usuario_id=$1`,
        [tech],
      )
    ).rows[0];
    assert.deepEqual(preserved, {
      nome: "Técnico Existente",
      email: "tecnico@horaria.test",
    });

    await asUser(ownerA);
    const team = (await db.query("select team_members_data() value")).rows[0]
      .value;
    assert.equal(team.actorRole, "OWNER");
    assert.equal(team.items.length, 2);
    assert.equal(
      team.items.find((item) => item.userId === tech)?.role,
      "TECHNICIAN",
    );

    await assert.rejects(
      (async () => {
        await db.exec("reset role;set role service_role");
        await db.query(
          `select link_team_member($1,$2,'Outro nome','tecnico@horaria.test','ATTENDANT')`,
          [ownerA, tech],
        );
      })(),
      /já faz parte da equipe/,
    );

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member($1,$2,'Admin Existente','admin@horaria.test','ADMIN')`,
      [ownerA, admin],
    );

    await asUser(admin);
    await assert.rejects(
      db.query(
        `select update_team_member_access($1,'ADMIN','ACTIVE')`,
        [tech],
      ),
      /Somente o proprietário/,
    );

    await asUser(ownerA);
    await db.query(
      `select update_team_member_access($1,'ATTENDANT','ACTIVE')`,
      [tech],
    );
    const updatedTeam = (
      await db.query("select team_members_data() value")
    ).rows[0].value;
    assert.equal(
      updatedTeam.items.find((item) => item.userId === tech)?.role,
      "ATTENDANT",
    );

    await db.query(
      `select update_team_member_access($1,'ATTENDANT','INACTIVE')`,
      [tech],
    );

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member($1,$2,'Técnico Existente','tecnico@horaria.test','TECHNICIAN')`,
      [ownerB, tech],
    );

    await asUser(ownerA);
    await assert.rejects(
      db.query(
        `select update_team_member_access($1,'ATTENDANT','ACTIVE')`,
        [tech],
      ),
      /outra assistência/,
    );

    await asUser(tech);
    const context = (await db.query("select access_context() value")).rows[0]
      .value;
    assert.equal(context.company.id, companyB);
    assert.equal(context.company.role, "TECHNICIAN");

    await assert.rejects(db.query("select team_members_data()"));
  } finally {
    await db.close();
  }
});
