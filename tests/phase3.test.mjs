import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("fase 3: seminovo vendido gera financeiro e pós-venda isolados", async () => {
  const db = await database();
  try {
    const owner = "10000000-0000-0000-0000-000000000001";
    const other = "10000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const company = (
      await db.query(
        `select configurar_empresa('Trade','trade','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    const seller = (
      await db.query(
        `insert into clientes(empresa_id,nome,whatsapp) values($1,'Vendedor','11999999991') returning id`,
        [company],
      )
    ).rows[0].id;
    const buyer = (
      await db.query(
        `insert into clientes(empresa_id,nome,whatsapp) values($1,'Comprador','11999999992') returning id`,
        [company],
      )
    ).rows[0].id;
    const used = (
      await db.query(
        `insert into seminovos(empresa_id,vendedor_id,categoria,marca,modelo,status,valor_compra,custos_reparo,preco_venda,na_vitrine) values($1,$2,'Celular','Apple','iPhone 12','pronto_venda',1100,200,1750,true) returning id`,
        [company, seller],
      )
    ).rows[0].id;
    await db.query(`select vender_seminovo($1,$2,1750,'pix',90)`, [
      used,
      buyer,
    ]);
    const sold = (
      await db.query(
        `select status,na_vitrine,valor_vendido from seminovos where id=$1`,
        [used],
      )
    ).rows[0];
    assert.equal(sold.status, "vendido");
    assert.equal(sold.na_vitrine, false);
    assert.equal(Number(sold.valor_vendido), 1750);
    assert.equal(
      (
        await db.query(`select origem from financeiro where empresa_id=$1`, [
          company,
        ])
      ).rows[0].origem,
      "seminovo",
    );
    assert.equal(
      (
        await db.query(`select tipo from pos_venda where seminovo_id=$1`, [
          used,
        ])
      ).rows[0].tipo,
      "seminovo",
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query(`select * from seminovos`)).rows.length, 0);
    assert.equal((await db.query(`select * from pos_venda`)).rows.length, 0);
  } finally {
    await db.close();
  }
});
