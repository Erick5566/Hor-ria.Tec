import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("bancada: técnico opera reparo, atendente não acessa e só gestor configura mesas", async () => {
  const db = await database();
  try {
    const owner = "78000000-0000-0000-0000-000000000001";
    const technician = "78000000-0000-0000-0000-000000000002";
    const attendant = "78000000-0000-0000-0000-000000000003";

    await db.exec(
      `insert into auth.users values
        ('${owner}'),('${technician}'),('${attendant}')`,
    );

    await db.query(
      `update perfis set nome='Técnico',email='tecnico-bancada@horaria.test' where usuario_id=$1`,
      [technician],
    );
    await db.query(
      `update perfis set nome='Atendente',email='atendente-bancada@horaria.test' where usuario_id=$1`,
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
          'Bancada Equipe',
          'bancada-equipe',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const bench = (
      await db.query(
        `insert into mesas_reparo(empresa_id,nome,ordem_exibicao)
         values($1,'Principal',0) returning id`,
        [company],
      )
    ).rows[0].id;

    const order = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Bancada", whatsapp: "11955555555" },
        { categoria: "Celular", modelo: "Modelo bancada" },
        { problema: "Sem imagem" },
      ])
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,$2,'Técnico','tecnico-bancada@horaria.test','TECHNICIAN'
      )`,
      [owner, technician],
    );
    await db.query(
      `select link_team_member(
        $1,$2,'Atendente','atendente-bancada@horaria.test','ATTENDANT'
      )`,
      [owner, attendant],
    );

    await asUser(technician);
    const data = (
      await db.query("select repair_bench_data() data")
    ).rows[0].data;
    assert.equal(data.items.length, 1);

    await db.query(
      "select mover_ordem_reparo($1,'em_diagnostico',$2,'alta')",
      [order, bench],
    );
    assert.equal(
      (
        await db.query(
          "select status,mesa_id,prioridade from ordens_servico where id=$1",
          [order],
        )
      ).rows[0].status,
      "em_diagnostico",
    );

    await assert.rejects(
      db.query(
        "select mover_ordem_reparo($1,'aguardando_aprovacao',$2,'alta')",
        [order, bench],
      ),
      /Somente gestores podem controlar as etapas de orçamento e aprovação/,
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
        "select mover_ordem_reparo($1,'em_reparo',$2,'alta')",
        [order, bench],
      ),
      /Somente gestores podem controlar as etapas de orçamento e aprovação/,
    );

    await assert.rejects(
      db.query(
        `insert into mesas_reparo(empresa_id,nome,ordem_exibicao)
         values($1,'Indevida',1)`,
        [company],
      ),
    );

    await asUser(attendant);
    await assert.rejects(db.query("select repair_bench_data()"));
    await assert.rejects(
      db.query(
        "select mover_ordem_reparo($1,'em_reparo',$2,'urgente')",
        [order, bench],
      ),
      /Ordem não autorizada/,
    );

    assert.equal(
      (await db.query("select * from mesas_reparo")).rows.length,
      0,
    );

    await asUser(owner);
    assert.equal(
      (await db.query("select * from mesas_reparo")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
