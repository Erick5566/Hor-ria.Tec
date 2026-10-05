import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("cobrança: enfileira e-mails únicos para tolerância de 24h e pagamento aprovado", async () => {
  const db = await database();

  try {
    const admin = "10000000-0000-4000-8000-000000000121";
    const confirmation = "20000000-0000-4000-8000-000000000122";

    await db.exec(`
      insert into auth.users values ('${admin}');
      update public.perfis
      set nome='Admin Billing', email='admin-billing@example.invalid', platform_role='SUPER_ADMIN'
      where usuario_id='${admin}';
      set request.jwt.claim.sub='${admin}';
      set request.jwt.claims='{"aal":"aal2"}';
      set role authenticated;
    `);

    const company = (
      await db.query(
        `select configurar_empresa(
          'Empresa Alertas',
          'empresa-alertas',
          '{}',
          false,
          '[{"nome":"Reparo","duracao":30}]'
        ) as id`,
      )
    ).rows[0].id;

    await db.exec(`
      reset role;
      update public.assinaturas
      set status='TRIAL',
          trial_ends_at=now()-interval '12 hours',
          next_billing_date=now()-interval '12 hours'
      where empresa_id='${company}';
      update public.empresas
      set status='TRIAL'
      where id='${company}';
    `);

    const firstDue = (
      await db.query(
        "select private.enqueue_admin_billing_due_notifications() as count",
      )
    ).rows[0].count;
    const secondDue = (
      await db.query(
        "select private.enqueue_admin_billing_due_notifications() as count",
      )
    ).rows[0].count;

    assert.equal(Number(firstDue), 1);
    assert.equal(Number(secondDue), 0);

    const dueAlerts = (
      await db.query(
        `select event_type,recipient,subject,payload,status
         from public.admin_email_notifications
         where empresa_id=$1 and event_type='billing_grace_started'`,
        [company],
      )
    ).rows;

    assert.equal(dueAlerts.length, 1);
    assert.equal(dueAlerts[0].recipient, "horariaagenda@gmail.com");
    assert.match(dueAlerts[0].subject, /24h de tolerância/);
    assert.equal(Number(dueAlerts[0].payload.amountDue), 44.99);
    assert.equal(dueAlerts[0].status, "pending");

    await db.exec(`
      set request.jwt.claim.sub='${admin}';
      set request.jwt.claims='{"aal":"aal2"}';
      set role authenticated;
    `);

    const payment = (
      await db.query(
        "select admin_confirm_manual_payment($1,$2,$3) as result",
        [company, confirmation, "Pagamento conferido"],
      )
    ).rows[0].result;

    assert.equal(payment.duplicate, false);

    await db.exec("reset role");

    const paymentAlerts = (
      await db.query(
        `select event_type,recipient,subject,payload,status
         from public.admin_email_notifications
         where empresa_id=$1 and event_type='payment_approved'`,
        [company],
      )
    ).rows;

    assert.equal(paymentAlerts.length, 1);
    assert.equal(paymentAlerts[0].recipient, "horariaagenda@gmail.com");
    assert.match(paymentAlerts[0].subject, /Pagamento confirmado/);
    assert.equal(Number(paymentAlerts[0].payload.amount), 44.99);
    assert.equal(paymentAlerts[0].payload.paymentKind, "initial");
    assert.equal(paymentAlerts[0].status, "pending");

    await db.exec(`
      set request.jwt.claim.sub='${admin}';
      set request.jwt.claims='{"aal":"aal2"}';
      set role authenticated;
    `);

    const duplicate = (
      await db.query(
        "select admin_confirm_manual_payment($1,$2,$3) as result",
        [company, confirmation, "Repetição"],
      )
    ).rows[0].result;

    assert.equal(duplicate.duplicate, true);

    await db.exec("reset role");
    const finalCount = (
      await db.query(
        `select count(*)::int as count
         from public.admin_email_notifications
         where empresa_id=$1 and event_type='payment_approved'`,
        [company],
      )
    ).rows[0].count;

    assert.equal(finalCount, 1);

    await db.exec(`
      set request.jwt.claim.sub='${admin}';
      set role authenticated;
    `);

    await assert.rejects(
      db.query("select * from public.admin_email_notifications limit 1"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
