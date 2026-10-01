import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function loadPixModule() {
  const source = await readFile(new URL("../lib/pix.ts", import.meta.url), "utf8");
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
    amount: 59,
    merchantName: "Horária",
    merchantCity: "Camaçari",
    description: "Mensalidade Horária",
  });

  assert.match(payload, /^000201/);
  assert.ok(payload.includes("veniciuskiwify@gmail.com"));
  assert.ok(payload.includes("540559.00"));
  assert.ok(payload.includes("5802BR"));
  assert.ok(payload.includes("5907HORARIA"));
  assert.ok(payload.includes("6008CAMACARI"));
  assert.ok(payload.includes("62070503***"));

  const body = payload.slice(0, -4);
  assert.equal(payload.slice(-4), pixCrc16(body));
});

test("pix: rejeita chave vazia e valores inválidos", async () => {
  const { buildPixPayload } = await loadPixModule();

  assert.throws(() =>
    buildPixPayload({
      key: "",
      amount: 59,
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
