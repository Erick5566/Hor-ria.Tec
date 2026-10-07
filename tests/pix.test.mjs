import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function loadPixModule() {
  const source = await readFile(
    new URL("../lib/pix.ts", import.meta.url),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(
    `(function(module,exports,require){${transpiled}})(module,module.exports,require)`,
    { module, require },
  );
  return module.exports;
}

test("pix: gera payload BR Code com chave, valor e CRC válido", async () => {
  const { buildPixPayload, pixCrc16 } = await loadPixModule();
  const payload = buildPixPayload({
    key: "veniciuskiwify@gmail.com",
    amount: 44.99,
    merchantName: "Horária",
    merchantCity: "Camaçari",
    description: "Pagamento inicial Horária",
  });

  assert.match(payload, /^000201/);
  assert.ok(payload.includes("veniciuskiwify@gmail.com"));
  assert.ok(payload.includes("540544.99"));
  assert.ok(payload.includes("5802BR"));
  assert.ok(payload.includes("5907HORARIA"));
  assert.ok(payload.includes("6008CAMACARI"));
  assert.ok(payload.includes("62070503***"));

  const body = payload.slice(0, -4);
  assert.equal(payload.slice(-4), pixCrc16(body));
});

test("pix: usa valor inicial apenas durante o trial", async () => {
  const { getSubscriptionPixPayment } = await loadPixModule();

  assert.equal(getSubscriptionPixPayment("TRIAL").amount, 44.99);
  assert.equal(getSubscriptionPixPayment(null).amount, 44.99);
  assert.equal(getSubscriptionPixPayment("ACTIVE").amount, 49);
  assert.equal(getSubscriptionPixPayment("PAST_DUE").amount, 49);
  assert.equal(getSubscriptionPixPayment("SUSPENDED").amount, 49);
  assert.equal(getSubscriptionPixPayment("CANCELED").amount, 49);
});

test("pix: rejeita chave vazia e valores inválidos", async () => {
  const { buildPixPayload } = await loadPixModule();

  assert.throws(() =>
    buildPixPayload({
      key: "",
      amount: 49,
      merchantName: "Horária",
      merchantCity: "Camaçari",
    }),
  );

  assert.throws(() =>
    buildPixPayload({
      key: "veniciuskiwify@gmail.com",
      amount: 0,
      merchantName: "Horária",
      merchantCity: "Camaçari",
    }),
  );
});

test("pix: trial vencido sem pagamento aprovado mantém R$44,99, enquanto renovação custa R$49", async () => {
  const { getSubscriptionPixPayment } = await loadPixModule();
  assert.equal(getSubscriptionPixPayment("PAST_DUE", false).amount, 44.99);
  assert.equal(getSubscriptionPixPayment("SUSPENDED", false).amount, 44.99);
  assert.equal(getSubscriptionPixPayment("PAST_DUE", true).amount, 49);
  assert.equal(getSubscriptionPixPayment("TRIAL", true).amount, 49);
});
