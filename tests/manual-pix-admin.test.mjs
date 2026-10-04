import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("admin: confirmação manual do Pix é segura, idempotente e renova a assinatura", async () => {
  const db = await database();

  try {
    const admin = "10000000-0000-4000-8000-000000000090";
    const outsider = "10000000-0000-4000-8000-000000000094";
    const firstConfirmation = "20000000-0000-4000-8000-000000000091";
    const renewalConfirmation = "20000000-0000-4000-8000-000000000092";

    await db.exec(`
      insert into auth.users values ('${admin}'), ('${outsider}');
      insert into public.perfis(usuario_id,nome,email,platform_role)
      values
        ('${admin}','Admin','admin@example.invalid','SUPER_ADMIN'),
        ('${outsider}','Usuário','user@example.invalid','USER');
      set request.jwt.claim.sub='${admin}';
      set request.jwt.claims='{"aal":"aal2"}';
      set role authenticated;
    `);

    const company = (
      await db.query(
        `select configurar_empresa(
          'Empresa Pix',
          'empresa-pix',
          '{}',
          false,
          '[{"nome":"Reparo","duracao":30}]'
        ) as id`,
      )
    ).rows[0].id;

    const before = (
      await db.query(
        "select next_billing_date from public.assinaturas where empresa_id=$1",
        [company],
      )
    ).rows[0].next_billing_date;

    const initial = (
      await db.query(
        "select admin_confirm_manual_payment($1,$2,$3) as result",
        [company, firstConfirmation, "Recebido no banco"],
      )
    ).rows[0].result;

    assert.equal(Number(initial.amount), 44.99);
    assert.equal(initial.kind, "initial");
    assert.equal(initial.duplicate, false);

    const afterInitial = (
      await db.query(
        "select status,next_billing_date from public.assinaturas where empresa_id=$1",
        [company],
      )
    ).rows[0];

    assert.equal(afterInitial.status, "ACTIVE");
    assert.equal(
      new Date(afterInitial.next_billing_date).getTime(),
      new Date(before).getTime(),
    );

    assert.equal(
      Number(
        (
          await db.query(
            "select count(*) as total from public.pagamentos where empresa_id=$1 and status='APPROVED'",
            [company],
          )
        ).rows[0].total,
      ),
      1,
    );

    const duplicate = (
      await db.query(
        "select admin_confirm_manual_payment($1,$2,$3) as result",
        [company, firstConfirmation, "Repetição da mesma requisição"],
      )
    ).rows[0].result;

    assert.equal(duplicate.duplicate, true);
    assert.equal(
      Number(
        (
          await db.query(
            "select count(*) as total from public.pagamentos where empresa_id=$1",
            [company],
          )
        ).rows[0].total,
      ),
      1,
    );

    const renewal = (
      await db.query(
        "select admin_confirm_manual_payment($1,$2,$3) as result",
        [company, renewalConfirmation, "Mensalidade recebida"],
      )
    ).rows[0].result;

    assert.equal(Number(renewal.amount), 59);
    assert.equal(renewal.kind, "monthly");
    assert.equal(renewal.duplicate, false);
    assert.ok(
      new Date(renewal.nextBillingDate).getTime() >
        new Date(afterInitial.next_billing_date).getTime(),
    );

    const audit = (
      await db.query(
        "select count(*) as total from public.admin_audit_logs where empresa_id=$1 and action='MANUAL_PAYMENT_APPROVED'",
        [company],
      )
    ).rows[0].total;

    assert.equal(Number(audit), 2);

    await db.exec(`
      set request.jwt.claim.sub='${outsider}';
      set request.jwt.claims='{"aal":"aal2"}';
    `);

    await assert.rejects(
      db.query(
        "select admin_confirm_manual_payment($1,$2,$3)",
        [
          company,
          "20000000-0000-4000-8000-000000000093",
          "Tentativa sem privilégio",
        ],
      ),
      /Acesso administrativo negado/,
    );
  } finally {
    await db.close();
  }
});
