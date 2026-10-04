import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("assinatura: vencimento vira pendência e depois suspensão sem cron", async () => {
  const db = await database();

  try {
    const owner = "10000000-0000-4000-8000-000000000096";

    await db.exec(`
      insert into auth.users values ('${owner}');
      set request.jwt.claim.sub='${owner}';
      set role authenticated;
    `);

    const company = (
      await db.query(
        `select configurar_empresa(
          'Empresa Vencimento',
          'empresa-vencimento',
          '{}',
          false,
          '[{"nome":"Reparo","duracao":30}]'
        ) as id`,
      )
    ).rows[0].id;

    const readContext = async () =>
      (
        await db.query("select access_context() as result")
      ).rows[0].result;

    const readPublicStatus = async () =>
      (
        await db.query(
          "select public_company_status('empresa-vencimento') as result",
        )
      ).rows[0].result;

    let context = await readContext();
    assert.equal(context.company.status, "TRIAL");
    assert.equal(context.subscription.status, "TRIAL");

    await db.exec(`
      reset role;
      update public.assinaturas
      set status='TRIAL',
          trial_ends_at=now()-interval '1 day',
          next_billing_date=now()-interval '1 day'
      where empresa_id='${company}';
      update public.empresas set status='TRIAL' where id='${company}';
      set role authenticated;
    `);

    context = await readContext();
    assert.equal(context.company.status, "PAST_DUE");
    assert.equal(context.subscription.status, "PAST_DUE");
    assert.equal((await readPublicStatus()).state, "AVAILABLE");

    await db.exec(`
      reset role;
      update public.assinaturas
      set trial_ends_at=now()-interval '4 days',
          next_billing_date=now()-interval '4 days'
      where empresa_id='${company}';
      set role authenticated;
    `);

    context = await readContext();
    assert.equal(context.company.status, "SUSPENDED");
    assert.equal(context.subscription.status, "SUSPENDED");
    assert.equal((await readPublicStatus()).state, "UNAVAILABLE");

    await db.exec(`
      reset role;
      update public.assinaturas
      set status='ACTIVE',
          next_billing_date=now()+interval '1 day'
      where empresa_id='${company}';
      update public.empresas set status='ACTIVE' where id='${company}';
      set role authenticated;
    `);

    context = await readContext();
    assert.equal(context.company.status, "ACTIVE");
    assert.equal(context.subscription.status, "ACTIVE");

    await db.exec(`
      reset role;
      update public.assinaturas
      set next_billing_date=now()-interval '1 day'
      where empresa_id='${company}';
      set role authenticated;
    `);

    context = await readContext();
    assert.equal(context.company.status, "PAST_DUE");
    assert.equal(context.subscription.status, "PAST_DUE");
    assert.equal((await readPublicStatus()).state, "AVAILABLE");

    await db.exec(`
      reset role;
      update public.assinaturas
      set next_billing_date=now()-interval '4 days'
      where empresa_id='${company}';
      set role authenticated;
    `);

    context = await readContext();
    assert.equal(context.company.status, "SUSPENDED");
    assert.equal(context.subscription.status, "SUSPENDED");
    assert.equal((await readPublicStatus()).state, "UNAVAILABLE");

    await db.exec(`
      reset role;
      update public.perfis
      set platform_role='SUPER_ADMIN'
      where usuario_id='${owner}';
      set request.jwt.claims='{"aal":"aal2"}';
      set role authenticated;
    `);

    const adminCompanies = (
      await db.query("select admin_list_companies() as result")
    ).rows[0].result;
    const adminCompany = adminCompanies.find(
      (item) => item.slug === "empresa-vencimento",
    );

    assert.equal(adminCompany.status, "SUSPENDED");
    assert.equal(adminCompany.subscriptionStatus, "SUSPENDED");

    const adminDetail = (
      await db.query("select admin_company_detail($1) as result", [company])
    ).rows[0].result;
    assert.equal(adminDetail.status, "SUSPENDED");
    assert.equal(adminDetail.subscription.status, "SUSPENDED");
  } finally {
    await db.close();
  }
});
