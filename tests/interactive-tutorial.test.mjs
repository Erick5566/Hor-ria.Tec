import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { database } from "./helpers.mjs";

test("tutorial: somente cadastros novos iniciam automaticamente, progresso individual entre sessões", async () => {
  const db = await database();
  const older = "a8000000-0000-4000-8000-000000000001";
  const newer = "a8000000-0000-4000-8000-000000000002";
  const other = "a8000000-0000-4000-8000-000000000003";
  const as = async (id) => db.exec(
    `reset role;set request.jwt.claim.sub='${id}';set role authenticated`,
  );
  try {
    await db.exec(
      `insert into auth.users(id) values ('${older}'),('${newer}'),('${other}')`,
    );
    await db.exec("reset role;set role service_role");
    await db.query(
      "update public.perfis set criado_em = now() - interval '7 days' where usuario_id=$1",
      [older],
    );
    await db.query(
      "update public.perfis set criado_em = now() + interval '1 minute' where usuario_id in ($1,$2)",
      [newer, other],
    );
    await as(older);
    const existing = (await db.query("select tutorial_get_progress() value")).rows[0].value;
    assert.equal(existing.eligible, false);
    assert.equal(existing.status, null);

    await as(newer);
    const initial = (await db.query("select tutorial_get_progress() value")).rows[0].value;
    assert.equal(initial.eligible, true);
    assert.equal(initial.status, null);
    assert.equal(initial.step, 0);
    await db.query("select tutorial_save_progress(4,'ACTIVE')");
    await db.query("select tutorial_save_progress(7,'PAUSED')");
    const paused = (await db.query("select tutorial_get_progress() value")).rows[0].value;
    assert.equal(paused.step, 7);
    assert.equal(paused.status, "PAUSED");
    await assert.rejects(db.query("select tutorial_save_progress(999,'ACTIVE')"), /Progresso inválido/);
    await assert.rejects(db.query("select tutorial_save_progress(2,'FREE')"), /Progresso inválido/);

    await as(other);
    const isolated = (await db.query("select tutorial_get_progress() value")).rows[0].value;
    assert.equal(isolated.status, null);
    assert.equal(isolated.step, 0);
    await as(older);
    await db.query("select tutorial_save_progress(2,'COMPLETED')");
    const manual = (await db.query("select tutorial_get_progress() value")).rows[0].value;
    assert.equal(manual.status, "COMPLETED");

    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select tutorial_get_progress()"), /permission denied/i);
    await assert.rejects(db.query("select tutorial_save_progress(1,'ACTIVE')"), /permission denied/i);
  } finally {
    await db.close();
  }
});

test("tutorial: oferece prática sem cadastrar cliente, OS ou enviar convite sozinho", async () => {
  const guide = await readFile("components/interactive-tutorial.tsx", "utf8");
  const links = await readFile("components/workspace.tsx", "utf8");
  const help = await readFile("components/admin-module.tsx", "utf8");
  assert.match(guide, /buildTutorialSteps/);
  assert.match(guide, /customer-create/);
  assert.match(guide, /customer-name/);
  assert.match(guide, /order-customer/);
  assert.match(guide, /team-add/);
  assert.match(guide, /tutorial_get_progress/);
  assert.match(guide, /tutorial_save_progress/);
  assert.doesNotMatch(guide, /\.from\(["']clientes["']\)|\.from\(["']ordens_servico["']\)/);
  assert.match(links, /data-tour-href=\{href\}/);
  assert.match(links, /data-tour-href=\{item.href\}/);
  assert.match(help, /Rever tutorial interativo/);
});
