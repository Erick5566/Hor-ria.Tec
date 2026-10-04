import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("serviços: gestor cria, edita e exclui; técnico não altera catálogo", async () => {
  const db = await database();
  try {
    const owner = "10000000-0000-0000-0000-000000000011";
    const technician = "10000000-0000-0000-0000-000000000012";

    await db.exec(
      `insert into auth.users values('${owner}'),('${technician}');
       set request.jwt.claim.sub='${owner}';
       set role authenticated`,
    );

    const companyId = (
      await db.query(
        `select configurar_empresa(
          'Serviços QA',
          'servicos-lifecycle',
          '{}',
          false,
          '[]'
        ) id`,
      )
    ).rows[0].id;

    await db.query(
      `insert into empresa_membros(empresa_id,usuario_id,role,status)
       values($1,$2,'TECHNICIAN','ACTIVE')`,
      [companyId, technician],
    );

    const serviceId = (
      await db.query(
        `insert into servicos(
          empresa_id,nome,duracao,categoria,preco,descricao,garantia_dias,ativo
        ) values($1,'Troca de bateria',45,'Celular',120,'Teste',90,true)
        returning id`,
        [companyId],
      )
    ).rows[0].id;

    await db.query(
      `update servicos
       set nome='Troca de bateria premium',preco=149.9,duracao=50
       where id=$1`,
      [serviceId],
    );

    const edited = (
      await db.query(
        `select nome,preco,duracao from servicos where id=$1`,
        [serviceId],
      )
    ).rows[0];

    assert.equal(edited.nome, "Troca de bateria premium");
    assert.equal(Number(edited.preco), 149.9);
    assert.equal(edited.duracao, 50);

    await db.exec(`set request.jwt.claim.sub='${technician}'`);

    assert.equal(
      (
        await db.query(
          `update servicos set preco=1 where id=$1 returning id`,
          [serviceId],
        )
      ).rows.length,
      0,
    );

    assert.equal(
      (
        await db.query(
          `delete from servicos where id=$1 returning id`,
          [serviceId],
        )
      ).rows.length,
      0,
    );

    await db.exec(`set request.jwt.claim.sub='${owner}'`);

    assert.equal(
      (
        await db.query(
          `delete from servicos where id=$1 returning id`,
          [serviceId],
        )
      ).rows.length,
      1,
    );

    assert.equal(
      (await db.query(`select id from servicos where id=$1`, [serviceId])).rows
        .length,
      0,
    );
  } finally {
    await db.close();
  }
});
