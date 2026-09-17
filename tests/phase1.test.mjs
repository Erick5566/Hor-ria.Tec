import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("fase 1: mesa, custos e garantia preservam isolamento multiempresa", async () => {
  const db = await database();
  try {
    const ownerA = "10000000-0000-0000-0000-000000000001";
    const ownerB = "10000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${ownerA}'),('${ownerB}');set request.jwt.claim.sub='${ownerA}';set role authenticated`,
    );
    const companyA = (
      await db.query(
        `select configurar_empresa('Empresa A','empresa-a','{}',false,'[{"nome":"Troca de tela","duracao":60}]') id`,
      )
    ).rows[0].id;
    const orderA = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        companyA,
        { nome: "Cliente A", whatsapp: "11999999991" },
        { categoria: "Celular", modelo: "Modelo A" },
        { problema: "Tela quebrada" },
      ])
    ).rows[0].id;
    const benchA = (
      await db.query(
        `insert into mesas_reparo(empresa_id,nome) values($1,'Mesa 01') returning id`,
        [companyA],
      )
    ).rows[0].id;
    await db.query(`select mover_ordem_reparo($1,'recebido',$2,'alta')`, [
      orderA,
      benchA,
    ]);
    const organized = (
      await db.query(
        `select status,mesa_id,prioridade from ordens_servico where id=$1`,
        [orderA],
      )
    ).rows[0];
    assert.deepEqual(organized, {
      status: "recebido",
      mesa_id: benchA,
      prioridade: "alta",
    });

    const part = (
      await db.query(
        `insert into pecas(empresa_id,nome,quantidade,custo,preco) values($1,'Tela',2,180,280) returning id`,
        [companyA],
      )
    ).rows[0].id;
    const applied = (
      await db.query(
        `select registrar_peca_aplicada_valores($1,'Tela',1,$2,null,null,120) id`,
        [orderA, part],
      )
    ).rows[0].id;
    const values = (
      await db.query(
        `select custo_unitario,valor_venda_unitario,mao_obra from pecas_aplicadas where id=$1`,
        [applied],
      )
    ).rows[0];
    assert.equal(Number(values.custo_unitario), 180);
    assert.equal(Number(values.valor_venda_unitario), 280);
    assert.equal(Number(values.mao_obra), 120);
    assert.equal(
      Number(
        (await db.query(`select quantidade from pecas where id=$1`, [part]))
          .rows[0].quantidade,
      ),
      1,
    );
    await db.query(
      `select salvar_garantia($1,'Tela e instalação',current_date,current_date+90,null,null,null,$2)`,
      [orderA, applied],
    );
    assert.equal(
      (await db.query(`select count(*)::int total from garantias`)).rows[0]
        .total,
      1,
    );

    await db.exec(`set request.jwt.claim.sub='${ownerB}'`);
    const companyB = (
      await db.query(
        `select configurar_empresa('Empresa B','empresa-b','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
      )
    ).rows[0].id;
    assert.notEqual(companyA, companyB);
    assert.equal((await db.query(`select * from mesas_reparo`)).rows.length, 0);
    assert.equal((await db.query(`select * from garantias`)).rows.length, 0);
    await assert.rejects(
      db.query(`select mover_ordem_reparo($1,'em_diagnostico',$2,'normal')`, [
        orderA,
        benchA,
      ]),
    );
  } finally {
    await db.close();
  }
});
