import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("OS: atendente pode criar ordem e IDs de outro tenant são rejeitados", async () => {
  const db = await database();
  try {
    const ownerA = "74000000-0000-0000-0000-000000000001";
    const ownerB = "74000000-0000-0000-0000-000000000002";
    const attendant = "74000000-0000-0000-0000-000000000003";

    await db.exec(
      `insert into auth.users values
        ('${ownerA}'),('${ownerB}'),('${attendant}')`,
    );

    await db.query(
      `update perfis set nome='Atendente',email='atendente-os@horaria.test' where usuario_id=$1`,
      [attendant],
    );

    const asUser = (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`,
      );

    await asUser(ownerA);
    const companyA = (
      await db.query(
        `select configurar_empresa(
          'Assistência A',
          'ordem-tenant-a',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    await asUser(ownerB);
    const companyB = (
      await db.query(
        `select configurar_empresa(
          'Assistência B',
          'ordem-tenant-b',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const clientB = (
      await db.query(
        `insert into clientes(empresa_id,nome,whatsapp)
         values($1,'Cliente B','11911111111') returning id`,
        [companyB],
      )
    ).rows[0].id;

    const deviceB = (
      await db.query(
        `insert into equipamentos(
           empresa_id,cliente_id,categoria,modelo
         ) values($1,$2,'Celular','Modelo B') returning id`,
        [companyB, clientB],
      )
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,$2,'Atendente','atendente-os@horaria.test','ATTENDANT'
      )`,
      [ownerA, attendant],
    );

    await asUser(attendant);
    const orderA = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        companyA,
        { nome: "Cliente A", whatsapp: "11922222222" },
        { categoria: "Celular", modelo: "Modelo A" },
        { problema: "Não carrega" },
      ])
    ).rows[0].id;

    assert.ok(orderA);

    await assert.rejects(
      db.query(
        "update ordens_servico set status='em_diagnostico' where id=$1",
        [orderA],
      ),
      /Somente a equipe técnica/,
    );
    await assert.rejects(
      db.query(
        "update ordens_servico set prioridade='urgente' where id=$1",
        [orderA],
      ),
      /Somente a equipe técnica/,
    );

    await db.query("select confirmar_entrada($1)", [orderA]);
    assert.equal(
      (
        await db.query(
          "select status,entrada_confirmada from ordens_servico where id=$1",
          [orderA],
        )
      ).rows[0].status,
      "recebido",
    );

    const created = (
      await db.query(
        "select empresa_id,cliente_id,equipamento_id from ordens_servico where id=$1",
        [orderA],
      )
    ).rows[0];
    assert.equal(created.empresa_id, companyA);

    await assert.rejects(
      db.query("select criar_ordem($1,$2,$3,$4)", [
        companyA,
        { id: clientB },
        { id: deviceB, categoria: "Celular", modelo: "Modelo B" },
        { problema: "Tentativa cruzada" },
      ]),
      /Cliente não pertence/,
    );

    await asUser(ownerA);
    await assert.rejects(
      db.query("select criar_ordem($1,$2,$3,$4)", [
        companyA,
        { id: clientB },
        { id: deviceB, categoria: "Celular", modelo: "Modelo B" },
        { problema: "Tentativa do proprietário" },
      ]),
      /Cliente não pertence/,
    );
  } finally {
    await db.close();
  }
});

test("OS: técnico não contorna orçamento por update direto", async () => {
  const db = await database();
  try {
    const owner = "74000000-0000-0000-0000-000000000011";
    const technician = "74000000-0000-0000-0000-000000000012";

    await db.exec(
      `insert into auth.users values ('${owner}'),('${technician}')`,
    );
    await db.query(
      `update perfis
       set nome='Técnico OS',email='tecnico-os@horaria.test'
       where usuario_id=$1`,
      [technician],
    );

    const asUser = (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`,
      );

    await asUser(owner);
    const company = (
      await db.query(
        `select configurar_empresa(
          'Assistência Técnica Status',
          'tecnico-status-os',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const order = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Técnico", whatsapp: "11977777777" },
        { categoria: "Celular", modelo: "Modelo Técnico" },
        { problema: "Sem áudio" },
      ])
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,$2,'Técnico OS','tecnico-os@horaria.test','TECHNICIAN'
      )`,
      [owner, technician],
    );

    await asUser(technician);
    await db.query(
      "update ordens_servico set status='em_diagnostico' where id=$1",
      [order],
    );

    await assert.rejects(
      db.query(
        "update ordens_servico set status='aguardando_aprovacao' where id=$1",
        [order],
      ),
      /Somente gestores e o fluxo de aprovação/,
    );

    await asUser(owner);
    const quote = (
      await db.query(
        "select salvar_orcamento($1,'[]','[]',100,0,current_date+7) id",
        [order],
      )
    ).rows[0].id;
    await db.query("select enviar_orcamento($1)", [quote]);

    await asUser(technician);
    await assert.rejects(
      db.query(
        "update ordens_servico set status='em_reparo' where id=$1",
        [order],
      ),
      /Somente gestores e o fluxo de aprovação/,
    );

    await asUser(owner);
    await db.query(
      "select responder_orcamento($1,'aprovado',null,null,null)",
      [quote],
    );

    await asUser(technician);
    await db.query(
      "update ordens_servico set status='em_reparo' where id=$1",
      [order],
    );

    assert.equal(
      (
        await db.query("select status from ordens_servico where id=$1", [order])
      ).rows[0].status,
      "em_reparo",
    );
  } finally {
    await db.close();
  }
});
