import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  new URL("../components/device-fields.tsx", import.meta.url),
  "utf8",
);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test("agendamento público mantém os PNGs originais dos cinco aparelhos", () => {
  const images = {
    "Fone de ouvido": "fone.png",
    Celular: "celular.png",
    Notebook: "notebook.png",
    Tablet: "tablet.png",
    Outro: "outros.png",
  };

  for (const [category, file] of Object.entries(images)) {
    assert.ok(
      component.includes(`"${category}": "/devices/${file}"`),
      `O card ${category} precisa usar o PNG original`,
    );

    const asset = readFileSync(
      new URL(`../public/devices/${file}`, import.meta.url),
    );
    assert.ok(
      asset.subarray(0, pngSignature.length).equals(pngSignature),
      `O arquivo ${file} precisa ser um PNG válido`,
    );
  }

  assert.match(component, /className="device-card-image"/);
  assert.doesNotMatch(component, /onError=\{\(\) => setFailed\(true\)\}/);
});
