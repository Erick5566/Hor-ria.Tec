import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("plataforma: permissões, manutenção, suspensão, retenção e limite", async () => {
  const db = await database();
  try {
    const admin = "50000000-0000-0000-0000-000000000001";
    const ownerA = "50000000-0000-0000-0000-000000000002";
    const ownerB = "50000000-0000-0000-0000-000000000003";
    const ownerC = "50000000-0000-0000-0000-000000000004";
    await db.exec(
      `insert into auth.users values('${admin}'),('${ownerA}'),('${ownerB}'),('${ownerC}')`,
    );
    await db.query(
      `update perfis set platform_role='SUPER_ADMIN',nome='Admin Horária',email='admin@horaria.test' where usuario_id=$1`,
      [admin],
    );
    const asUser = (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='${JSON.stringify({ aal: id === admin ? "aal2" : "aal1" })}';set role authenticated`,
      );
    const createCompany = async (id, name, slug) => {
      await asUser(id);
      return (
        await db.query(
          `select configurar_empresa($1,$2,'{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
          [name, slug],
        )
      ).rows[0].id;
    };

    const companyA = await createCompany(ownerA, "Empresa A", "empresa-a");
    const companyB = await createCompany(ownerB, "Empresa B", "empresa-b");
    await db.exec(`reset role`);
    assert.equal(
      (
        await db.query(
          `select private.process_billing_event('test','evt-1','payment.approved',$1,'sub-1','pay-1',now()+interval '1 month',99.9,'BRL','{}') processed`,
          [companyA],
        )
      ).rows[0].processed,
      true,
    );
    assert.equal(
      (
        await db.query(
          `select private.process_billing_event('test','evt-1','payment.approved',$1,'sub-1','pay-1',now()+interval '1 month',99.9,'BRL','{}') processed`,
          [companyA],
        )
      ).rows[0].processed,
      false,
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::integer total from pagamentos where empresa_id=$1`,
          [companyA],
        )
      ).rows[0].total,
      1,
    );
    await asUser(ownerA);
    const clientA = (
      await db.query(
        `insert into clientes(empresa_id,nome,whatsapp) values($1,'Cliente A','11999999991') returning id`,
        [companyA],
      )
    ).rows[0].id;
    await assert.rejects(db.query(`select admin_list_companies()`));

    await asUser(admin);
    const companies = (await db.query(`select admin_list_companies() list`))
      .rows[0].list;
    assert.equal(companies.length, 2);
    await db.query(`select admin_update_company_state($1,'SUSPEND','Teste')`, [
      companyA,
    ]);

    await asUser(ownerA);
    assert.equal((await db.query(`select * from clientes`)).rows.length, 0);
    await assert.rejects(
      db.query(
        `insert into clientes(empresa_id,nome,whatsapp) values($1,'Bloqueado','11999999992')`,
        [companyA],
      ),
    );

    await asUser(ownerB);
    assert.equal(
      (await db.query(`select id from empresas where id=$1`, [companyB])).rows
        .length,
      1,
    );

    await asUser(admin);
    await db.query(`select admin_update_company_state($1,'REACTIVATE','Ok')`, [
      companyA,
    ]);
    await db.query(
      `select admin_update_company_state($1,'ENABLE_MAINTENANCE','Ajuste')`,
      [companyA],
    );
    await asUser(ownerA);
    assert.equal((await db.query(`select * from clientes`)).rows.length, 0);
    await asUser(ownerB);
    assert.equal(
      (await db.query(`select id from empresas where id=$1`, [companyB])).rows
        .length,
      1,
    );

    await asUser(admin);
    await db.query(
      `select admin_update_company_state($1,'DISABLE_MAINTENANCE','Concluído')`,
      [companyA],
    );
    await db.query(
      `select admin_update_platform('{"globalMaintenance":true}','Atualização')`,
    );
    await asUser(ownerA);
    assert.equal((await db.query(`select * from clientes`)).rows.length, 0);
    await asUser(admin);
    assert.equal(
      (await db.query(`select admin_list_companies() list`)).rows[0].list
        .length,
      2,
    );
    await db.query(
      `select admin_update_platform('{"globalMaintenance":false,"maxCompanies":2}','Fim')`,
    );

    await assert.rejects(createCompany(ownerC, "Empresa C", "empresa-c"));
    await db.exec(`reset role;set role anon`);
    const registration = (await db.query(`select registration_status() value`))
      .rows[0].value;
    assert.equal(registration.enabled, false);

    await asUser(admin);
    await db.query(
      `select admin_update_company_state($1,'CANCEL','Solicitado')`,
      [companyA],
    );
    // SUPER_ADMIN administra por RPC, sem leitura direta dos dados do tenant.
    assert.equal((await db.query(`select * from clientes`)).rows.length, 0);
    await db.exec(`reset role`);
    const retained = (
      await db.query(
        `select count(*)::integer total from clientes where id=$1`,
        [clientA],
      )
    ).rows[0].total;
    assert.equal(retained, 1);
    const canceled = (
      await db.query(
        `select status,scheduled_deletion_at is not null scheduled from empresas where id=$1`,
        [companyA],
      )
    ).rows[0];
    assert.deepEqual(canceled, { status: "CANCELED", scheduled: true });
    assert.ok(
      (
        await db.query(`select * from admin_audit_logs where empresa_id=$1`, [
          companyA,
        ])
      ).rows.length >= 5,
    );
  } finally {
    await db.close();
  }
});
