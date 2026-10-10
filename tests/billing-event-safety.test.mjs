import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

async function fixture(run) {
  const db = await database();
  try {
    const companies = [];
    for (let i = 1; i <= 2; i++) {
      const user = `91000000-0000-4000-8000-00000000000${i}`;
      await db.exec(
        `reset role; insert into auth.users values('${user}'); set request.jwt.claim.sub='${user}'; set role authenticated`,
      );
      companies.push(
        (
          await db.query(
            `select configurar_empresa($1,$2,'{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
            [`Billing ${i}`, `billing-${i}`],
          )
        ).rows[0].id,
      );
    }
    await db.exec("reset role");
    const send = async (
      eventId,
      company,
      {
        type = "payment.approved",
        payment = eventId,
        amount = 44.99,
        currency = "BRL",
        due = null,
      } = {},
    ) =>
      (
        await db.query(
          `select private.process_billing_event('sandbox',$1,$2,$3::uuid,'subscription-'||($3::uuid)::text,$4,$5,$6,$7,'{}') processed`,
          [eventId, type, company, payment, due, amount, currency],
        )
      ).rows[0].processed;
    const state = async (company) =>
      (
        await db.query(
          `select a.status,a.next_billing_date,e.status company_status from assinaturas a join empresas e on e.id=a.empresa_id where e.id=$1`,
          [company],
        )
      ).rows[0];
    await run({ db, companies, send, state });
  } finally {
    await db.close();
  }
}

test("billing: subscription.created never grants paid access", () =>
  fixture(async ({ companies: [a], send, state }) => {
    await send("created", a, { type: "subscription.created", payment: null });
    assert.equal((await state(a)).status, "TRIAL");
    assert.equal((await state(a)).company_status, "TRIAL");
  }));

test("billing: missing payment, wrong amount/currency and expired due date fail atomically", () =>
  fixture(async ({ db, companies: [a], send, state }) => {
    for (const [i, options] of [
      { payment: null },
      { amount: 0 },
      { amount: 0.01 },
      { currency: "USD" },
      { due: "2020-01-01T00:00:00Z" },
    ].entries()) {
      await assert.rejects(send(`invalid-${i}`, a, options));
    }
    assert.equal((await state(a)).status, "TRIAL");
    assert.equal(
      (await db.query("select count(*)::int n from pagamentos")).rows[0].n,
      0,
    );
  }));

test("billing: payment identity is tenant-bound and duplicate delivery cannot renew again", () =>
  fixture(async ({ db, companies: [a, b], send, state }) => {
    await send("approved", a, { payment: "same-payment" });
    const before = await state(a);
    assert.equal(
      await send("approved-again", a, {
        payment: "same-payment",
        due: "2099-01-01T00:00:00Z",
      }),
      false,
    );
    assert.deepEqual(await state(a), before);
    await assert.rejects(send("cross-tenant", b, { payment: "same-payment" }));
    assert.equal((await state(b)).status, "TRIAL");
    assert.equal(
      (await db.query("select count(*)::int n from pagamentos")).rows[0].n,
      1,
    );
  }));

test("billing: rejected then approved payment is reconciled and late rejection cannot revoke it", () =>
  fixture(async ({ db, companies: [a], send, state }) => {
    await send("failed", a, {
      type: "payment.failed",
      payment: "retry-payment",
    });
    await send("paid", a, { payment: "retry-payment" });
    assert.equal(
      (
        await db.query(
          "select status from pagamentos where external_payment_id='retry-payment'",
        )
      ).rows[0].status,
      "APPROVED",
    );
    await send("late-failed", a, {
      type: "payment.failed",
      payment: "retry-payment",
    });
    assert.equal((await state(a)).status, "ACTIVE");
  }));

test("billing: approved payment preserves administrative suspension and commercial periods", () =>
  fixture(async ({ db, companies: [a], send, state }) => {
    await db.query("update empresas set status='SUSPENDED' where id=$1", [a]);
    await db.query(
      "update assinaturas set status='SUSPENDED' where empresa_id=$1",
      [a],
    );
    await send("paid-suspended", a);
    assert.equal((await state(a)).company_status, "SUSPENDED");
    assert.equal((await state(a)).status, "SUSPENDED");
    const initialDue = (await state(a)).next_billing_date;
    const days = (new Date(initialDue) - Date.now()) / 86400000;
    assert.ok(days > 6.99 && days <= 7.01);
    await send("renewal", a, { amount: 49 });
    assert.ok(
      new Date((await state(a)).next_billing_date) > new Date(initialDue),
    );
  }));
