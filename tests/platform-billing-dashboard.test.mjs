import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("admin billing: consolida receita, despesa, inadimplência e preços centrais", async () => {
  const db = await database();

  try {
    const admin = "10000000-0000-4000-8000-000000000097";
    const outsider = "10000000-0000-4000-8000-000000000098";
    const confirmation = "20000000-0000-4000-8000-000000000097";

    await db.exec(`
      insert into auth.users values ('${admin}'), ('${outsider}');
      update public.perfis
      set nome='Admin Financeiro', email='admin-finance@example.invalid',
          platform_role='SUPER_ADMIN'
      where usuario_id='${admin}';
      update public.perfis
      set nome='Usuário', email='outsider@example.invalid', platform_role='USER'
      where usuario_id='${outsider}';
      set request.jwt.claim.sub='${admin}';
      set request.jwt.claims='{"aal":"aal2"}';
      set role authenticated;
    `);

    const company = (
      await db.query(
        `select configurar_empresa(
          'Empresa Dashboard',
          'empresa-dashboard',
          '{}',
          false,
          '[{"nome":"Reparo","duracao":30}]'
        ) as id`,
      )
    ).rows[0].id;

    const context = (
      await db.query("select access_context() as result")
    ).rows[0].result;

    assert.equal(Number(context.billing.graceHours), 24);
    assert.equal(Number(context.billing.initialAmount), 44.99);
    assert.equal(Number(context.billing.monthlyAmount), 59);
    assert.equal(context.billing.hasApprovedPayment, false);

    const expense = (
      await db.query(
        `select admin_add_platform_expense(
          'Infraestrutura de teste',
          10,
          'infraestrutura',
          current_date,
          false,
          'Teste automatizado'
        ) as result`,
      )
    ).rows[0].result;

    assert.equal(Number(expense.amount), 10);

    let overview = (
      await db.query("select admin_billing_overview() as result")
    ).rows[0].result;

    assert.equal(Number(overview.expensesThisMonth), 10);
    assert.equal(Number(overview.receivedThisMonth), 0);
    assert.equal(Number(overview.netThisMonth), -10);

    const payment = (
      await db.query(
        "select admin_confirm_manual_payment($1,$2,$3) as result",
        [company, confirmation, "Pagamento do teste"],
      )
    ).rows[0].result;

    assert.equal(Number(payment.amount), 44.99);

    const paidContext = (
      await db.query("select access_context() as result")
    ).rows[0].result;
    assert.equal(paidContext.billing.hasApprovedPayment, true);

    overview = (
      await db.query("select admin_billing_overview() as result")
    ).rows[0].result;

    assert.equal(Number(overview.receivedThisMonth), 44.99);
    assert.equal(Number(overview.expensesThisMonth), 10);
    assert.equal(Number(overview.netThisMonth), 34.99);
    assert.equal(Number(overview.estimatedMrr), 59);

    await db.exec(`
      reset role;
      update public.assinaturas
      set status='ACTIVE',
          next_billing_date=now()-interval '12 hours'
      where empresa_id='${company}';
      update public.empresas
      set status='ACTIVE'
      where id='${company}';
      set role authenticated;
    `);

    overview = (
      await db.query("select admin_billing_overview() as result")
    ).rows[0].result;
    assert.equal(Number(overview.pendingCount), 1);
    assert.equal(Number(overview.receivableTotal), 59);

    const companies = (
      await db.query("select admin_list_companies() as result")
    ).rows[0].result;
    const companyRow = companies.find((item) => item.id === company);
    assert.equal(companyRow.status, "PAST_DUE");
    assert.equal(Number(companyRow.amountDue), 59);

    const expenses = (
      await db.query("select admin_list_platform_expenses(50) as result")
    ).rows[0].result;
    assert.equal(expenses.length, 1);

    await db.exec(`
      set request.jwt.claim.sub='${outsider}';
      set request.jwt.claims='{"aal":"aal2"}';
    `);

    await assert.rejects(
      db.query(
        "select admin_add_platform_expense('Não autorizado',1,'outros',current_date,false,null)",
      ),
      /Acesso administrativo negado/,
    );
  } finally {
    await db.close();
  }
});
