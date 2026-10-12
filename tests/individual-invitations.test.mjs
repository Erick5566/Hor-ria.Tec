import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

for (const inviteRole of ["TECHNICIAN", "ATTENDANT"])
  test(`convite individual ${inviteRole}: destinatário confirmado, uso único, expiração, revogação e gestor desativado`, async () => {
    const db = await database();
    const owner = "85000000-0000-4000-8000-000000000001";
    const target = "85000000-0000-4000-8000-000000000002";
    const outsider = "85000000-0000-4000-8000-000000000003";
    const asUser = async (id) =>
      db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`,
      );
    const create = async () => {
      await asUser(owner);
      return (
        await db.query(
          "select create_team_invitation('Funcionário','invited@horaria.test',$1) value",
          [inviteRole],
        )
      ).rows[0].value.token;
    };
    try {
      await db.exec(
        "alter table auth.users add column email text;alter table auth.users add column email_confirmed_at timestamptz",
      );
      for (const [id, email] of [
        [owner, "owner@horaria.test"],
        [target, "invited@horaria.test"],
        [outsider, "outsider@horaria.test"],
      ]) {
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
          [id, email],
        );
        await db.query("update perfis set email=$2 where usuario_id=$1", [
          id,
          email,
        ]);
      }
      await asUser(owner);
      const company = (
        await db.query(
          `select configurar_empresa('Convites','convites-audit','{}',false,'[{"nome":"Diagnóstico","duracao":30}]') id`,
        )
      ).rows[0].id;
      const token = await create();
      const pending = (await db.query("select list_team_invitations() value"))
        .rows[0].value;
      assert.equal(pending.length, 1);
      assert.equal(pending[0].token, token);
      await asUser(outsider);
      assert.deepEqual(
        (await db.query("select list_team_invitations() value")).rows[0].value,
        [],
      );
      await assert.rejects(
        db.query("select accept_team_invitation($1)", [token]),
        /outro e-mail/,
      );
      await assert.rejects(
        db.query("select create_team_invitation($1,$2,$3)", [
          "Pessoa",
          "p@horaria.test",
          "ADMIN",
        ]),
        /Sem permissão/,
      );
      await db.exec("reset role");
      await db.query(
        "update auth.users set email_confirmed_at=null where id=$1",
        [target],
      );
      await asUser(target);
      await assert.rejects(
        db.query("select accept_team_invitation($1)", [token]),
        /outro e-mail/,
      );
      await db.exec("reset role");
      await db.query(
        "update auth.users set email_confirmed_at=now() where id=$1",
        [target],
      );
      await asUser(target);
      const accepted = (
        await db.query("select accept_team_invitation($1) value", [token])
      ).rows[0].value;
      assert.equal(accepted.empresaId, company);
      assert.equal(accepted.role, inviteRole);
      await assert.rejects(
        db.query("select accept_team_invitation($1)", [token]),
        /inválido/,
      );
      await asUser(owner);
      await db.query(
        "select update_team_member_access($1,'TECHNICIAN','INACTIVE')",
        [target],
      );
      const revoked = await create();
      await db.query("select revoke_team_invitation($1)", [revoked]);
      await asUser(target);
      await assert.rejects(
        db.query("select accept_team_invitation($1)", [revoked]),
        /inválido/,
      );
      const expired = await create();
      await db.exec("reset role");
      await db.query(
        "update private.team_invitations set expires_at=now()-interval '1 second' where token=$1",
        [expired],
      );
      await asUser(target);
      await assert.rejects(
        db.query("select accept_team_invitation($1)", [expired]),
        /expirado/,
      );
      const stale = await create();
      await db.exec("reset role");
      await db.query(
        "update empresa_membros set status='INACTIVE' where empresa_id=$1 and usuario_id=$2",
        [company, owner],
      );
      await asUser(target);
      await assert.rejects(
        db.query("select accept_team_invitation($1)", [stale]),
        /Sem permissão/,
      );
      await db.exec("reset role;set role anon");
      await assert.rejects(
        db.query("select accept_team_invitation($1)", [stale]),
        /permission denied/,
      );
    } finally {
      await db.close();
    }
  });
