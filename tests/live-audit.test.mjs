import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { database } from "./helpers.mjs";

test("auditoria transacional: tenants, papéis, orçamento de 300 e receita única", async () => {
  const db = await database();
  try {
    await db.exec(await readFile("tests/live-audit-rollback.sql", "utf8"));
  } finally {
    await db.close();
  }
});

test("finalização: preserva recebimentos anteriores e gera somente o saldo pendente", async () => {
  const db = await database();
  try {
    const owner = "a0000000-0000-4000-8000-000000000001";
    await db.exec(
      `insert into auth.users values('${owner}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const company = (
      await db.query(
        `select configurar_empresa('Saldo OS','saldo-os','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    for (const previous of [80, 300]) {
      const order = (
        await db.query("select criar_ordem($1,$2,$3,$4) id", [
          company,
          {
            nome: "Cliente Saldo",
            whatsapp: previous === 80 ? "11900000001" : "11900000002",
          },
          { categoria: "Celular", modelo: "Teste" },
          { problema: "Tela quebrada" },
        ])
      ).rows[0].id;
      await db.query("select confirmar_entrada($1)", [order]);
      const quote = (
        await db.query(
          "select salvar_orcamento($1,'[]','[]',300,0,current_date+7) id",
          [order],
        )
      ).rows[0].id;
      await db.query("select enviar_orcamento($1)", [quote]);
      await db.query("select responder_orcamento($1,'aprovado')", [quote]);
      await db.query(
        "insert into financeiro(empresa_id,ordem_id,descricao,tipo,valor,status,vencimento,pago_em,origem) values($1,$2,'Pagamento anterior','receita',$3,'pago',current_date,current_date,'reparo')",
        [company, order, previous],
      );
      await db.query(
        "update ordens_servico set status='finalizado' where id=$1",
        [order],
      );
      await db.query(
        "update ordens_servico set status='finalizado' where id=$1",
        [order],
      );
      const entries = (
        await db.query(
          "select valor,status from financeiro where ordem_id=$1 order by status",
          [order],
        )
      ).rows;
      assert.equal(
        entries.reduce((sum, row) => sum + Number(row.valor), 0),
        300,
      );
      assert.equal(entries.filter((row) => row.status === "pago").length, 1);
      assert.equal(
        entries.filter((row) => row.status === "pendente").length,
        previous === 80 ? 1 : 0,
      );
      if (previous === 80)
        assert.equal(
          Number(entries.find((row) => row.status === "pendente").valor),
          220,
        );
    }
  } finally {
    await db.close();
  }
});

