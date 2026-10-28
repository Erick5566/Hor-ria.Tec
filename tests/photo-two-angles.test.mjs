import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  guidedPhotoAngles,
  hasFrontAndBack,
  onlyFrontAndBack,
} from "../lib/photo-angles.ts";

function photo(angulo, id) {
  return { id, angulo, file: null, preview: "blob:" + id, categoria: "Entrada", descricao: "" };
}

test("O registro de entrada limita-se à frente e à traseira", () => {
  assert.deepEqual([...guidedPhotoAngles], ["Frente", "Traseira"]);
  assert.equal(hasFrontAndBack([]), false);
  assert.equal(hasFrontAndBack([photo("Frente", "a")]), false);
  assert.equal(hasFrontAndBack([photo("Traseira", "b")]), false);
  assert.equal(hasFrontAndBack([photo("Frente", "a"), photo("Traseira", "b")]), true);
});

test("Rascunhos de sete fotos são normalizados para duas sem misturar etapas", () => {
  const old = [
    photo("Frente", "old-front"),
    photo("Laterais", "side"),
    photo("Tela", "screen"),
    photo("Traseira", "back"),
    photo("Conectores", "ports"),
    photo("Acessórios", "accessories"),
    photo("Área danificada", "damage"),
    photo("Frente", "new-front"),
  ];
  const reduced = onlyFrontAndBack(old);
  assert.deepEqual(reduced.map((p) => p.angulo), ["Frente", "Traseira"]);
  assert.deepEqual(reduced.map((p) => p.id), ["new-front", "back"]);
  assert.equal(old.length, 8, "a lista original não pode ser mutada");
});

test("Abertura e aba de fotos usam somente os dois cartões, com opção de câmera/galeria", () => {
  const photos = readFileSync("components/photos.tsx", "utf8");
  const form = readFileSync("components/order-form.tsx", "utf8");
  const settings = readFileSync("components/system-settings.tsx", "utf8");
  assert.match(photos, /guidedPhotoAngles\.map/);
  assert.match(photos, /"Tirar foto"/);
  assert.match(photos, /Galeria/);
  assert.match(photos, /photo-two-grid/);
  assert.doesNotMatch(photos, /7 de 7 revisadas|Pular esta foto|Câmera ao vivo \/ webcam|Até 15 fotos/);
  assert.match(form, /onlyFrontAndBack\(draftPhotos\)/);
  assert.match(form, /empresa\.fotos_obrigatorias && !hasFrontAndBack\(photos\)/);
  assert.match(form, /required=\{Boolean\(empresa\.fotos_obrigatorias\)\}/);
  assert.match(settings, /Exigir fotos de frente e traseira/);
  assert.match(photos, /async function saveCameraPhoto\(file: File, angle: PhotoAngle\)/);
  assert.match(photos, /angulo: angle/);
});
