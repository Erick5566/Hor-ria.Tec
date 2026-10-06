import { test } from "node:test";
import assert from "node:assert/strict";
import { savedPhotoHarness } from "./photo-ui-helper.mjs";
import { readFileSync } from "node:fs";

test("galeria salva: modal tem superfície opaca própria para leitura sobre fotos", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.saved-photo-modal\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /background:\s*var\(--white\)/);
  assert.match(rule, /color:\s*var\(--ink\)/);
});
test("galeria salva: cancelar confirmação de remoção não chama backend", async () => {
  const h = savedPhotoHarness({ confirm: false });
  await h.click("Remover foto");
  assert.equal(h.calls.length, 0);
  assert.equal(h.changed, 0);
});
test("galeria salva: substituição exige preview; cancelar não altera foto", async () => {
  const h = savedPhotoHarness();
  await h.click("Substituir foto");
  assert.ok(
    h.nodes("button").find((n) => n.props.children === "Salvar substituição")
      .props.disabled,
  );
  await h.choose(new File(["image"], "test.jpg", { type: "image/jpeg" }));
  assert.equal(h.nodes("img")[0].props.alt, "Preview da nova foto");
  assert.equal(h.calls.length, 0);
  await h.click("Cancelar");
  assert.equal(h.nodes("img").length, 0);
  assert.equal(h.calls.length, 0);
});
test("galeria salva: salvar mantém identificação da foto e usa nova imagem", async () => {
  const file = new File(["image"], "test.jpg", { type: "image/jpeg" });
  const h = savedPhotoHarness();
  await h.click("Substituir foto");
  await h.choose(file);
  await h.click("Salvar substituição");
  assert.deepEqual(Array.from(h.calls[0]), ["order", "photo", file]);
  assert.equal(h.changed, 1);
  assert.equal(h.state[0], false);
});
test("galeria salva: falha parcial de limpeza informa pendência mesmo após remoção", async () => {
  const h = savedPhotoHarness({ cleanup: false });
  await h.click("Remover foto");
  assert.equal(h.changed, 1);
  assert.equal(h.pending, 1);
  assert.equal(h.calls[0][2], undefined);
});
test("galeria salva: double submit bloqueado durante alteração", async () => {
  let finish;
  const h = savedPhotoHarness({
    correct: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  await h.click("Remover foto");
  await h.click("Remover foto");
  assert.equal(h.calls.length, 1);
  finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.changed, 1);
});
test("galeria salva: erro mantém preview e permite reconciliação", async () => {
  const h = savedPhotoHarness({
    correct: async () => {
      throw Error("database failed");
    },
  });
  await h.click("Substituir foto");
  await h.choose(new File(["image"], "test.jpg", { type: "image/jpeg" }));
  await h.click("Salvar substituição");
  assert.equal(h.state[0], true);
  assert.ok(h.state[3]);
  assert.ok(h.state[5].includes("database failed"));
});
