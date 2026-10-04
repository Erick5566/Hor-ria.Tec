import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

async function harness(slug) {
  let handler;
  const calls = [];
  const source = (
    await readFile(`supabase/functions/${slug}/index.ts`, "utf8")
  ).replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText,
    {
      Request,
      Response,
      TextEncoder,
      URLSearchParams,
      crypto: webcrypto,
      Deno: {
        serve: (fn) => {
          handler = fn;
        },
        env: {
          get: (key) =>
            ({
              SUPABASE_URL: "https://isolated.invalid",
              SUPABASE_SERVICE_ROLE_KEY: "isolated-key",
              SUPABASE_ANON_KEY: "isolated-public",
            })[key],
        },
      },
      createClient: () => {
        calls.push("client");
        throw new Error("Unexpected database access");
      },
      fetch: () => {
        throw new Error("Unexpected network access");
      },
    },
  );
  return {
    calls,
    send: (raw) =>
      handler(
        new Request("https://isolated.invalid", {
          method: "POST",
          body: raw,
          headers: { authorization: "Bearer isolated-token" },
        }),
      ),
  };
}

for (const slug of [
  "public-booking",
  "public-tracking",
  "invite-team-member",
]) {
  test(`${slug}: JSON inválido ou sem objeto retorna 400 sem banco ou rede`, async () => {
    const h = await harness(slug);
    for (const raw of ["{", "null", "[]", "1", "true", '"text"']) {
      const response = await h.send(raw);
      assert.equal(response.status, 400, `${slug}: ${raw}`);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.ok(body.error);
    }
    assert.deepEqual(h.calls, []);
  });
}

