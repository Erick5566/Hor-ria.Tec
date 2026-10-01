import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("fotos: membro ativo da equipe pode registrar foto sem ampliar acesso entre empresas", async () => {
  const db = await database();
  try {
    const owner = "72000000-0000-0000-0000-000000000001";
    const technician = "72000000-0000-0000-0000-000000000002";
    const outsider = "72000000-0000-0000-0000-000000000003";

    await db.exec(
      `insert into auth.users values
        ('${owner}'),('${technician}'),('${outsider}')`,
    );

    const asUser = (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`,
      );

    await asUser(owner);
    const companyId = (
      await db.query(
        `select configurar_empresa(
          'Fotos Equipe',
          'fotos-equipe',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) id`,
      )
    ).rows[0].id;

    const orderId = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        companyId,
        { nome: "Cliente Foto", whatsapp: "11999999999" },
        { categoria: "Celular", modelo: "Teste" },
        { problema: "Tela quebrada" },
      ])
    ).rows[0].id;

    await db.exec("reset role;set role service_role");
    await db.query(
      `select link_team_member(
        $1,
        $2,
        'Técnico Foto',
        'tecnico-foto@horaria.test',
        'TECHNICIAN'
      )`,
      [owner, technician],
    );

    await asUser(technician);
    const path = `${companyId}/${orderId}/equipe/tecnico.jpg`;

    await db.query(
      "insert into storage.objects(bucket_id,name) values('os-fotos',$1)",
      [path],
    );

    const photoId = (
      await db.query(
        "select registrar_foto($1,'Entrada','Foto feita pelo técnico') id",
        [path],
      )
    ).rows[0].id;

    assert.ok(photoId);
    assert.equal(
      (
        await db.query(
          "select count(*)::int total from fotos_os where ordem_id=$1",
          [orderId],
        )
      ).rows[0].total,
      1,
    );

    await asUser(outsider);
    await assert.rejects(
      db.query(
        "select registrar_foto($1,'Entrada','Tentativa externa')",
        [path],
      ),
      /Upload não autorizado/,
    );
  } finally {
    await db.close();
  }
});
