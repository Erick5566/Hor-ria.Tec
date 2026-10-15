import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";

test("Básico mantém R$44,99 na entrada e em todas as renovações", async () => {
  const db = await database();
  try {
    const result = await db.query(
      "select initial_payment_amount, monthly_payment_amount from public.configuracoes_plataforma where id is true",
    );
    assert.equal(Number(result.rows[0].initial_payment_amount), 44.99);
    assert.equal(Number(result.rows[0].monthly_payment_amount), 44.99);
    const column = await db.query(
      "select column_default from information_schema.columns where table_schema='public' and table_name='configuracoes_plataforma' and column_name='monthly_payment_amount'",
    );
    assert.ok(column.rows[0].column_default.includes("44.99"));
  } finally {
    await db.close();
  }
});
