import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("fase 2: venda integra estoque e financeiro com isolamento", async () => {
  const db = await database();
  try {
    const owner = "10000000-0000-0000-0000-000000000001";
    const outsider = "10000000-0000-0000-0000-000000000002";
    const technician = "10000000-0000-0000-0000-000000000003";
    await db.exec(
      `insert into auth.users values('${owner}'),('${outsider}'),('${technician}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const company = (
      await db.query(
        `select configurar_empresa('Loja','loja','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
      )
    ).rows[0].id;
    const customer = (
      await db.query(
        `insert into clientes(empresa_id,nome,whatsapp) values($1,'Cliente da loja','11999999999') returning id`,
        [company],
      )
    ).rows[0].id;
    const product = (
      await db.query(
        `insert into pecas(empresa_id,nome,tipo,quantidade,custo,preco) values($1,'Carregador','Produto',5,20,50) returning id`,
        [company],
      )
    ).rows[0].id;
    const sale = (
      await db.query(
        `select finalizar_venda($1,$2,$3,5,'pix','Balcão') result`,
        [company, customer, [{ peca_id: product, quantidade: 2, preco: 50 }]],
      )
    ).rows[0].result;
    assert.equal(Number(sale.total), 95);
    assert.equal(Number(sale.custo), 40);
    assert.equal(Number(sale.lucro), 55);
    assert.equal(
      (await db.query(`select quantidade from pecas where id=$1`, [product]))
        .rows[0].quantidade,
      3,
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int total from movimentos_estoque where venda_id=$1`,
          [sale.id],
        )
      ).rows[0].total,
      1,
    );
    assert.equal(
      (
        await db.query(`select origem from financeiro where venda_id=$1`, [
          sale.id,
        ])
      ).rows[0].origem,
      "loja",
    );
    const ownerRecords = (
      await db.query(`select records_list_page('clientes',1,30,null) result`)
    ).rows[0].result;
    assert.equal(Number(ownerRecords.metrics.relationship), 95);
    assert.equal(Number(ownerRecords.items[0].relationship_total), 95);

    await db.exec(`reset role`);
    await db.query(
      `insert into empresa_membros(empresa_id,usuario_id,role) values($1,$2,'TECHNICIAN')`,
      [company, technician],
    );
    await db.exec(
      `set request.jwt.claim.sub='${technician}';set role authenticated`,
    );
    const technicianRecords = (
      await db.query(`select records_list_page('clientes',1,30,null) result`)
    ).rows[0].result;
    assert.equal(Number(technicianRecords.metrics.relationship), 0);
    assert.equal(Number(technicianRecords.items[0].relationship_total), 0);
    await db.exec(
      `reset role;set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    await assert.rejects(
      db.query(`select finalizar_venda($1,null,$2,0,'dinheiro',null)`, [
        company,
        [{ peca_id: product, quantidade: 4, preco: 50 }],
      ]),
    );
    assert.equal(
      (await db.query(`select quantidade from pecas where id=$1`, [product]))
        .rows[0].quantidade,
      3,
    );
    assert.equal(
      (await db.query(`select count(*)::int total from vendas`)).rows[0].total,
      1,
    );
    await db.exec(`set request.jwt.claim.sub='${outsider}'`);
    assert.equal((await db.query(`select * from vendas`)).rows.length, 0);
    await assert.rejects(
      db.query(`select finalizar_venda($1,null,$2,0,'pix',null)`, [
        company,
        [{ peca_id: product, quantidade: 1, preco: 50 }],
      ]),
    );
  } finally {
    await db.close();
  }
});
