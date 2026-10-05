import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("fiscal: aceita CNPJ com máscara e preserva permissões da empresa", async () => {
  const db = await database();

  try {
    const owner = "91000000-0000-0000-0000-000000000001";
    const outsider = "91000000-0000-0000-0000-000000000002";

    await db.exec(
      `insert into auth.users values('${owner}'),('${outsider}');
       set request.jwt.claim.sub='${owner}';
       set role authenticated`,
    );

    const company = (
      await db.query(
        `select configurar_empresa(
          'Assistência Fiscal',
          'assistencia-fiscal-teste',
          '{}',
          false,
          '[{"nome":"Reparo","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const inserted = (
      await db.query(
        `insert into fiscal_settings(
          empresa_id,
          provider,
          cnpj,
          razao_social,
          codigo_municipio,
          dados_confirmados,
          configuracao_confirmada,
          ativo
        )
        values(
          $1,
          'emissor_nacional_web',
          '93.030.303/0330-30',
          'Assistência Fiscal LTDA',
          '2905701',
          true,
          true,
          true
        )
        returning cnpj,dados_confirmados,configuracao_confirmada,ativo`,
        [company],
      )
    ).rows[0];

    assert.equal(inserted.cnpj, "93.030.303/0330-30");
    assert.equal(inserted.dados_confirmados, true);
    assert.equal(inserted.configuracao_confirmada, true);
    assert.equal(inserted.ativo, true);

    await assert.rejects(
      db.query(
        `update fiscal_settings
         set cnpj='12.345.678/9012-3'
         where empresa_id=$1`,
        [company],
      ),
    );

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='${outsider}';
       set role authenticated`,
    );

    const outsiderUpdate = await db.query(
      `update fiscal_settings
       set razao_social='Alteração indevida'
       where empresa_id=$1
       returning empresa_id`,
      [company],
    );

    assert.equal(outsiderUpdate.rows.length, 0);
  } finally {
    await db.close();
  }
});
