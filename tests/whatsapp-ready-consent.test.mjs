import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { database } from "./helpers.mjs";

test("Aviso pronto: exige consentimento explícito, Plus e WhatsApp habilitado, sem duplicar envios", async()=>{
  const db=await database();
  const owner="cd000000-0000-4000-8000-000000000001";
  const asOwner=async()=>db.exec(
    `reset role;set request.jwt.claim.sub='${owner}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`
  );
  try{
    await db.exec(`insert into auth.users(id) values ('${owner}')`);
    await asOwner();
    const company=(await db.query("select configurar_empresa('Oficina notificações','notificacoes-optin-2026','{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') id")).rows[0].id;
    const order=(await db.query("select criar_ordem($1,$2,$3,$4) id",[
      company,{nome:"Maria Teste",whatsapp:"11987654321"},{categoria:"Celular",marca:"Marca Teste",modelo:"Modelo X"},{problema:"Não carrega"},
    ])).rows[0].id;
    // Nenhum envio automático por padrão — mesmo se a OS ficar pronta.
    await assert.rejects(
      db.query("select configurar_aviso_whatsapp_ordem($1,true)",[order]),
      /Plus/i,
    );
    const initial=(await db.query("select status_aviso_whatsapp_ordem($1) as data",[order])).rows[0].data;
    assert.equal(initial.authorized,false);
    assert.equal(initial.hasNotification,false);

    await db.exec("reset role");
    await db.query(`update public.assinaturas set plano_id=(select id from public.planos where codigo='HORARIA_PRO') where empresa_id=$1`,[company]);
    await asOwner();
    await db.query("select configurar_aviso_whatsapp_ordem($1,true)",[order]);
    await db.query("update public.ordens_servico set status='pronto_retirada' where id=$1",[order]);
    assert.equal((await db.query("select count(*)::integer n from public.notificacoes where ordem_id=$1",[order])).rows[0].n,0);
    const off=(await db.query("select status_aviso_whatsapp_ordem($1) as data",[order])).rows[0].data;
    assert.equal(off.eligiblePlan,true);
    assert.equal(off.authorized,true);
    assert.equal(off.channelEnabled,false);

    // Nova OS, agora com canal explicitamente ativo.
    await db.exec("reset role");
    await db.query(`update public.empresas set feature_flags=jsonb_set(coalesce(feature_flags,'{}'::jsonb),'{whatsappEnabled}','true'::jsonb) where id=$1`,[company]);
    await asOwner();
    const second=(await db.query("select criar_ordem($1,$2,$3,$4) id",[
      company,{nome:"João Teste",whatsapp:"11998765432"},{categoria:"Celular",modelo:"Y"},{problema:"Tela quebrada"},
    ])).rows[0].id;
    await db.query("select configurar_aviso_whatsapp_ordem($1,true)",[second]);
    await db.query("update public.ordens_servico set status='pronto_retirada' where id=$1",[second]);
    const rows=(await db.query("select evento,status,payload from public.notificacoes where ordem_id=$1",[second])).rows;
    assert.equal(rows.length,1);
    assert.equal(rows[0].evento,"pronto_retirada");
    assert.equal(rows[0].status,"pendente");
    assert.equal(rows[0].payload.readyConsent,true);
    assert.equal(rows[0].payload.cliente,"João Teste");
    const status=(await db.query("select status_aviso_whatsapp_ordem($1) as data",[second])).rows[0].data;
    assert.equal(status.deliveryStatus,"pendente");
    assert.equal(status.hasNotification,true);
    await db.query("update public.ordens_servico set status='em_testes' where id=$1",[second]);
    await db.query("update public.ordens_servico set status='pronto_retirada' where id=$1",[second]);
    assert.equal((await db.query("select count(*)::integer n from public.notificacoes where ordem_id=$1",[second])).rows[0].n,1);
    await assert.rejects(db.query("select configurar_aviso_whatsapp_ordem($1,false)",[second]),/antes do reparo/);

    const another="cd000000-0000-4000-8000-000000000002";
    await db.exec(`reset role;insert into auth.users(id) values ('${another}')`);
    await db.exec(`set request.jwt.claim.sub='${another}';set request.jwt.claims='{"aal":"aal1"}';set role authenticated`);
    await assert.rejects(db.query("select status_aviso_whatsapp_ordem($1)",[second]),/não encontrada/);
    await assert.rejects(db.query("select configurar_aviso_whatsapp_ordem($1,true)",[second]),/sem autorização/);
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select status_aviso_whatsapp_ordem($1)",[second]),/permission denied/i);
  }finally{await db.close();}
});

test("Aviso pronto: no recebimento exige autorização e no detalhe exibe resultado sem disparo duplicado",()=>{
  const form=readFileSync("components/order-form.tsx","utf8");
  const detail=readFileSync("app/painel/ordens/[id]/page.tsx","utf8");
  const widget=readFileSync("components/order-ready-whatsapp.tsx","utf8");
  const worker=readFileSync("supabase/functions/whatsapp-notifications/index.ts","utf8");
  assert.match(form,/whatsappReadyConsent/);
  assert.match(form,/configurar_aviso_whatsapp_ordem/);
  assert.match(form,/isHorariaPlus\(access.billing\?\.planCode\)/);
  assert.match(detail,/<OrderReadyWhatsapp/);
  assert.match(widget,/status_aviso_whatsapp_ordem/);
  assert.match(widget,/Aviso enviado automaticamente/);
  assert.match(widget,/status==="processando" \|\| \(status==="pendente" &&/);
  assert.match(widget,/delivery\.authorized && delivery\.eligiblePlan && delivery\.channelEnabled/);
  assert.match(worker,/readyConsent !== true/);
  assert.doesNotMatch(form,/fetch\("https:\/\/graph.facebook.com/);
});
