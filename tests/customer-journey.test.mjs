import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("jornada completa: solicitação pública até retirada e acompanhamento", async () => {
  const db = await database();

  try {
    const owner = "10000000-0000-4000-8000-000000000120";

    await db.exec(
      `insert into auth.users values('${owner}');
       set request.jwt.claim.sub='${owner}';
       set role authenticated;`,
    );

    const company = (
      await db.query(
        `select configurar_empresa(
          'Jornada Horária',
          'jornada-horaria',
          '{}',
          false,
          '[{"nome":"Diagnóstico","duracao":30}]'
        ) as id`,
      )
    ).rows[0].id;

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='';
       set request.jwt.claims='{"role":"service_role"}';
       set role service_role;`,
    );

    const receipt = (
      await db.query(
        `select solicitar_reparo(
          'jornada-horaria',
          $1,
          $2,
          'Aparelho não liga'
        ) as result`,
        [
          {
            nome: "Cliente Jornada",
            whatsapp: "71999999999",
            email: "cliente@example.invalid",
          },
          {
            categoria: "Celular",
            marca: "Apple",
            modelo: "iPhone 15",
            cor: "Preto",
          },
        ],
      )
    ).rows[0].result;

    assert.equal(receipt.empresa_id, company);
    assert.ok(receipt.id);
    assert.match(receipt.codigo, /^[A-F0-9]{16}$/);

    const token = (
      await db.query(
        "select token_acompanhamento from public.ordens_servico where id=$1",
        [receipt.id],
      )
    ).rows[0].token_acompanhamento;

    const initialTracking = (
      await db.query("select acompanhar_por_token($1) as result", [token])
    ).rows[0].result;

    assert.equal(initialTracking.equipamento.modelo, "iPhone 15");
    assert.equal(initialTracking.problema, "Aparelho não liga");
    assert.ok(!JSON.stringify(initialTracking).includes("71999999999"));

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='${owner}';
       set request.jwt.claims='{}';
       set role authenticated;`,
    );

    await db.query("select confirmar_entrada($1)", [receipt.id]);

    const quote = (
      await db.query(
        `select salvar_orcamento(
          $1,
          $2,
          '[]'::jsonb,
          80,
          0,
          current_date + 7
        ) as id`,
        [
          receipt.id,
          [{ nome: "Reparo da placa", quantidade: 1, valor: 220 }],
        ],
      )
    ).rows[0].id;

    await db.query("select enviar_orcamento($1)", [quote]);

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='';
       set request.jwt.claims='{"role":"service_role"}';
       set role service_role;`,
    );

    const trackingWithQuote = (
      await db.query("select acompanhar_por_token($1) as result", [token])
    ).rows[0].result;

    assert.equal(trackingWithQuote.orcamento.id, quote);
    assert.equal(trackingWithQuote.orcamento.status, "enviado");
    assert.equal(Number(trackingWithQuote.orcamento.total), 300);

    await db.query(
      "select responder_orcamento_link($1,'aprovado',null,$2)",
      [quote, token],
    );

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='${owner}';
       set request.jwt.claims='{}';
       set role authenticated;`,
    );

    assert.equal(
      (
        await db.query(
          "select status from public.ordens_servico where id=$1",
          [receipt.id],
        )
      ).rows[0].status,
      "orcamento_aprovado",
    );

    await db.query(
      "update public.ordens_servico set status='em_reparo' where id=$1",
      [receipt.id],
    );
    await db.query(
      "update public.ordens_servico set status='em_testes' where id=$1",
      [receipt.id],
    );
    await db.query(
      "update public.ordens_servico set status='pronto_retirada' where id=$1",
      [receipt.id],
    );

    assert.equal(
      Number(
        (
          await db.query(
            `select count(*) as total
             from public.notificacoes
             where ordem_id=$1 and evento='pronto_retirada'`,
            [receipt.id],
          )
        ).rows[0].total,
      ),
      1,
    );

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='';
       set request.jwt.claims='{"role":"service_role"}';
       set role service_role;`,
    );

    const readyTracking = (
      await db.query("select acompanhar_por_token($1) as result", [token])
    ).rows[0].result;

    assert.equal(readyTracking.status, "pronto_retirada");
    assert.equal(readyTracking.orcamento.status, "aprovado");
    assert.ok(!JSON.stringify(readyTracking).includes("cliente@example.invalid"));

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='${owner}';
       set request.jwt.claims='{}';
       set role authenticated;`,
    );

    await db.query(
      "update public.ordens_servico set status='finalizado' where id=$1",
      [receipt.id],
    );

    await db.exec(
      `reset role;
       set request.jwt.claim.sub='';
       set request.jwt.claims='{"role":"service_role"}';
       set role service_role;`,
    );

    const finishedTracking = (
      await db.query("select acompanhar_por_token($1) as result", [token])
    ).rows[0].result;

    assert.equal(finishedTracking.status, "finalizado");
  } finally {
    await db.close();
  }
});
