import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("orçamento: rascunho é reaproveitado e versão pública só muda após envio", async () => {
  const db = await database();
  try {
    const owner = "77000000-0000-0000-0000-000000000001";
    await db.exec(
      `insert into auth.users values('${owner}');
       set request.jwt.claim.sub='${owner}';
       set role authenticated`,
    );

    const company = (
      await db.query(
        `select configurar_empresa(
          'Fluxo Orçamento',
          'fluxo-orcamento',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const order = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Orçamento", whatsapp: "11944444444" },
        { categoria: "Celular", modelo: "Modelo orçamento" },
        { problema: "Não liga" },
      ])
    ).rows[0].id;

    const firstDraft = (
      await db.query(
        "select salvar_orcamento($1,'[]','[]',100,0,current_date+7) id",
        [order],
      )
    ).rows[0].id;

    assert.equal(
      (
        await db.query("select status from orcamentos where id=$1", [
          firstDraft,
        ])
      ).rows[0].status,
      "rascunho",
    );

    assert.equal(
      (
        await db.query("select status from ordens_servico where id=$1", [order])
      ).rows[0].status,
      "novo",
    );

    await db.query("select enviar_orcamento($1)", [firstDraft]);

    assert.equal(
      (
        await db.query("select status from orcamentos where id=$1", [
          firstDraft,
        ])
      ).rows[0].status,
      "enviado",
    );
    assert.equal(
      (
        await db.query("select status from ordens_servico where id=$1", [order])
      ).rows[0].status,
      "aguardando_aprovacao",
    );

    const secondDraft = (
      await db.query(
        "select salvar_orcamento($1,'[]','[]',150,0,current_date+7) id",
        [order],
      )
    ).rows[0].id;
    const secondDraftAgain = (
      await db.query(
        "select salvar_orcamento($1,'[]','[]',175,0,current_date+7) id",
        [order],
      )
    ).rows[0].id;

    assert.equal(secondDraftAgain, secondDraft);
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from orcamentos where ordem_id=$1 and status='rascunho'",
          [order],
        )
      ).rows[0].count,
      1,
    );

    const token = (
      await db.query(
        "select token_acompanhamento token from ordens_servico where id=$1",
        [order],
      )
    ).rows[0].token;

    await db.exec(
      `reset role;set request.jwt.claims='{"role":"service_role"}';set role service_role`,
    );
    const beforeSecondSend = (
      await db.query("select acompanhar_por_token($1) data", [token])
    ).rows[0].data;
    assert.equal(beforeSecondSend.orcamento.id, firstDraft);

    await db.exec(
      `reset role;set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    await db.query("select enviar_orcamento($1)", [secondDraft]);

    await db.exec(
      `reset role;set request.jwt.claims='{"role":"service_role"}';set role service_role`,
    );
    const afterSecondSend = (
      await db.query("select acompanhar_por_token($1) data", [token])
    ).rows[0].data;
    assert.equal(afterSecondSend.orcamento.id, secondDraft);
    assert.equal(Number(afterSecondSend.orcamento.mao_obra), 175);
  } finally {
    await db.close();
  }
});

test("orçamento público: empresa indisponível não aceita resposta por token ou código", async () => {
  const db = await database();
  try {
    const owner = "77000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${owner}');
       set request.jwt.claim.sub='${owner}';
       set role authenticated`,
    );

    const company = (
      await db.query(
        `select configurar_empresa(
          'Fluxo Suspenso',
          'fluxo-suspenso',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const order = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Suspenso", whatsapp: "11955555555" },
        { categoria: "Celular", modelo: "Modelo suspenso" },
        { problema: "Não carrega" },
      ])
    ).rows[0].id;

    const quote = (
      await db.query(
        "select salvar_orcamento($1,'[]','[]',120,0,current_date+7) id",
        [order],
      )
    ).rows[0].id;

    await db.query("select enviar_orcamento($1)", [quote]);

    const orderPublic = (
      await db.query(
        "select token_acompanhamento token,codigo_publico codigo from ordens_servico where id=$1",
        [order],
      )
    ).rows[0];

    await db.exec("reset role");
    await db.query("update empresas set status='SUSPENDED' where id=$1", [company]);

    await db.exec(
      `set request.jwt.claims='{"role":"service_role"}';set role service_role`,
    );

    await assert.rejects(
      db.query(
        "select responder_orcamento_link($1,'aprovado',null,$2)",
        [quote, orderPublic.token],
      ),
      /Atendimento indisponível/,
    );

    await assert.rejects(
      db.query(
        "select responder_orcamento($1,'aprovado',null,$2,$3)",
        [quote, orderPublic.codigo, "11955555555"],
      ),
      /Atendimento indisponível/,
    );

    assert.equal(
      (
        await db.query("select status from orcamentos where id=$1", [quote])
      ).rows[0].status,
      "enviado",
    );
  } finally {
    await db.close();
  }
});
