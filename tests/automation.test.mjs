import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { database } from "./helpers.mjs";
test("automação: token seguro, peças livres e notificações idempotentes", async () => {
  const db = await database();
  try {
    if (
      !(
        await db.query(
          "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='ordens_servico' and column_name='token_acompanhamento') ok",
        )
      ).rows[0].ok
    )
      await db.exec(await readFile("work/automacao_cliente.sql", "utf8"));
    const owner = "10000000-0000-0000-0000-000000000001",
      other = "10000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Teste','teste','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    const oid = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        eid,
        { nome: "Ana", whatsapp: "11999999999" },
        { categoria: "Fone de ouvido", marca: "JBL", modelo: "Tune" },
        { problema: "Sem áudio" },
      ])
    ).rows[0].id;
    const token = (
      await db.query(
        "select token_acompanhamento from ordens_servico where id=$1",
        [oid],
      )
    ).rows[0].token_acompanhamento;
    assert.match(String(token), /^[0-9a-f-]{36}$/);
    await db.query(
      `select registrar_peca_aplicada($1,'Alto-falante compatível',2,null)`,
      [oid],
    );
    assert.equal(
      (await db.query("select * from pecas_aplicadas where ordem_id=$1", [oid]))
        .rows.length,
      1,
    );
    const qid = (
      await db.query(
        `select salvar_orcamento($1,'[]','[]',150,0,current_date+7) id`,
        [oid],
      )
    ).rows[0].id;
    assert.equal(
      (await db.query("select status from orcamentos where id=$1", [qid]))
        .rows[0].status,
      "enviado",
    );
    assert.equal(
      (
        await db.query(
          `select count(*) n from notificacoes where evento='orcamento_enviado'`,
        )
      ).rows[0].n,
      1,
    );
    await db.exec(`reset role;set request.jwt.claim.sub='';set role anon`);
    const publicView = (
      await db.query("select acompanhar_por_token($1) v", [token])
    ).rows[0].v;
    assert.equal(publicView.equipamento.modelo, "Tune");
    assert.ok(!JSON.stringify(publicView).includes("11999999999"));
    await db.query(`select responder_orcamento_link($1,'aprovado',null,$2)`, [
      qid,
      token,
    ]);
    await db.exec(
      `reset role;set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    await db.query(
      `update ordens_servico set status='pronto_retirada' where id=$1`,
      [oid],
    );
    assert.equal(
      (
        await db.query(
          `select count(*) n from notificacoes where evento='pronto_retirada'`,
        )
      ).rows[0].n,
      1,
    );
    await db.query(`update ordens_servico set status='em_testes' where id=$1`, [
      oid,
    ]);
    await db.query(
      `update ordens_servico set status='pronto_retirada' where id=$1`,
      [oid],
    );
    assert.equal(
      (
        await db.query(
          `select count(*) n from notificacoes where evento='pronto_retirada'`,
        )
      ).rows[0].n,
      1,
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal(
      (await db.query("select * from pecas_aplicadas")).rows.length,
      0,
    );
    assert.equal((await db.query("select * from notificacoes")).rows.length, 0);
  } finally {
    await db.close();
  }
});
