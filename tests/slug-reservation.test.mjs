import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("slug: termos é reservado no backend e no banco", async () => {
  const db = await database();
  try {
    const owner = "78000000-0000-0000-0000-000000000001";
    await db.exec(
      `insert into auth.users values('${owner}');
       set request.jwt.claim.sub='${owner}';
       set role authenticated`,
    );

    const company = (
      await db.query(
        `select configurar_empresa(
          'Slug Seguro',
          'slug-seguro',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const result = (
      await db.query("select verificar_slug_pagina('termos',$1) data", [company])
    ).rows[0].data;

    assert.equal(result.disponivel, false);
    assert.equal(result.motivo, "invalido");

    await db.exec("reset role");
    await assert.rejects(
      db.query("update empresas set slug='termos' where id=$1", [company]),
      /empresas_slug_not_terms/,
    );
  } finally {
    await db.close();
  }
});
