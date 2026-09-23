import { database } from "./helpers.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
test("orçamento: cálculo, isolamento, aprovação pública e versões imutáveis", async () => {
  const db = await database();
  try {
    const uid = "10000000-0000-0000-0000-000000000001",
      other = "10000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${uid}'),('${other}');set request.jwt.claim.sub='${uid}';set role authenticated`,
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Teste','teste','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
      )
    ).rows[0].id;
    const oid = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        eid,
        { nome: "Cliente", whatsapp: "11999999999" },
        { categoria: "Celular", modelo: "Teste" },
        { problema: "Não liga" },
      ])
    ).rows[0].id;
    const save = () =>
      db.query(`select salvar_orcamento($1,$2,'[]',50,10,current_date+7) id`, [
        oid,
        [{ nome: "Reparo", quantidade: 2, valor: 100 }],
      ]);
    const qid = (await save()).rows[0].id;
    assert.equal(
      (await db.query("select status from orcamentos where id=$1", [qid]))
        .rows[0].status,
      "enviado",
    );
    assert.equal(
      Number(
        (await db.query("select total from orcamentos where id=$1", [qid]))
          .rows[0].total,
      ),
      240,
    );
    await assert.rejects(
      db.query(`update orcamentos set total=1 where id=$1`, [qid]),
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query("select * from orcamentos")).rows.length, 0);
    await assert.rejects(save());
    await db.exec(`set request.jwt.claim.sub='${uid}'`);
    const code = (
      await db.query("select codigo_publico from ordens_servico where id=$1", [
        oid,
      ])
    ).rows[0].codigo_publico;
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    await assert.rejects(
      db.query(
        `select responder_orcamento($1,'aprovado',null,$2,'11999999999')`,
        [qid, code],
      ),
    );
    await db.exec(`reset role;set request.jwt.claim.sub='';set role anon`);
    await assert.rejects(db.query("select * from orcamentos"));
    await assert.rejects(
      db.query(
        `select responder_orcamento($1,'aprovado',null,$2,'11999999999')`,
        [qid, code],
      ),
    );
    await db.exec(
      `reset role;set request.jwt.claims='{"role":"service_role"}';set role service_role`,
    );
    await assert.rejects(
      db.query(
        `select responder_orcamento($1,'aprovado',null,$2,'11888888888')`,
        [qid, code],
      ),
    );
    await db.query(
      `select responder_orcamento($1,'aprovado',null,$2,'11999999999')`,
      [qid, code],
    );
    await assert.rejects(
      db.query(
        `select responder_orcamento($1,'recusado',null,$2,'11999999999')`,
        [qid, code],
      ),
    );
    await db.exec(
      `reset role;set request.jwt.claim.sub='${uid}';set role authenticated`,
    );
    assert.equal(
      (await db.query("select status from ordens_servico where id=$1", [oid]))
        .rows[0].status,
      "orcamento_aprovado",
    );
    await save();
    assert.equal((await db.query("select * from orcamentos")).rows.length, 2);
    assert.equal(
      (await db.query("select status from orcamentos where id=$1", [qid]))
        .rows[0].status,
      "aprovado",
    );
    assert.ok(
      (
        await db.query(
          "select * from historico_os where evento='Orçamento aprovado'",
        )
      ).rows.length,
    );
  } finally {
    await db.close();
  }
});
