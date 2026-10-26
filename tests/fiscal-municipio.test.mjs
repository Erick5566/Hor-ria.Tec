import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/fiscal-municipio.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { resolverMunicipio, ufValida, normalizarMunicipio, codigoMunicipioCompativel } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

function mockFetch(ibge, brasilApi) {
  return async (url) => {
    const value = url.includes("servicodados.ibge.gov.br") ? ibge : brasilApi;
    if (value instanceof Error) throw value;
    return { ok: true, json: async () => value };
  };
}

const camaçari = [{ id: 2905701, nome: "Camaçari" }];
const backup = [{ codigo_ibge: "2905701", nome: "CAMACARI" }];

test("fiscal: resolve município pelo IBGE e ignora diferenças de acentos", async () => {
  const result = await resolverMunicipio("Camacari", "BA", mockFetch(camaçari, backup));
  assert.deepEqual(result, { municipio: { codigo: "2905701", cidade: "Camaçari", uf: "BA" }, disponivel: true });
});

test("fiscal: usa BrasilAPI quando IBGE falha", async () => {
  const result = await resolverMunicipio("Camaçari", "BA", mockFetch(new Error("timeout"), backup));
  assert.equal(result.municipio?.codigo, "2905701");
  assert.equal(result.disponivel, true);
});

test("fiscal: distingue indisponibilidade de município inexistente", async () => {
  const unavailable = await resolverMunicipio("Camaçari", "BA", mockFetch(new Error("timeout"), new Error("503")));
  assert.deepEqual(unavailable, { municipio: null, disponivel: false });
  const missing = await resolverMunicipio("Cidade inexistente", "BA", mockFetch(camaçari, backup));
  assert.deepEqual(missing, { municipio: null, disponivel: true });
});

test("fiscal: não aceita correspondência aproximada nem código de outra UF", async () => {
  const partial = await resolverMunicipio("Cama", "BA", mockFetch(camaçari, backup));
  assert.equal(partial.municipio, null);
  const wrongCode = await resolverMunicipio("Camaçari", "BA", mockFetch([], [{ codigo_ibge: "3550308", nome: "Camaçari" }]));
  assert.equal(wrongCode.municipio, null);
  assert.equal(codigoMunicipioCompativel("2905701", "BA"), true);
  assert.equal(codigoMunicipioCompativel("3550308", "BA"), false);
  assert.equal(codigoMunicipioCompativel("290570", "BA"), false);
  assert.equal(codigoMunicipioCompativel("2999999", "BA"), true); // Faixa da UF, existência do município depende do IBGE.
  assert.equal(ufValida("ZZ"), false);
  assert.equal(normalizarMunicipio("  São   José d'Ávila "), "sao jose d avila");
});
