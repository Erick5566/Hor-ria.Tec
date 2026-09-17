import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("página pública: somente gestores editam e perfil não expõe dados internos", async () => {
  const db = await database();
  try {
    const owner = "10000000-0000-0000-0000-000000000001";
    const tech = "10000000-0000-0000-0000-000000000002";
    const outsider = "10000000-0000-0000-0000-000000000003";
    await db.exec(
      `insert into auth.users values('${owner}'),('${tech}'),('${outsider}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const company = (
      await db.query(
        `select configurar_empresa('Página Segura','pagina-segura','{}',false,'[{"nome":"Tela","duracao":30}]') id`,
      )
    ).rows[0].id;
    await db.exec(`reset role`);
    await db.query(
      `insert into empresa_membros(empresa_id,usuario_id,role) values($1,$2,'TECHNICIAN')`,
      [company, tech],
    );
    await db.exec(`set role authenticated`);
    await db.query(
      `update pagina_publica_config set headline='Reparo profissional',mostrar_vitrine=false where empresa_id=$1`,
      [company],
    );
    await db.exec(`set request.jwt.claim.sub='${tech}'`);
    assert.equal(
      (await db.query(`select * from pagina_publica_config`)).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `update pagina_publica_config set headline='Invasão' where empresa_id=$1 returning empresa_id`,
          [company],
        )
      ).rows.length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${outsider}'`);
    assert.equal(
      (await db.query(`select * from pagina_publica_config`)).rows.length,
      0,
    );
    await db.exec(`set role anon;set request.jwt.claim.sub=''`);
    const profile = (
      await db.query(`select perfil_assistencia('pagina-segura') perfil`)
    ).rows[0].perfil;
    assert.equal(profile.pagina.headline, "Reparo profissional");
    assert.equal(profile.pagina.mostrar_vitrine, false);
    assert.equal("dono_id" in profile, false);
    assert.equal("documento" in profile, false);
  } finally {
    await db.close();
  }
});
