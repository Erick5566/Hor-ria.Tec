import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("catálogo: aceita categorias próprias e exige o tipo em Outros", async () => {
  const db = await database();
  try {
    const owner = "40000000-0000-0000-0000-000000000001";
    await db.exec(
      `insert into auth.users values('${owner}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const company = (
      await db.query(
        `select configurar_empresa('Catálogo','catalogo','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
      )
    ).rows[0].id;
    const customer = (
      await db.query(
        `insert into clientes(empresa_id,nome,whatsapp) values($1,'Cliente catálogo','11999999999') returning id`,
        [company],
      )
    ).rows[0].id;

    await db.query(
      `insert into equipamentos(empresa_id,cliente_id,categoria,marca,modelo) values($1,$2,'Fone de ouvido','Sony','WH-1000XM5')`,
      [company, customer],
    );
    await assert.rejects(
      db.query(
        `insert into equipamentos(empresa_id,cliente_id,categoria,marca,modelo) values($1,$2,'Outro','JBL','Flip 6')`,
        [company, customer],
      ),
    );
    await db.query(
      `insert into equipamentos(empresa_id,cliente_id,categoria,tipo_personalizado,marca,modelo) values($1,$2,'Outro','Caixa de som','JBL','Flip 6')`,
      [company, customer],
    );

    const rows = (
      await db.query(
        `select categoria,tipo_personalizado,marca,modelo from equipamentos order by criado_em,id`,
      )
    ).rows;
    assert.deepEqual(rows, [
      {
        categoria: "Fone de ouvido",
        tipo_personalizado: null,
        marca: "Sony",
        modelo: "WH-1000XM5",
      },
      {
        categoria: "Outro",
        tipo_personalizado: "Caixa de som",
        marca: "JBL",
        modelo: "Flip 6",
      },
    ]);
  } finally {
    await db.close();
  }
});
