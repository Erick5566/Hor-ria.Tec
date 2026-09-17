import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("estoque: produtos, movimentações, disponibilidade e isolamento", async () => {
  const db = await database();
  try {
    const owner = "10000000-0000-0000-0000-000000000001";
    const other = "10000000-0000-0000-0000-000000000002";
    await db.exec(`insert into auth.users values('${owner}'),('${other}');set request.jwt.claim.sub='${owner}';set role authenticated`);
    const company = (await db.query(`select configurar_empresa('Estoque','estoque','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`)).rows[0].id;
    const item = (await db.query(`insert into pecas(empresa_id,nome,tipo,categoria,sku,codigo_barras,quantidade,custo,preco) values($1,'Carregador USB-C','Acessório','Carregadores','CAR-001','789000000001',5,25,59.9) returning id`, [company])).rows[0].id;
    assert.equal((await db.query(`select movimentar_estoque($1,10,'Compra do fornecedor') quantidade`, [item])).rows[0].quantidade, 15);
    assert.equal((await db.query(`select movimentar_estoque($1,-3,'Venda no balcão') quantidade`, [item])).rows[0].quantidade, 12);
    await assert.rejects(db.query(`select movimentar_estoque($1,-13,'Saída inválida')`, [item]));
    assert.equal((await db.query(`select quantidade from pecas where id=$1`, [item])).rows[0].quantidade, 12);
    assert.ok((await db.query(`select * from movimentos_estoque where peca_id=$1 and motivo='Venda no balcão'`, [item])).rows.length === 1);
    await assert.rejects(db.query(`insert into pecas(empresa_id,nome,sku) values($1,'Outro carregador','car-001')`, [company]));
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query(`select * from pecas`)).rows.length, 0);
    await assert.rejects(db.query(`select movimentar_estoque($1,1,'Tentativa externa')`, [item]));
  } finally {
    await db.close();
  }
});
