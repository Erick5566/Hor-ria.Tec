import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("billing grace: exact 24h boundary, timezone and cron deduplication", async () => {
  const db = await database();
  try {
    const company = await fixture(db);
    await db.exec("begin");
    for (const [offset, status, count] of [
      ["1 minute", "TRIAL", 0],
      ["0 seconds", "TRIAL", 0],
      ["-12 hours", "PAST_DUE", 1],
      ["-24 hours", "PAST_DUE", 1],
      ["-24 hours -1 second", "SUSPENDED", 0],
    ]) {
      await db.query(
        "update assinaturas set status='TRIAL',trial_ends_at=now()+$2::interval,next_billing_date=now()+$2::interval where empresa_id=$1",
        [company, offset],
      );
      for (const timezone of ["UTC", "America/Sao_Paulo"]) {
        await db.query("select set_config('TimeZone',$1,false)", [timezone]);
        assert.equal(
          (
            await db.query(
              "select private.effective_company_status($1) status",
              [company],
            )
          ).rows[0].status,
          status,
        );
      }
      assert.equal(
        (
          await db.query(
            "select private.enqueue_admin_billing_due_notifications() count",
          )
        ).rows[0].count,
        count,
      );
      assert.equal(
        (
          await db.query(
            "select private.enqueue_admin_billing_due_notifications() count",
          )
        ).rows[0].count,
        0,
      );
    }
    await db.exec("rollback");
  } finally {
    await db.close();
  }
});

async function fixture(db) {
  const owner = "10000000-0000-4000-8000-000000000181";
  await db.exec(`insert into auth.users values('${owner}');
    update public.perfis set platform_role='SUPER_ADMIN' where usuario_id='${owner}';
    set request.jwt.claim.sub='${owner}';set request.jwt.claims='{"aal":"aal2"}';set role authenticated;`);
  const company = (
    await db.query(
      "select configurar_empresa('Billing audit','billing-audit','{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') id",
    )
  ).rows[0].id;
  await db.exec("reset role");
  return company;
}

test("billing email: payment payload matches the final subscription status and dates", async () => {
  const db = await database();
  try {
    const company = await fixture(db);
    for (const [index, amount] of [
      [1, 44.99],
      [2, 49],
    ]) {
      await db.exec("set role authenticated");
      const result = (
        await db.query(
          "select admin_confirm_manual_payment($1,$2,'Audit') result",
          [company, `20000000-0000-4000-8000-00000000018${index}`],
        )
      ).rows[0].result;
      await db.exec("reset role");
      const snapshot = (
        await db.query(
          `select n.payload,a.status,a.next_billing_date
        from admin_email_notifications n join assinaturas a on a.id=n.assinatura_id where n.pagamento_id=$1`,
          [result.paymentId],
        )
      ).rows[0];
      assert.equal(snapshot.payload.status, snapshot.status);
      assert.equal(Number(snapshot.payload.amount), amount);
      assert.equal(
        new Date(snapshot.payload.nextBillingDate).getTime(),
        new Date(snapshot.next_billing_date).getTime(),
      );
    }
  } finally {
    await db.close();
  }
});

test("billing retry: expired processing is recoverable and active workers are not reclaimed", async () => {
  const db = await database();
  try {
    const company = await fixture(db);
    await db.exec(`create schema net;create table net.calls(body jsonb);
      create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000)
      returns bigint language plpgsql as $$begin insert into net.calls values(body);return 1;end$$;`);
    const stale = (
      await db.query(
        `insert into admin_email_notifications(event_type,empresa_id,recipient,subject,unique_key,status,last_attempt_at)
      values('payment_approved',$1,'test@example.invalid','Audit','audit-stale','processing',now()-interval '11 minutes') returning id`,
        [company],
      )
    ).rows[0].id;
    await db.query(
      `insert into admin_email_notifications(event_type,empresa_id,recipient,subject,unique_key,status,last_attempt_at)
      values('payment_approved',$1,'test@example.invalid','Audit','audit-active','processing',now())`,
      [company],
    );
    assert.equal(
      (await db.query("select private.retry_admin_email_notifications() count"))
        .rows[0].count,
      1,
    );
    assert.equal(
      (await db.query("select body->>'id' id from net.calls")).rows[0].id,
      stale,
    );
    assert.equal(
      (await db.query("select private.retry_admin_email_notifications() count"))
        .rows[0].count,
      0,
    );
  } finally {
    await db.close();
  }
});
