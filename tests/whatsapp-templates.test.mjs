import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";
import {
  WHATSAPP_TEMPLATES,
  renderWhatsappTemplate,
  validateWhatsappTemplate,
  whatsappPhone,
  whatsappUrl,
  whatsappMessageContext,
} from "../lib/whatsapp-templates.ts";

test("Modelos WhatsApp: variáveis, valores ausentes, URLs e validação", () => {
  const token = "e3401b30-8717-4526-86c1-5a92fb71d1d1";
  const context = whatsappMessageContext({
    clientName: "Ana Silva", deviceModel: "Galaxy A32", storeName: "Assistência Centro",
    trackingToken: token,
  });
  const output = renderWhatsappTemplate(
    "{nome_cliente} / {aparelho} / {nome_loja} / {link_orcamento} / {link_acompanhamento}",
    context,
  );
  assert.match(output, /Ana Silva \/ Galaxy A32 \/ Assistência Centro/);
  assert.equal(output.match(/https:\/\/horaria\.site\/acompanhar\//g).length, 2);
  assert.ok(!output.includes("{"));
  assert.equal(renderWhatsappTemplate(
    "Olá, {nome_cliente}! Seu {aparelho}: {link_orcamento}. {desconhecida}",
    {},
  ), "Olá, cliente! Seu aparelho: link indisponível. informação indisponível");
  assert.ok(validateWhatsappTemplate("{variavel_falsa}"));
  assert.ok(validateWhatsappTemplate(" "));
  assert.ok(validateWhatsappTemplate("x".repeat(1601)));
  assert.equal(validateWhatsappTemplate(WHATSAPP_TEMPLATES.orcamento.defaultText), "");
  assert.equal(whatsappPhone("(85) 99999-9999"), "5585999999999");
  assert.equal(whatsappPhone("+55 (85) 99999-9999"), "5585999999999");
  assert.equal(whatsappPhone("123"), null);
  assert.equal(whatsappUrl("123", "Olá"), null);
  assert.equal(whatsappUrl("85999999999", "Olá, Ana!"), "https://wa.me/5585999999999?text=Ol%C3%A1%2C%20Ana!");
});

test("Modelos por empresa: acesso restrito e mensagem personalizada no evento real", async () => {
  const db = await database();
  const owner = "ca300000-0000-4000-8000-000000000001";
  const other = "ca300000-0000-4000-8000-000000000002";
  const authOwner = async () => db.exec(
    "reset role;set request.jwt.claim.sub='" + owner + "';set request.jwt.claims='{\"aal\":\"aal1\"}';set role authenticated",
  );
  try {
    await db.exec("insert into auth.users(id) values ('" + owner + "'),('" + other + "')");
    await authOwner();
    const company = (await db.query(
      "select configurar_empresa('Assistência Teste','test-templates-wa-2026','{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') id",
    )).rows[0].id;
    const order = (await db.query("select criar_ordem($1,$2,$3,$4) id", [
      company,
      { nome: "Ana Exemplo", whatsapp: "85988887777" },
      { categoria: "Celular", marca: "Samsung", modelo: "A32" },
      { problema: "Não liga" },
    ])).rows[0].id;

    await db.query(
      "insert into public.mensagens_whatsapp_templates(empresa_id,tipo,conteudo) values ($1,'orcamento','Olá, {nome_cliente}! Orçamento do {aparelho}: {link_orcamento} — {nome_loja}')",
      [company],
    );

    await assert.rejects(db.query(
      "insert into public.mensagens_whatsapp_templates(empresa_id,tipo,conteudo) values ($1,'pronto_retirada','{invalida}')",
      [company],
    ), /check constraint/i);

    const quote = (await db.query(
      "select salvar_orcamento($1,'[]','[]',90,0,current_date+7) id", [order],
    )).rows[0].id;
    await db.query("select enviar_orcamento($1)", [quote]);
    const msg = (await db.query(
      "select mensagem from public.notificacoes where orcamento_id=$1 and evento='orcamento_enviado'",
      [quote],
    )).rows[0].mensagem;
    assert.match(msg, /Olá, Ana Exemplo! Orçamento do Samsung A32:/);
    assert.match(msg, /https:\/\/horaria\.site\/acompanhar\//);
    assert.match(msg, /Assistência Teste/);
    assert.doesNotMatch(msg, /\{[a-z_]+\}/);

    await db.exec("reset role;set request.jwt.claim.sub='" + other + "';set role authenticated");
    assert.equal((await db.query(
      "select count(*)::integer n from public.mensagens_whatsapp_templates where empresa_id=$1",
      [company],
    )).rows[0].n, 0);
    await assert.rejects(db.query(
      "insert into public.mensagens_whatsapp_templates(empresa_id,tipo,conteudo) values ($1,'pronto_retirada','Outra loja')",
      [company],
    ), /row-level security|permission denied/i);
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query(
      "select * from public.mensagens_whatsapp_templates",
    ), /permission denied/i);

    await db.exec("reset role");
    const fallback = (await db.query(
      "select private.render_whatsapp_template($1,'pronto_retirada','', '',null) value", [company],
    )).rows[0].value;
    assert.match(fallback, /Olá, cliente!/);
    assert.match(fallback, /Seu aparelho/);
    assert.match(fallback, /link indisponível/);
  } finally {
    await db.close();
  }
});
