import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { createRequire } from "node:module";
import { database } from "./helpers.mjs";
const require = createRequire(import.meta.url);
function load(file, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require,
    Intl,
    Date,
    File,
    Blob,
    URL,
    ...globals,
  });
  return exports;
}
test("recebimento: data pura e horário Fortaleza sobrevivem à gravação e virada UTC", () => {
  const d = load("lib/receipt-dates.ts");
  assert.equal(d.localDay("2026-09-30T01:30:00Z"), "2026-09-29");
  assert.equal(d.formatDelivery("2026-09-30"), "30/09/2026");
  assert.equal(
    d.localDateTime(d.saveLocalDateTime("2026-09-29T23:30")),
    "2026-09-29T23:30",
  );
  assert.throws(
    () => d.validateDelivery("2026-09-28", "2026-09-30T01:30:00Z"),
    /anterior/,
  );
  assert.throws(() => d.validateDelivery("2026-02-30", "2026-01-01"), /válida/);
  assert.equal(
    d.deliveryState("2026-09-29", "novo", new Date("2026-09-30T01:30:00Z")),
    "Entrega vence hoje",
  );
  assert.equal(
    d.deliveryState("2026-09-28", "novo", new Date("2026-09-30T01:30:00Z")),
    "Entrega atrasada",
  );
  assert.equal(d.deliveryState("2026-09-28", "finalizado"), "");
});
function cameraHarness(getUserMedia, secure = true) {
  const hooks = [],
    cleanups = [];
  let index = 0,
    tree,
    initial = true;
  const media = {
    srcObject: null,
    videoWidth: 2400,
    videoHeight: 1800,
    play: async () => {},
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob: (fn) => fn(new Blob(["photo"], { type: "image/jpeg" })),
  };
  const jsx = require("react/jsx-runtime");
  const mocks = {
    react: {
      ...React,
      useRef(value) {
        const i = index++;
        return (hooks[i] ||= { current: value });
      },
      useState(value) {
        const i = index++;
        if (!(i in hooks)) hooks[i] = value;
        return [hooks[i], (v) => (hooks[i] = v)];
      },
      useCallback(fn) {
        index++;
        return fn;
      },
      useEffect(fn) {
        index++;
        if (initial) cleanups.push(fn());
      },
    },
    "react-dom": { createPortal: (node) => node },
    "./ui": { ErrorBox: () => null },
  };
  const C = load("components/inline-camera.tsx", {
    require: (n) => mocks[n] || (n === "react/jsx-runtime" ? jsx : require(n)),
    navigator: {
      mediaDevices: {
        getUserMedia,
        enumerateDevices: async () => [
          { kind: "videoinput", deviceId: "rear", label: "Traseira" },
          { kind: "videoinput", deviceId: "front", label: "Frontal" },
        ],
      },
    },
    window: {
      isSecureContext: secure,
      addEventListener() {},
      removeEventListener() {},
    },
    document: {
      body: { style: {} },
      addEventListener() {},
      removeEventListener() {},
      createElement: () => canvas,
    },
  }).default;
  const all = (node, type) =>
    !node || typeof node !== "object"
      ? []
      : [
          ...(node.type === type ? [node] : []),
          ...React.Children.toArray(node.props?.children).flatMap((c) =>
            all(c, type),
          ),
        ];
  const render = () => {
    index = 0;
    tree = C({ onUse() {}, onClose() {} });
    initial = false;
    all(tree, "video")[0].props.ref.current = media;
  };
  render();
  return {
    render,
    nodes: (t) => all(tree, t),
    click: async (label) => {
      const b = all(tree, "button").find(
        (n) => n.props.children === label || n.props["aria-label"] === label,
      );
      assert.ok(b, label);
      b.props.onClick();
      await new Promise((r) => setTimeout(r, 0));
      render();
    },
    close: () => cleanups.forEach((fn) => fn?.()),
    canvas,
  };
}
const fakeStream = () => {
  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
    getSettings() {
      return { deviceId: "rear" };
    },
  };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
};
test("câmera: somente por clique, atributos Safari, captura 1600px e stream liberado", async () => {
  const stream = fakeStream();
  let calls = 0;
  const h = cameraHarness(async (c) => {
    calls++;
    assert.equal(c.video.facingMode.ideal, "environment");
    return stream;
  });
  assert.equal(calls, 0);
  const p = h.nodes("video")[0].props;
  assert.ok(p.autoPlay && p.muted && p.playsInline);
  await h.click("Ativar câmera");
  assert.equal(calls, 1);
  await h.click("Tirar foto");
  assert.equal(stream.track.stopped, true);
  assert.equal(h.canvas.width, 1600);
  assert.equal(h.canvas.height, 1200);
  assert.equal(h.nodes("img").length, 1);
  h.close();
});
test("câmera: permissão tardia após desmontagem não deixa câmera ligada", async () => {
  let resolve;
  const stream = fakeStream();
  const h = cameraHarness(() => new Promise((r) => (resolve = r)));
  await h.click("Ativar câmera");
  h.close();
  resolve(stream);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(stream.track.stopped);
});
test("câmera: troca libera stream anterior e negativa mantém alternativas de arquivo", async () => {
  const first = fakeStream(),
    second = fakeStream();
  let calls = 0;
  const h = cameraHarness(async (c) => {
    calls++;
    if (calls === 2) assert.equal(c.video.facingMode.ideal, "user");
    return calls === 1 ? first : second;
  });
  await h.click("Ativar câmera");
  await h.click("Alternar frontal/traseira");
  assert.ok(first.track.stopped);
  h.close();
  assert.ok(second.track.stopped);
  const denied = cameraHarness(async () => {
    const e = new Error("denied");
    e.name = "NotAllowedError";
    throw e;
  });
  await denied.click("Ativar câmera");
  assert.equal(
    denied.nodes("input").filter((n) => n.props.type === "file").length,
    2,
  );
  assert.equal(denied.nodes("input")[0].props.capture, "environment");
  denied.close();
});
test("recebimento: banco conserva YYYY-MM-DD e rejeita entrega anterior à entrada", async () => {
  const db = await database();
  try {
    await db.exec(
      "insert into auth.users values('10000000-0000-0000-0000-000000000001');set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';set role authenticated",
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Recebimento','receipt-test','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    const oid = (
      await db.query(
        `select criar_ordem($1,$2::jsonb,$3::jsonb,$4::jsonb) id`,
        [
          eid,
          { nome: "Cliente Teste", whatsapp: "11999999999" },
          { categoria: "Notebook", modelo: "Teste" },
          { problema: "Não liga" },
        ],
      )
    ).rows[0].id;
    const day = (
      await db.query(
        "select (now() at time zone 'America/Fortaleza')::date::text d",
      )
    ).rows[0].d;
    await db.query("update ordens_servico set previsao=$1::date where id=$2", [
      day,
      oid,
    ]);
    assert.equal(
      (
        await db.query(
          "select previsao::text d from ordens_servico where id=$1",
          [oid],
        )
      ).rows[0].d,
      day,
    );
    await assert.rejects(
      db.query("update ordens_servico set previsao=$1::date-1 where id=$2", [
        day,
        oid,
      ]),
      /anterior/,
    );
  } finally {
    await db.close();
  }
});
