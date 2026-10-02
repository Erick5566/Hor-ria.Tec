import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home: preserva o design da etiqueta e os fluxos reais", async () => {
  const [page, landing, css, auth] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("components/home-landing.tsx", "utf8"),
    readFile("app/home.module.css", "utf8"),
    readFile("components/auth-page.tsx", "utf8"),
  ]);

  assert.match(page, /getServerAccess/);
  assert.match(page, /HomeLanding/);
  assert.match(landing, /Todo aparelho que entra/);
  assert.match(landing, /O QUE VOCÊ CONSERTA?/);
  assert.match(landing, /href="\/entrar"/);
  assert.match(landing, /\/cadastro\?empresa=/);
  assert.match(css, /#1236a8/);
  assert.match(css, /#f4f1e8/);
  assert.match(css, /clip-path/);
  assert.match(auth, /styles\.authTagCard/);
  assert.match(auth, /HorariaHeroBrand/);
  assert.match(auth, /defaultValue=\{search\.get\("empresa"\) \?\? ""\}/);
});
