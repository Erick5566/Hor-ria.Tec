import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("auditoria nova: cargos mistos, décima vaga e revogação imediata", async () => {
  const db = await database();
  const owner = "82000000-0000-4000-8000-000000000001";
  const employees = Array.from(
    { length: 11 },
    (_, i) => `82000000-0000-4000-8000-${String(i + 2).padStart(12, "0")}`,
  );
  const asUser = async (id, aal = "aal1") => {
    await db.exec(
      `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"${aal}"}';set role authenticated`,
    );
  };
  const link = async (index) => {
    await db.exec("reset role;set role service_role");
    return db.query("select link_team_member($1,$2,$3,$4,$5)", [
      owner,
      employees[index],
      `Equipe ${index}`,
      `staff${index}@horaria.test`,
      ["TECHNICIAN", "ATTENDANT", "ADMIN"][index % 3],
    ]);
  };

  try {
    await db.exec(
      `insert into auth.users(id) values ${[owner, ...employees].map((id) => `('${id}')`).join(",")}`,
    );
    await db.exec("reset role;set role service_role");
    for (const [i, id] of employees.entries()) {
      await db.query(
        "update public.perfis set nome=$1,email=$2 where usuario_id=$3",
        [`Equipe ${i}`, `staff${i}@horaria.test`, id],
      );
    }
    await asUser(owner);
    const company = (
      await db.query(
        "select configurar_empresa('Equipe por Plano','equipe-por-plano','{}',false,'[{\"nome\":\"Diagnóstico\",\"duracao\":30}]') id",
      )
    ).rows[0].id;

    for (let i = 0; i < 3; i++) await link(i);
    await asUser(owner);
    const basic = (await db.query("select team_members_data() value")).rows[0]
      .value;
    assert.equal(basic.seatLimit, 3);
    assert.equal(basic.seatsUsed, 3);
    assert.equal(basic.planCode, "HORARIA");

    await assert.rejects(link(3), /Limite de 3 funcionários/);
    await asUser(owner);
    await db.query(
      "select update_team_member_access($1,'TECHNICIAN','INACTIVE')",
      [employees[0]],
    );
    await link(3);
    await asUser(owner);
    await assert.rejects(
      db.query("select update_team_member_access($1,'TECHNICIAN','ACTIVE')", [
        employees[0],
      ]),
      /Limite de 3 funcionários/,
    );

    await db.exec("reset role;set role service_role");
    await db.query(
      "update public.perfis set platform_role='SUPER_ADMIN' where usuario_id=$1",
      [owner],
    );
    await asUser(owner, "aal1");
    await assert.rejects(
      db.query("select admin_set_company_team_plan($1,'HORARIA_PRO','teste')", [
        company,
      ]),
      /MFA obrigatória|Verificação em duas etapas necessária/,
    );
    await asUser(owner, "aal2");
    const upgraded = (
      await db.query(
        "select admin_set_company_team_plan($1,'HORARIA_PRO','teste') result",
        [company],
      )
    ).rows[0].result;
    assert.equal(upgraded.seatLimit, 9);

    for (let i = 4; i < 10; i++) await link(i);
    await asUser(owner, "aal2");
    const team = (await db.query("select team_members_data() value")).rows[0]
      .value;
    assert.equal(team.planCode, "HORARIA_PRO");
    assert.equal(team.seatLimit, 9);
    assert.equal(team.seatsUsed, 9);
    await assert.rejects(link(10), /Limite de 9 funcionários/);
    await asUser(owner, "aal2");
    await db.query(
      "select update_team_member_access($1,'ATTENDANT','INACTIVE')",
      [employees[1]],
    );
    await asUser(employees[1]);
    const revoked = (await db.query("select access_context() value")).rows[0]
      .value;
    assert.equal(revoked.company, null);
    await assert.rejects(
      db.query("select team_members_data()"),
      /Sem permissão/,
    );
    await asUser(owner, "aal2");

    await assert.rejects(
      db.query("select admin_set_company_team_plan($1,'HORARIA','teste')", [
        company,
      ]),
      /Desative funcionários excedentes/,
    );

    const context = (await db.query("select access_context() value")).rows[0]
      .value;
    assert.equal(context.billing.monthlyAmount, 80);
    assert.equal(context.billing.initialAmount, 80);
    assert.equal(context.billing.planCode, "HORARIA_PRO");
    const companyRows = (await db.query("select admin_list_companies() value"))
      .rows[0].value;
    const companyRow = companyRows.find((c) => c.id === company);
    assert.equal(Number(companyRow.monthlyValue), 80);

    const payment = (
      await db.query(
        "select admin_confirm_manual_payment($1,$2,'Pro recebido') value",
        [company, "29000000-0000-4000-8000-000000000099"],
      )
    ).rows[0].value;
    assert.equal(Number(payment.amount), 80);
    const finance = (await db.query("select admin_billing_overview() value"))
      .rows[0].value;
    assert.ok(Number(finance.estimatedMrr) >= 80);
  } finally {
    await db.close();
  }
});
