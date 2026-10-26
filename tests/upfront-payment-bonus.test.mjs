import {test} from "node:test";
import assert from "node:assert/strict";
import {database} from "./helpers.mjs";

test("nova contratação: PIX exigido agora, acesso após confirmação e 7 dias bônus mais um mês",async()=>{
  const db=await database();
  const owner="c0000000-0000-4000-8000-000000000049";
  try {
    await db.exec("update configuracoes_plataforma set upfront_payment_effective_at=now()-interval '1 day' where id");
    await db.exec(`insert into auth.users values('${owner}');
      set request.jwt.claim.sub='${owner}';
      set request.jwt.claims='{"aal":"aal2"}';
      set role authenticated;`);
    const company=(await db.query("select configurar_empresa($1,$2,'{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') id",["Novo Pagante","primeiro-pix-novo"])).rows[0].id;
    const before=(await db.query("select access_context() c")).rows[0].c;
    assert.equal(before.company.status,"PENDING_PAYMENT");
    assert.equal(before.billing.hasApprovedPayment,false);
    assert.equal((await db.query("select public_company_status($1) s",["primeiro-pix-novo"])).rows[0].s.state,"UNAVAILABLE");
    await assert.rejects(
      db.query("insert into public.servicos(empresa_id,nome,duracao) values($1,'Bloqueado sem pagar',30)",[company]),
      /indisponível|autorizado/i
    );
    await db.exec("reset role");
    await db.query("update perfis set platform_role='SUPER_ADMIN' where usuario_id=$1",[owner]);
    await db.exec("set role authenticated");
    const pay=(await db.query("select admin_confirm_manual_payment($1,$2,$3) p",[
      company,"c0000000-0000-4000-8000-000000000050","Pagamento confirmado em teste"
    ])).rows[0].p;
    assert.equal(Number(pay.amount),44.99);
    assert.equal(pay.kind,"initial");
    const after=(await db.query("select access_context() c")).rows[0].c;
    assert.equal(after.company.status,"ACTIVE");
    assert.equal(after.billing.hasApprovedPayment,true);
    const start=new Date(after.subscription.startedAt).getTime()-Date.now();
    const due=new Date(after.subscription.nextBillingDate).getTime()-Date.now();
    assert.ok(start>6.9*86400000 && start<7.1*86400000);
    assert.ok(due>35*86400000 && due<39*86400000);
    assert.equal((await db.query("select public_company_status($1) s",["primeiro-pix-novo"])).rows[0].s.state,"AVAILABLE");
  }finally{await db.close();}
});
