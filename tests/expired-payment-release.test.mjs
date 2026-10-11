import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("billing: expired account is released by a simulated approved event, with one email and no duplicate renewal", async () => {
  const db = await database();
  try {
    const owner = "82000000-0000-4000-8000-000000000001";
    await db.exec(
      `insert into auth.users values('${owner}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const company = (
      await db.query(
        `select configurar_empresa('Homologação isolada','homologacao-isolada','{}',false,'[{"nome":"Reparo","duracao":30}]') as id`,
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "update assinaturas set trial_ends_at=now()-interval '2 days',next_billing_date=now()-interval '2 days' where empresa_id=$1",
      [company],
    );
    await db.exec("set role authenticated");
    const context = async () =>
      (await db.query("select access_context() as data")).rows[0].data;
    assert.equal((await context()).company.status, "SUSPENDED");
    await db.exec("reset role");
    const approve = async (event) =>
      (
        await db.query(
          `select private.process_billing_event('sandbox',$1,'payment.approved',$2,null,'sandbox-payment',null,44.99,'BRL','{}') processed`,
          [event, company],
        )
      ).rows[0].processed;
    assert.equal(await approve("sandbox-approved"), true);
    await db.exec("set role authenticated");
    const released = await context();
    assert.equal(released.company.status, "ACTIVE");
    assert.equal(released.subscription.status, "ACTIVE");
    assert.equal(released.billing.hasApprovedPayment, true);
    await db.exec("reset role");
    assert.equal(await approve("sandbox-approved"), false);
    assert.equal(await approve("sandbox-redelivery"), false);
    const notification = (
      await db.query(
        "select payload,status from admin_email_notifications where empresa_id=$1 and event_type='payment_approved'",
        [company],
      )
    ).rows;
    assert.equal(notification.length, 1);
    assert.equal(notification[0].status, "pending");
    assert.equal(notification[0].payload.status, "ACTIVE");
    assert.equal(
      new Date(notification[0].payload.nextBillingDate).getTime(),
      new Date(released.subscription.nextBillingDate).getTime(),
    );
    await db.exec("set role authenticated");
    assert.equal(
      (await context()).subscription.nextBillingDate,
      released.subscription.nextBillingDate,
    );
  } finally {
    await db.close();
  }
});
