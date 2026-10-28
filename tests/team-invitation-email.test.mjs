import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database } from "./helpers.mjs";

test("Equipe: opções aparecem dentro do convite, envio explícito e nenhum sucesso de e-mail inventado", () => {
  const component = readFileSync("components/team-permissions.tsx", "utf8");
  assert.match(component, /openInviteToken === item\.token/);
  assert.match(component, /aria-expanded=\{open\}/);
  assert.match(component, /team-invite-options/);
  assert.match(component, /sendInvitationEmail\(item\.token\)/);
  assert.match(component, /inviteMember/);
  assert.match(component, /await sendInvitationEmail\(token\)/);
  assert.match(component, /aceito pelo provedor/);
  assert.match(component, /Copiar link/);
  assert.match(component, /Compartilhar no WhatsApp/);
  assert.match(component, /Revogar convite/);
  assert.doesNotMatch(component, /setGeneratedInvite/);
  const handler = readFileSync("supabase/functions/send-team-invitation-email/index.ts", "utf8");
  assert.match(handler, /team_invitation_email_context/);
  assert.match(handler, /claim_team_invitation_email_send/);
  assert.match(handler, /admin_email_provider_credentials/);
  assert.match(handler, /\/convite\?token=/);
  assert.match(handler, /request\.headers\.get\("authorization"\)/);
  assert.match(handler, /https:\/\/api\.resend\.com\/emails/);
  assert.match(handler, /response\.ok/);
});

test("Equipe: contexto de e-mail bloqueia acesso cruzado e a aceitação exige e-mail confirmado", async () => {
  const db = await database();
  const owner = "bb000000-0000-4000-8000-000000000001";
  const outsider = "bb000000-0000-4000-8000-000000000002";
  const employee = "bb000000-0000-4000-8000-000000000003";
  const asUser = async (id) => {
    await db.exec("reset role;set request.jwt.claim.sub='" + id + "';set request.jwt.claims='{\"aal\":\"aal1\"}';set role authenticated");
  };
  try {
    await db.exec("insert into auth.users(id) values ('" + owner + "'),('" + outsider + "'),('" + employee + "')");
    await db.exec("reset role");
    await db.query("update auth.users set email='convidado@example.test',email_confirmed_at=now() where id=$1", [employee]);
    await asUser(owner);
    const company = (await db.query("select configurar_empresa('Loja Teste','team-args-2026','{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') id")).rows[0].id;
    const invite = (await db.query("select create_team_invitation('Pessoa Teste','convidado@example.test','ATTENDANT') info")).rows[0].info;
    assert.match(invite.token, /^[0-9a-f-]{36}$/i);
    const context = (await db.query("select team_invitation_email_context($1) info", [invite.token])).rows[0].info;
    assert.equal(context.email,"convidado@example.test");
    assert.equal(context.companyName,"Loja Teste");
    assert.equal(context.role,"ATTENDANT");
    const pending=(await db.query("select list_team_invitations() as invites")).rows[0].invites;
    assert.equal(pending.length,1);
    assert.equal(pending[0].emailStatus,"nao_enviado");

    await asUser(outsider);
    await assert.rejects(db.query("select team_invitation_email_context($1)",[invite.token]), /Convite não disponível/);
    await assert.rejects(db.query("select claim_team_invitation_email_send($1)",[invite.token]), /permission denied/i);

    await db.exec("reset role;set role service_role");
    const claimed=(await db.query("select claim_team_invitation_email_send($1) ok",[invite.token])).rows[0].ok;
    assert.equal(claimed,true);
    const throttle=(await db.query("select claim_team_invitation_email_send($1) ok",[invite.token])).rows[0].ok;
    assert.equal(throttle,false);
    await db.query("select finish_team_invitation_email_send($1,true,'provider-fixture',null)",[invite.token]);

    await asUser(owner);
    const updated=(await db.query("select list_team_invitations() invites")).rows[0].invites;
    assert.equal(updated[0].emailStatus,"aceito_pelo_provedor");

    await asUser(employee);
    const accepted=(await db.query("select accept_team_invitation($1) accepted",[invite.token])).rows[0].accepted;
    assert.equal(accepted.role,"ATTENDANT");
    assert.equal(accepted.empresaId,company);

    await asUser(owner);
    const after=(await db.query("select list_team_invitations() invites")).rows[0].invites;
    assert.equal(after.length,0);
  } finally {
    await db.close();
  }
});
